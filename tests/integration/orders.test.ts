import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { disconnectPrisma, getPrisma } from '@/lib/db';
import { getSeatAvailability, holdSeats, releaseExpiredHolds } from '@/lib/holds';
import { CHECKOUT_MESSAGES, checkout, getCart, listOrders } from '@/lib/orders';
import { applyVenueLayout } from '@/lib/seating';
import { resetDatabase } from './helpers';

const prisma = getPrisma();
const MINUTE = 60_000;

afterAll(disconnectPrisma);

/** An on-sale event: Floor at $188 (Category 1), Balcony at $128 (Category 2); fans Ada and Bo. */
async function setup() {
  const venue = await prisma.venue.create({ data: { name: 'Hall', city: 'SG', capacity: 0 } });
  await applyVenueLayout(prisma, venue.id, [
    { code: 'FLR', name: 'Floor', rows: 2, seatsPerRow: 3 },
    { code: 'BAL', name: 'Balcony', rows: 1, seatsPerRow: 3 },
  ]);
  const event = await prisma.event.create({
    data: {
      slug: 'gig',
      title: 'Gig',
      startsAt: new Date(Date.now() + 7 * 86_400_000),
      status: 'ON_SALE',
      venueId: venue.id,
    },
  });
  const sections = await prisma.section.findMany({ where: { venueId: venue.id } });
  const floor = sections.find((s) => s.code === 'FLR')!;
  const balcony = sections.find((s) => s.code === 'BAL')!;
  await prisma.priceTier.createMany({
    data: [
      { eventId: event.id, sectionId: floor.id, name: 'Category 1', priceCents: 18800 },
      { eventId: event.id, sectionId: balcony.id, name: 'Category 2', priceCents: 12800 },
    ],
  });
  for (const id of ['ada', 'bo']) {
    await prisma.user.create({ data: { id, name: id, email: `${id}@example.com` } });
  }
  const seat = async (sectionId: string, row: string, number: number) =>
    (await prisma.seat.findFirstOrThrow({ where: { sectionId, row, number } })).id;
  return {
    eventId: event.id,
    floorB2: await seat(floor.id, 'B', 2),
    floorA3: await seat(floor.id, 'A', 3),
    balconyA1: await seat(balcony.id, 'A', 1),
  };
}

async function hold(eventId: string, userId: string, seatIds: string[], now = new Date()) {
  const result = await holdSeats(prisma, { eventId, userId, seatIds, now });
  if (!result.ok) throw new Error(`setup hold failed: ${result.message}`);
  return result.expiresAt;
}

describe('cart', () => {
  beforeEach(resetDatabase);

  it("prices each seat by its section's tier and totals them", async () => {
    const s = await setup();
    const expiresAt = await hold(s.eventId, 'ada', [s.balconyA1, s.floorB2, s.floorA3]);

    const cart = await getCart(prisma, { eventId: s.eventId, userId: 'ada' });

    expect(cart).toMatchObject({ totalCents: 18800 * 2 + 12800, currency: 'SGD', expiresAt });
    // Sorted by section, then row, then seat number.
    expect(cart!.items.map((i) => `${i.section} ${i.row}${i.number} ${i.tierName}`)).toEqual([
      'Balcony A1 Category 2',
      'Floor A3 Category 1',
      'Floor B2 Category 1',
    ]);
  });

  it('is empty (null) without live holds: none, expired, or held by someone else', async () => {
    const s = await setup();
    const expiresAt = await hold(s.eventId, 'ada', [s.floorB2]);

    expect(await getCart(prisma, { eventId: s.eventId, userId: 'bo' })).toBeNull();
    expect(await getCart(prisma, { eventId: s.eventId, userId: 'ada', now: expiresAt })).toBeNull();
  });
});

/** Stands in for Stripe: every intent id is a successful payment for the cart's amount. */
const verifyOk = vi.fn(async ({ paymentIntentId }: { paymentIntentId: string }) => ({
  ok: true as const,
  paymentRef: paymentIntentId,
}));
const noRefund = () => vi.fn().mockResolvedValue(undefined);
const stripeDeps = () => ({ verify: verifyOk, refund: noRefund(), refundOwned: noRefund() });

