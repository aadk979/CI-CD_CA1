import type { PrismaClient } from '@/generated/prisma/client';
import { isOnSale } from './events';
import {
  chargeCard,
  parseCardNumber,
  refundPayment,
  type ChargeRequest,
  type ChargeResult,
} from './payments';
import { compareRowLabels } from './seating';

/**
 * Checkout and orders (SCRUM-39/40). Framework-free: the Server Action and pages wrap
 * these, and the integration tests run them against a real database.
 *
 * Checkout charges the card first, then converts the fan's holds to sales in one
 * transaction. The conversion re-checks every hold is still live, so a hold that lapsed
 * mid-payment (or was taken by the expiry job) fails the whole order and the payment is
 * refunded: a fan is never charged for seats they didn't get, and never gets half an order.
 */

export interface CartItem {
  reservationId: string;
  seatId: string;
  section: string;
  row: string;
  number: number;
  tierName: string;
  priceCents: number;
}

export interface Cart {
  eventId: string;
  items: CartItem[];
  totalCents: number;
  currency: string;
  /** When the holds lapse (one timer per cart). */
  expiresAt: Date;
}

export type CheckoutErrorCode =
  'invalid-card' | 'declined' | 'no-holds' | 'expired' | 'not-on-sale';

export type CheckoutResult =
  | { ok: true; orderId: string; totalCents: number; currency: string; seats: number }
  | { ok: false; code: CheckoutErrorCode; message: string };

export const CHECKOUT_MESSAGES: Record<CheckoutErrorCode, string> = {
  'invalid-card': 'Enter a valid 16-digit card number.',
  declined: 'Your card was declined. Your seats are still held: try another card.',
  'no-holds': 'You have no seats on hold for this event. Your hold may have expired.',
  expired: 'Your hold expired before payment completed. You have not been charged.',
  'not-on-sale': 'Tickets for this event are not on sale.',
};

const fail = (code: CheckoutErrorCode): CheckoutResult => ({
  ok: false,
  code,
  message: CHECKOUT_MESSAGES[code],
});

type SeatPlace = { section: string; row: string; number: number };

/** Section, then row (A, B, … Z, AA), then seat number. */
const byPosition = (a: SeatPlace, b: SeatPlace) =>
  a.section.localeCompare(b.section) || compareRowLabels(a.row, b.row) || a.number - b.number;

/** The fan's live holds for an event, priced by each seat's tier. Null if they hold nothing. */
export async function getCart(
  prisma: PrismaClient,
  { eventId, userId, now = new Date() }: { eventId: string; userId: string; now?: Date },
): Promise<Cart | null> {
  const holds = await prisma.seatReservation.findMany({
    where: { eventId, userId, status: 'HELD', expiresAt: { gt: now } },
    select: {
      id: true,
      expiresAt: true,
      seat: {
        select: {
          id: true,
          row: true,
          number: true,
          section: {
            select: {
              name: true,
              priceTiers: {
                where: { eventId },
                select: { name: true, priceCents: true, currency: true },
              },
            },
          },
        },
      },
    },
  });
  if (holds.length === 0) return null;

  let currency = '';
  let expiresAt = holds[0].expiresAt!;
  const items: CartItem[] = [];
  for (const hold of holds) {
    // Holds are only ever placed on priced seats (see holdSeats), so a tier always exists.
    const tier = hold.seat.section.priceTiers[0];
    currency ||= tier.currency;
    if (hold.expiresAt! < expiresAt) expiresAt = hold.expiresAt!;
    items.push({
      reservationId: hold.id,
      seatId: hold.seat.id,
      section: hold.seat.section.name,
      row: hold.seat.row,
      number: hold.seat.number,
      tierName: tier.name,
      priceCents: tier.priceCents,
    });
  }
  items.sort(byPosition);
  const totalCents = items.reduce((sum, item) => sum + item.priceCents, 0);
  return { eventId, items, totalCents, currency, expiresAt };
}

