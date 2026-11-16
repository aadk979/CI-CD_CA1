import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { disconnectPrisma, getPrisma } from '@/lib/db';
import { getSeatAvailability, holdSeats, releaseExpiredHolds } from '@/lib/holds';
import { CHECKOUT_MESSAGES, checkout, getCart, listOrders } from '@/lib/orders';
import { TEST_CARDS } from '@/lib/payments';
import { applyVenueLayout } from '@/lib/seating';
import { resetDatabase } from './helpers';

const prisma = getPrisma();
const CARD = TEST_CARDS.approved;
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

describe('checkout (SCRUM-39)', () => {
  beforeEach(resetDatabase);

  it('charges the tier prices and turns the holds into sold tickets', async () => {
    const s = await setup();
    await hold(s.eventId, 'ada', [s.floorB2, s.balconyA1]);
    const pay = vi.fn().mockResolvedValue({ ok: true, paymentRef: 'pay_1' });

    const result = await checkout(
      prisma,
      { eventId: s.eventId, userId: 'ada', cardNumber: CARD },
      { pay },
    );

    expect(result).toMatchObject({ ok: true, totalCents: 31600, currency: 'SGD', seats: 2 });
    expect(pay).toHaveBeenCalledWith({ amountCents: 31600, currency: 'SGD', cardNumber: CARD });
    const order = await prisma.order.findFirstOrThrow({ include: { tickets: true } });
    expect(order).toMatchObject({
      userId: 'ada',
      totalCents: 31600,
      paymentRef: 'pay_1',
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
    await checkout(prisma, { eventId: s.eventId, userId: 'ada', cardNumber: CARD });

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
    await checkout(prisma, { eventId: s.eventId, userId: 'ada', cardNumber: CARD });

    await prisma.priceTier.updateMany({ data: { priceCents: 99900 } });

    const [order] = await listOrders(prisma, 'ada');
    expect(order.totalCents).toBe(18800);
    expect(order.tickets[0].priceCents).toBe(18800);
  });

  it('rejects an invalid card before charging anything', async () => {
    const s = await setup();
    await hold(s.eventId, 'ada', [s.floorB2]);
    const pay = vi.fn();

    const result = await checkout(
      prisma,
      { eventId: s.eventId, userId: 'ada', cardNumber: '1234' },
      { pay },
    );

    expect(result).toEqual({
      ok: false,
      code: 'invalid-card',
      message: CHECKOUT_MESSAGES['invalid-card'],
    });
    expect(pay).not.toHaveBeenCalled();
  });

  it('a declined card sells nothing and leaves the seats held so the fan can retry', async () => {
    const s = await setup();
    await hold(s.eventId, 'ada', [s.floorB2]);

    const result = await checkout(prisma, {
      eventId: s.eventId,
      userId: 'ada',
      cardNumber: TEST_CARDS.declined,
    });

    expect(result).toMatchObject({ ok: false, code: 'declined' });
    expect(await prisma.order.count()).toBe(0);
    expect(await getCart(prisma, { eventId: s.eventId, userId: 'ada' })).not.toBeNull();
  });

  it('an expired hold cannot be checked out, and nothing is charged', async () => {
    const s = await setup();
    const expiresAt = await hold(s.eventId, 'ada', [s.floorB2]);
    const pay = vi.fn();

    const result = await checkout(
      prisma,
      { eventId: s.eventId, userId: 'ada', cardNumber: CARD },
      { pay, clock: () => expiresAt },
    );

    expect(result).toMatchObject({ ok: false, code: 'no-holds' });
    expect(pay).not.toHaveBeenCalled();
  });

  it('a hold that lapses while the card is charged is refunded and nothing is sold', async () => {
    const s = await setup();
    const expiresAt = await hold(s.eventId, 'ada', [s.floorB2, s.floorA3]);
    // Priced just before expiry; the conversion happens just after it.
    const times = [expiresAt.getTime() - 2000, expiresAt.getTime() - 1000, expiresAt.getTime()];
    const clock = () => new Date(times.shift() ?? expiresAt.getTime());
    const refund = vi.fn().mockResolvedValue(undefined);

    const result = await checkout(
      prisma,
      { eventId: s.eventId, userId: 'ada', cardNumber: CARD },
      { pay: async () => ({ ok: true, paymentRef: 'pay_late' }), refund, clock },
    );

    expect(result).toEqual({ ok: false, code: 'expired', message: CHECKOUT_MESSAGES.expired });
    expect(refund).toHaveBeenCalledWith('pay_late');
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.seatReservation.count({ where: { status: 'SOLD' } })).toBe(0);
  });

  it('two simultaneous checkouts of one cart sell it once and refund the other', async () => {
    const s = await setup();
    await hold(s.eventId, 'ada', [s.floorB2]);
    let n = 0;
    const pay = async () => ({ ok: true as const, paymentRef: `pay_${++n}` });
    const refund = vi.fn().mockResolvedValue(undefined);
    const attempt = () =>
      checkout(prisma, { eventId: s.eventId, userId: 'ada', cardNumber: CARD }, { pay, refund });

    const results = await Promise.all([attempt(), attempt()]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ code: 'expired' });
    expect(refund).toHaveBeenCalledTimes(1);
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.ticket.count()).toBe(1);
  });

  it('refunds, then reports, any unexpected failure while saving the order', async () => {
    const s = await setup();
    await hold(s.eventId, 'ada', [s.floorB2]);
    await hold(s.eventId, 'bo', [s.floorA3]);
    const pay = async () => ({ ok: true as const, paymentRef: 'pay_dup' }); // provider bug: reused ref
    const refund = vi.fn().mockResolvedValue(undefined);
    await checkout(prisma, { eventId: s.eventId, userId: 'ada', cardNumber: CARD }, { pay });

    await expect(
      checkout(prisma, { eventId: s.eventId, userId: 'bo', cardNumber: CARD }, { pay, refund }),
    ).rejects.toThrow();

    expect(refund).toHaveBeenCalledWith('pay_dup');
    // Rolled back: Bo's seat is still only held, not sold.
    expect(await prisma.seatReservation.findFirst({ where: { userId: 'bo' } })).toMatchObject({
      status: 'HELD',
    });
  });

  it.each([
    ['an unknown event', { status: 'ON_SALE' as const }, 'nope'],
    ['an event no longer on sale', { status: 'CANCELLED' as const }, null],
  ])('refuses %s', async (_label, update, eventIdOverride) => {
    const s = await setup();
    await hold(s.eventId, 'ada', [s.floorB2]);
    await prisma.event.update({ where: { id: s.eventId }, data: update });

    const result = await checkout(prisma, {
      eventId: eventIdOverride ?? s.eventId,
      userId: 'ada',
      cardNumber: CARD,
    });

    expect(result).toMatchObject({ ok: false, code: 'not-on-sale' });
  });
});

describe('my tickets (SCRUM-40)', () => {
  beforeEach(resetDatabase);

  it("lists only the fan's own orders, newest first, with event, seats and date", async () => {
    const s = await setup();
    await hold(s.eventId, 'ada', [s.floorB2, s.floorA3]);
    await checkout(prisma, { eventId: s.eventId, userId: 'ada', cardNumber: CARD });
    await hold(s.eventId, 'ada', [s.balconyA1]);
    await checkout(prisma, { eventId: s.eventId, userId: 'ada', cardNumber: CARD });

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