describe('checkout (SCRUM-39)', () => {
  beforeEach(async () => {
    verifyOk.mockClear();
    await resetDatabase();
  });

  it('verifies the payment at the tier prices and turns the holds into sold tickets', async () => {
    const s = await setup();
    await hold(s.eventId, 'ada', [s.floorB2, s.balconyA1]);

    const result = await checkout(
      prisma,
      { eventId: s.eventId, userId: 'ada', paymentIntentId: 'pi_1' },
      stripeDeps(),
    );

    expect(result).toMatchObject({ ok: true, totalCents: 31600, currency: 'SGD', seats: 2 });
    expect(verifyOk).toHaveBeenCalledWith({
      paymentIntentId: 'pi_1',
      amountCents: 31600,
      currency: 'SGD',
      userId: 'ada',
      eventId: s.eventId,
    });
    const order = await prisma.order.findFirstOrThrow({ include: { tickets: true } });
    expect(order).toMatchObject({
      userId: 'ada',
      totalCents: 31600,
      paymentRef: 'pi_1',
      status: 'PAID',
    });
    expect(order.tickets.map((t) => t.priceCents).sort()).toEqual([12800, 18800]);

    const reservations = await prisma.seatReservation.findMany();
    expect(reservations.every((r) => r.status === 'SOLD' && r.expiresAt === null)).toBe(true);
    expect(await getCart(prisma, { eventId: s.eventId, userId: 'ada' })).toBeNull();
  });

  it('sold seats stay taken for everyone and are never released by the expiry job', async () => {
    const s = await setup();
    await hold(s.eventId, 'ada', [s.floorB2]);
    await checkout(
      prisma,
      { eventId: s.eventId, userId: 'ada', paymentIntentId: 'pi_1' },
      stripeDeps(),
    );

    const muchLater = new Date(Date.now() + 60 * MINUTE);
    expect(await releaseExpiredHolds(prisma, { now: muchLater })).toEqual([]);
    const bo = await getSeatAvailability(prisma, s.eventId, { userId: 'bo', now: muchLater });
    expect(bo.unavailable).toEqual([s.floorB2]);
    expect(
      await holdSeats(prisma, {
        eventId: s.eventId,
        userId: 'bo',
        seatIds: [s.floorB2],
        now: muchLater,
      }),
    ).toMatchObject({ ok: false, code: 'unavailable' });
  });

  it('keeps the price paid even if the tier price changes later', async () => {
    const s = await setup();
    await hold(s.eventId, 'ada', [s.floorB2]);
    await checkout(
      prisma,
      { eventId: s.eventId, userId: 'ada', paymentIntentId: 'pi_1' },
      stripeDeps(),
    );

    await prisma.priceTier.updateMany({ data: { priceCents: 99900 } });

    const [order] = await listOrders(prisma, 'ada');
    expect(order.totalCents).toBe(18800);
    expect(order.tickets[0].priceCents).toBe(18800);
  });

  it.each([undefined, '', 'not-an-intent', 42])(
    'rejects a missing or malformed payment intent id (%s) without calling Stripe',
    async (paymentIntentId) => {
      const s = await setup();
      await hold(s.eventId, 'ada', [s.floorB2]);
      const deps = stripeDeps();

      const result = await checkout(
        prisma,
        { eventId: s.eventId, userId: 'ada', paymentIntentId },
        deps,
      );

      expect(result).toMatchObject({ ok: false, code: 'payment-failed' });
      expect(deps.verify).not.toHaveBeenCalled();
    },
  );

  it('an unpaid payment sells nothing and leaves the seats held so the fan can retry', async () => {
    const s = await setup();
    await hold(s.eventId, 'ada', [s.floorB2]);
    const deps = {
      ...stripeDeps(),
      verify: vi.fn().mockResolvedValue({ ok: false, code: 'payment-failed' }),
    };

    const result = await checkout(
      prisma,
      { eventId: s.eventId, userId: 'ada', paymentIntentId: 'pi_1' },
      deps,
    );

    expect(result).toMatchObject({ ok: false, code: 'payment-failed' });
    expect(deps.refundOwned).not.toHaveBeenCalled();
    expect(await prisma.order.count()).toBe(0);
    expect(await getCart(prisma, { eventId: s.eventId, userId: 'ada' })).not.toBeNull();
  });

  it('a payment for a different amount is refunded and sells nothing', async () => {
    const s = await setup();
    await hold(s.eventId, 'ada', [s.floorB2]);
    const deps = {
      ...stripeDeps(),
      verify: vi.fn().mockResolvedValue({ ok: false, code: 'payment-mismatch' }),
    };

    const result = await checkout(
      prisma,
      { eventId: s.eventId, userId: 'ada', paymentIntentId: 'pi_1' },
      deps,
    );

    expect(result).toMatchObject({ ok: false, code: 'payment-mismatch' });
    expect(deps.refundOwned).toHaveBeenCalledWith('pi_1', 'ada');
    expect(await prisma.order.count()).toBe(0);
  });

  it('expired holds cannot be checked out, and a payment already taken is refunded', async () => {
    const s = await setup();
    const expiresAt = await hold(s.eventId, 'ada', [s.floorB2]);
    const deps = stripeDeps();

    const result = await checkout(
      prisma,
      { eventId: s.eventId, userId: 'ada', paymentIntentId: 'pi_1' },
      { ...deps, clock: () => expiresAt },
    );

    expect(result).toMatchObject({ ok: false, code: 'no-holds' });
    expect(deps.verify).not.toHaveBeenCalled();
    expect(deps.refundOwned).toHaveBeenCalledWith('pi_1', 'ada');
  });

  it('a hold that lapses while paying is refunded and nothing is sold', async () => {
    const s = await setup();
    const expiresAt = await hold(s.eventId, 'ada', [s.floorB2, s.floorA3]);
    // Priced just before expiry; the conversion happens just after it.
    const times = [expiresAt.getTime() - 2000, expiresAt.getTime() - 1000, expiresAt.getTime()];
    const clock = () => new Date(times.shift() ?? expiresAt.getTime());
    const deps = stripeDeps();

    const result = await checkout(
      prisma,
      { eventId: s.eventId, userId: 'ada', paymentIntentId: 'pi_late' },
      { ...deps, clock },
    );

    expect(result).toEqual({ ok: false, code: 'expired', message: CHECKOUT_MESSAGES.expired });
    expect(deps.refund).toHaveBeenCalledWith('pi_late');
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.seatReservation.count({ where: { status: 'SOLD' } })).toBe(0);
  });

  it('submitting the same payment twice returns the same order and sells once', async () => {
    const s = await setup();
    await hold(s.eventId, 'ada', [s.floorB2]);
    const deps = stripeDeps();
    const request = { eventId: s.eventId, userId: 'ada', paymentIntentId: 'pi_1' };

    const first = await checkout(prisma, request, deps);
    const second = await checkout(prisma, request, deps);

    expect(second).toEqual(first);
    expect(await prisma.order.count()).toBe(1);
    expect(deps.refund).not.toHaveBeenCalled();
  });

  it("one fan cannot claim another fan's payment", async () => {
    const s = await setup();
    await hold(s.eventId, 'ada', [s.floorB2]);
    await hold(s.eventId, 'bo', [s.floorA3]);
    await checkout(
      prisma,
      { eventId: s.eventId, userId: 'ada', paymentIntentId: 'pi_ada' },
      stripeDeps(),
    );

    const result = await checkout(
      prisma,
      { eventId: s.eventId, userId: 'bo', paymentIntentId: 'pi_ada' },
      stripeDeps(),
    );

    expect(result).toMatchObject({ ok: false, code: 'payment-failed' });
    expect(await prisma.order.count()).toBe(1);
  });

  it('two simultaneous checkouts of one cart sell it once and refund the other', async () => {
    const s = await setup();
    await hold(s.eventId, 'ada', [s.floorB2]);
    const deps = stripeDeps();
    let n = 0;
    const attempt = () =>
      checkout(prisma, { eventId: s.eventId, userId: 'ada', paymentIntentId: `pi_${++n}` }, deps);

    const results = await Promise.all([attempt(), attempt()]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ code: 'expired' });
    expect(deps.refund).toHaveBeenCalledTimes(1);
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.ticket.count()).toBe(1);
  });

  it.each([
    ['an unknown event', { status: 'ON_SALE' as const }, 'nope'],
    ['an event no longer on sale', { status: 'CANCELLED' as const }, null],
  ])('refuses %s and refunds any payment', async (_label, update, eventIdOverride) => {
    const s = await setup();
    await hold(s.eventId, 'ada', [s.floorB2]);
    await prisma.event.update({ where: { id: s.eventId }, data: update });
    const deps = stripeDeps();

    const result = await checkout(
      prisma,
      { eventId: eventIdOverride ?? s.eventId, userId: 'ada', paymentIntentId: 'pi_1' },
      deps,
    );

    expect(result).toMatchObject({ ok: false, code: 'not-on-sale' });
    expect(deps.refundOwned).toHaveBeenCalledWith('pi_1', 'ada');
  });
});