/** Thrown inside the transaction to roll it back when a hold is no longer live. */
class HoldLapsedError extends Error {}

export interface CheckoutRequest {
  eventId: string;
  userId: string;
  cardNumber: unknown;
}

export interface CheckoutDeps {
  pay?: (request: ChargeRequest) => Promise<ChargeResult>;
  refund?: (paymentRef: string) => Promise<void>;
  /** Read twice: when pricing the cart, and again when converting holds after payment. */
  clock?: () => Date;
}

export async function checkout(
  prisma: PrismaClient,
  { eventId, userId, cardNumber }: CheckoutRequest,
  { pay = chargeCard, refund = refundPayment, clock = () => new Date() }: CheckoutDeps = {},
): Promise<CheckoutResult> {
  const card = parseCardNumber(cardNumber);
  if (!card) return fail('invalid-card');

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { status: true, startsAt: true },
  });
  if (!event || !isOnSale(event, clock())) return fail('not-on-sale');

  const cart = await getCart(prisma, { eventId, userId, now: clock() });
  if (!cart) return fail('no-holds');

  const charge = await pay({
    amountCents: cart.totalCents,
    currency: cart.currency,
    cardNumber: card,
  });
  if (!charge.ok) return fail(charge.code);

  try {
    const order = await prisma.$transaction(async (tx) => {
      const sold = await tx.seatReservation.updateMany({
        where: {
          id: { in: cart.items.map((i) => i.reservationId) },
          userId,
          status: 'HELD',
          expiresAt: { gt: clock() },
        },
        data: { status: 'SOLD', expiresAt: null },
      });
      if (sold.count !== cart.items.length) throw new HoldLapsedError();

      return tx.order.create({
        data: {
          userId,
          eventId,
          totalCents: cart.totalCents,
          currency: cart.currency,
          paymentRef: charge.paymentRef,
          tickets: {
            create: cart.items.map((i) => ({
              eventId,
              seatId: i.seatId,
              tierName: i.tierName,
              priceCents: i.priceCents,
            })),
          },
        },
        select: { id: true },
      });
    });
    return {
      ok: true,
      orderId: order.id,
      totalCents: cart.totalCents,
      currency: cart.currency,
      seats: cart.items.length,
    };
  } catch (err) {
    // Whatever went wrong, nothing was sold: give the money back.
    await refund(charge.paymentRef);
    if (err instanceof HoldLapsedError) return fail('expired');
    throw err;
  }
}

export interface OrderSummary {
  id: string;
  createdAt: Date;
  totalCents: number;
  currency: string;
  event: {
    slug: string;
    title: string;
    startsAt: Date;
    venue: string;
    city: string;
  };
  tickets: {
    id: string;
    section: string;
    row: string;
    number: number;
    tierName: string;
    priceCents: number;
  }[];
}

/** One fan's orders, newest first. Scoped by user id: nobody can list another fan's tickets. */
export async function listOrders(prisma: PrismaClient, userId: string): Promise<OrderSummary[]> {
  const orders = await prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      createdAt: true,
      totalCents: true,
      currency: true,
      event: {
        select: {
          slug: true,
          title: true,
          startsAt: true,
          venue: { select: { name: true, city: true } },
        },
      },
      tickets: {
        select: {
          id: true,
          tierName: true,
          priceCents: true,
          seat: { select: { row: true, number: true, section: { select: { name: true } } } },
        },
      },
    },
  });

  return orders.map((o) => ({
    id: o.id,
    createdAt: o.createdAt,
    totalCents: o.totalCents,
    currency: o.currency,
    event: {
      slug: o.event.slug,
      title: o.event.title,
      startsAt: o.event.startsAt,
      venue: o.event.venue.name,
      city: o.event.venue.city,
    },
    tickets: o.tickets
      .map((t) => ({
        id: t.id,
        section: t.seat.section.name,
        row: t.seat.row,
        number: t.seat.number,
        tierName: t.tierName,
        priceCents: t.priceCents,
      }))
      .sort(byPosition),
  }));
}