describe('my tickets (SCRUM-40)', () => {
  beforeEach(resetDatabase);

  it("lists only the fan's own orders, newest first, with event, seats and date", async () => {
    const s = await setup();
    await hold(s.eventId, 'ada', [s.floorB2, s.floorA3]);
    await checkout(
      prisma,
      { eventId: s.eventId, userId: 'ada', paymentIntentId: 'pi_1' },
      stripeDeps(),
    );
    await hold(s.eventId, 'ada', [s.balconyA1]);
    await checkout(
      prisma,
      { eventId: s.eventId, userId: 'ada', paymentIntentId: 'pi_2' },
      stripeDeps(),
    );

    const orders = await listOrders(prisma, 'ada');

    expect(orders).toHaveLength(2);
    expect(orders[0].createdAt >= orders[1].createdAt).toBe(true);
    expect(orders[0].tickets.map((t) => `${t.section} ${t.row}${t.number}`)).toEqual([
      'Balcony A1',
    ]);
    expect(orders[1].tickets.map((t) => `${t.section} ${t.row}${t.number}`)).toEqual([
      'Floor A3',
      'Floor B2',
    ]);
    expect(orders[1]).toMatchObject({
      totalCents: 37600,
      event: { slug: 'gig', title: 'Gig', venue: 'Hall', city: 'SG' },
    });
    expect(await listOrders(prisma, 'bo')).toEqual([]);
  });
});
