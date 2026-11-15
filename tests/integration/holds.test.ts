import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { HOLD_DURATION_MS, MAX_SEATS_PER_ORDER } from '@/lib/config';
import { disconnectPrisma, getPrisma } from '@/lib/db';
import {
  HOLD_MESSAGES,
  getSeatAvailability,
  holdSeats,
  releaseExpiredHolds,
  releaseSeats,
} from '@/lib/holds';
import { applyVenueLayout } from '@/lib/seating';
import { resetDatabase } from './helpers';

const prisma = getPrisma();
afterAll(disconnectPrisma);

const NOW = new Date('2026-12-01T10:00:00Z');
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

/**
 * Venue with a priced Floor (2 rows × 5) and an unpriced Balcony (1 × 3), one on-sale
 * event, and three fans. Returns seat ids in row order (A1..A5, B1..B5).
 */
async function setup() {
  const venue = await prisma.venue.create({
    data: { name: 'Test Hall', city: 'Singapore', capacity: 0 },
  });
  await applyVenueLayout(prisma, venue.id, [
    { code: 'FLR', name: 'Floor', rows: 2, seatsPerRow: 5 },
    { code: 'BAL', name: 'Balcony', rows: 1, seatsPerRow: 3 },
  ]);
  const event = await prisma.event.create({
    data: {
      slug: 'test-gig',
      title: 'Test Gig',
      startsAt: new Date('2026-12-24T12:00:00Z'),
      status: 'ON_SALE',
      venueId: venue.id,
    },
  });
  const floor = await prisma.section.findFirstOrThrow({ where: { code: 'FLR' } });
  await prisma.priceTier.create({
    data: { eventId: event.id, sectionId: floor.id, name: 'Cat 1', priceCents: 10000 },
  });
  const seats = await prisma.seat.findMany({
    where: { sectionId: floor.id },
    orderBy: [{ row: 'asc' }, { number: 'asc' }],
  });
  const balcony = await prisma.seat.findFirstOrThrow({ where: { section: { code: 'BAL' } } });

  const users = await Promise.all(
    ['ada', 'bo', 'cy'].map((name) =>
      prisma.user.create({ data: { id: `user-${name}`, name, email: `${name}@example.com` } }),
    ),
  );
  return {
    venue,
    event,
    seatIds: seats.map((s) => s.id),
    balconySeatId: balcony.id,
    users: users.map((u) => u.id),
  };
}

describe('holdSeats (real database)', () => {
  beforeEach(resetDatabase);

  it('holds seats for 10 minutes', async () => {
    const { event, seatIds, users } = await setup();

    const result = await holdSeats(prisma, {
      eventId: event.id,
      userId: users[0],
      seatIds: seatIds.slice(0, 2),
      now: NOW,
    });

    expect(result).toEqual({
      ok: true,
      seatIds: seatIds.slice(0, 2),
      expiresAt: new Date(NOW.getTime() + HOLD_DURATION_MS),
    });
    expect(await prisma.seatReservation.count({ where: { status: 'HELD' } })).toBe(2);
  });

  it('never lets two fans hold the same seat, even when they click at the same instant', async () => {
    const { event, seatIds, users } = await setup();

    // Error guessing: three concurrent transactions racing for one seat.
    const results = await Promise.all(
      users.map((userId) =>
        holdSeats(prisma, { eventId: event.id, userId, seatIds: [seatIds[0]], now: NOW }),
      ),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const losers = results.filter((r) => !r.ok);
    expect(losers).toHaveLength(2);
    for (const loser of losers) {
      expect(loser).toMatchObject({
        code: 'unavailable',
        message: HOLD_MESSAGES.unavailable,
        unavailable: [seatIds[0]],
      });
    }
    expect(await prisma.seatReservation.count()).toBe(1);
  });

  it('is all-or-nothing: if one seat is taken, none of the others are held', async () => {
    const { event, seatIds, users } = await setup();
    await holdSeats(prisma, {
      eventId: event.id,
      userId: users[0],
      seatIds: [seatIds[2]],
      now: NOW,
    });

    const result = await holdSeats(prisma, {
      eventId: event.id,
      userId: users[1],
      seatIds: seatIds.slice(0, 3),
      now: NOW,
    });

    expect(result).toMatchObject({ ok: false, code: 'unavailable', unavailable: [seatIds[2]] });
    expect(await prisma.seatReservation.count({ where: { userId: users[1] } })).toBe(0);
  });

  it('treats a lapsed hold as free, without waiting for the expiry job', async () => {
    const { event, seatIds, users } = await setup();
    await holdSeats(prisma, {
      eventId: event.id,
      userId: users[0],
      seatIds: [seatIds[0]],
      now: NOW,
    });

    const later = minutes(10); // boundary: exactly at expiry the hold no longer counts
    const result = await holdSeats(prisma, {
      eventId: event.id,
      userId: users[1],
      seatIds: [seatIds[0]],
      now: later,
    });

    expect(result).toMatchObject({ ok: true, seatIds: [seatIds[0]] });
    const row = await prisma.seatReservation.findFirstOrThrow();
    expect(row.userId).toBe(users[1]);
  });

  it('adds seats to an existing cart without extending its timer', async () => {
    const { event, seatIds, users } = await setup();
    const first = await holdSeats(prisma, {
      eventId: event.id,
      userId: users[0],
      seatIds: [seatIds[0]],
      now: NOW,
    });

    const second = await holdSeats(prisma, {
      eventId: event.id,
      userId: users[0],
      seatIds: [seatIds[0], seatIds[1]], // re-requesting an already-held seat is harmless
      now: minutes(4),
    });

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.expiresAt).toEqual(first.expiresAt);
    expect(second.seatIds.sort()).toEqual([seatIds[0], seatIds[1]].sort());
    expect(await prisma.seatReservation.count()).toBe(2);
  });

  it(`allows exactly ${MAX_SEATS_PER_ORDER} seats per fan per event (boundary values)`, async () => {
    const { event, seatIds, users } = await setup();
    const atLimit = await holdSeats(prisma, {
      eventId: event.id,
      userId: users[0],
      seatIds: seatIds.slice(0, MAX_SEATS_PER_ORDER),
      now: NOW,
    });
    expect(atLimit.ok).toBe(true);

    const overLimit = await holdSeats(prisma, {
      eventId: event.id,
      userId: users[0],
      seatIds: [seatIds[MAX_SEATS_PER_ORDER]],
      now: NOW,
    });
    expect(overLimit).toMatchObject({
      ok: false,
      code: 'too-many',
      message: HOLD_MESSAGES.tooMany,
    });
  });

  it.each([
    ['an unpriced section', 'balcony'],
    ['a seat that does not exist', 'missing'],
  ])('rejects %s', async (_case, which) => {
    const { event, balconySeatId, users } = await setup();
    const seatId = which === 'balcony' ? balconySeatId : 'doesnotexist';

    const result = await holdSeats(prisma, {
      eventId: event.id,
      userId: users[0],
      seatIds: [seatId],
      now: NOW,
    });

    expect(result).toMatchObject({ ok: false, code: 'invalid', message: HOLD_MESSAGES.badSeats });
  });

  it('rejects seats from a different venue', async () => {
    const { event, users } = await setup();
    const other = await prisma.venue.create({ data: { name: 'Other', city: 'SG', capacity: 0 } });
    await applyVenueLayout(prisma, other.id, [{ code: 'X', name: 'X', rows: 1, seatsPerRow: 1 }]);
    const foreignSeat = await prisma.seat.findFirstOrThrow({
      where: { section: { venueId: other.id } },
    });

    const result = await holdSeats(prisma, {
      eventId: event.id,
      userId: users[0],
      seatIds: [foreignSeat.id],
      now: NOW,
    });

    expect(result).toMatchObject({ ok: false, code: 'invalid' });
  });

  it.each([
    ['a draft event', { status: 'DRAFT' as const }],
    ['a past event', { startsAt: new Date('2026-11-01T00:00:00Z') }],
  ])('refuses holds for %s', async (_case, change) => {
    const { event, seatIds, users } = await setup();
    await prisma.event.update({ where: { id: event.id }, data: change });

    const result = await holdSeats(prisma, {
      eventId: event.id,
      userId: users[0],
      seatIds: [seatIds[0]],
      now: NOW,
    });

    expect(result).toMatchObject({ ok: false, code: 'not-on-sale' });
  });

  it('reports an unknown event and an empty request', async () => {
    const { users, seatIds, event } = await setup();
    expect(
      await holdSeats(prisma, { eventId: 'nope', userId: users[0], seatIds: [seatIds[0]] }),
    ).toMatchObject({ ok: false, code: 'not-found' });
    expect(
      await holdSeats(prisma, { eventId: event.id, userId: users[0], seatIds: [] }),
    ).toMatchObject({ ok: false, code: 'invalid' });
  });

  it('never lets a hold take a sold seat', async () => {
    const { event, seatIds, users } = await setup();
    await prisma.seatReservation.create({
      data: { eventId: event.id, seatId: seatIds[0], userId: users[0], status: 'SOLD' },
    });

    const result = await holdSeats(prisma, {
      eventId: event.id,
      userId: users[1],
      seatIds: [seatIds[0]],
      now: NOW,
    });

    expect(result).toMatchObject({ ok: false, code: 'unavailable', unavailable: [seatIds[0]] });
  });
});

describe('database constraint on reservations', () => {
  beforeEach(resetDatabase);

  it.each([
    [{ status: 'HELD' as const, expiresAt: null }, 'a hold without an expiry'],
    [{ status: 'SOLD' as const, expiresAt: NOW }, 'a sale with an expiry'],
  ])('rejects %o (%s)', async (data, _reason: string) => {
    const { event, seatIds, users } = await setup();
    await expect(
      prisma.seatReservation.create({
        data: { eventId: event.id, seatId: seatIds[0], userId: users[0], ...data },
      }),
    ).rejects.toThrow(/check constraint/i);
  });
});

describe('releasing holds (real database)', () => {
  beforeEach(resetDatabase);

  it('lets a fan release their own holds, and only theirs', async () => {
    const { event, seatIds, users } = await setup();
    await holdSeats(prisma, {
      eventId: event.id,
      userId: users[0],
      seatIds: seatIds.slice(0, 2),
      now: NOW,
    });
    await holdSeats(prisma, {
      eventId: event.id,
      userId: users[1],
      seatIds: [seatIds[5]],
      now: NOW,
    });

    const released = await releaseSeats(prisma, { eventId: event.id, userId: users[0] });

    expect(released.sort()).toEqual(seatIds.slice(0, 2).sort());
    expect(await prisma.seatReservation.findMany({ select: { seatId: true } })).toEqual([
      { seatId: seatIds[5] },
    ]);
  });

  it('can release a subset of seats', async () => {
    const { event, seatIds, users } = await setup();
    await holdSeats(prisma, {
      eventId: event.id,
      userId: users[0],
      seatIds: seatIds.slice(0, 2),
      now: NOW,
    });

    expect(
      await releaseSeats(prisma, { eventId: event.id, userId: users[0], seatIds: [seatIds[1]] }),
    ).toEqual([seatIds[1]]);
    expect(await prisma.seatReservation.count()).toBe(1);
  });

  it('expiry releases only lapsed holds, grouped by event', async () => {
    const { event, seatIds, users } = await setup();
    await holdSeats(prisma, {
      eventId: event.id,
      userId: users[0],
      seatIds: seatIds.slice(0, 2),
      now: NOW,
    });
    await holdSeats(prisma, {
      eventId: event.id,
      userId: users[1],
      seatIds: [seatIds[5]],
      now: minutes(5),
    });

    expect(await releaseExpiredHolds(prisma, { now: minutes(9) })).toEqual([]); // nothing lapsed yet

    const released = await releaseExpiredHolds(prisma, { now: minutes(10) });
    expect(released).toHaveLength(1);
    expect(released[0].eventId).toBe(event.id);
    expect(released[0].seatIds.sort()).toEqual(seatIds.slice(0, 2).sort());
    expect(await prisma.seatReservation.count()).toBe(1); // bo's hold has 5 minutes left
  });

  it("a cart's expiry job only touches that fan's holds", async () => {
    const { event, seatIds, users } = await setup();
    await holdSeats(prisma, {
      eventId: event.id,
      userId: users[0],
      seatIds: [seatIds[0]],
      now: NOW,
    });
    await holdSeats(prisma, {
      eventId: event.id,
      userId: users[1],
      seatIds: [seatIds[1]],
      now: NOW,
    });

    const released = await releaseExpiredHolds(prisma, {
      now: minutes(11),
      eventId: event.id,
      userId: users[0],
    });

    expect(released).toEqual([{ eventId: event.id, seatIds: [seatIds[0]] }]);
    expect(await prisma.seatReservation.count()).toBe(1);
  });

  it('never expires sold seats', async () => {
    const { event, seatIds, users } = await setup();
    await prisma.seatReservation.create({
      data: { eventId: event.id, seatId: seatIds[0], userId: users[0], status: 'SOLD' },
    });

    expect(await releaseExpiredHolds(prisma, { now: minutes(60 * 24 * 365) })).toEqual([]);
    expect(await prisma.seatReservation.count()).toBe(1);
  });
});

describe('getSeatAvailability (real database)', () => {
  beforeEach(resetDatabase);

  it("splits seats into this fan's holds and everyone else's", async () => {
    const { event, seatIds, users } = await setup();
    await holdSeats(prisma, {
      eventId: event.id,
      userId: users[0],
      seatIds: seatIds.slice(0, 2),
      now: NOW,
    });
    await holdSeats(prisma, {
      eventId: event.id,
      userId: users[1],
      seatIds: [seatIds[5]],
      now: NOW,
    });
    await prisma.seatReservation.create({
      data: { eventId: event.id, seatId: seatIds[9], userId: users[0], status: 'SOLD' },
    });

    const forAda = await getSeatAvailability(prisma, event.id, {
      userId: users[0],
      now: minutes(1),
    });
    expect(forAda.held.sort()).toEqual(seatIds.slice(0, 2).sort());
    expect(forAda.unavailable.sort()).toEqual([seatIds[5], seatIds[9]].sort());
    expect(forAda.heldUntil).toEqual(new Date(NOW.getTime() + HOLD_DURATION_MS));

    const anonymous = await getSeatAvailability(prisma, event.id, { now: minutes(1) });
    expect(anonymous.held).toEqual([]);
    expect(anonymous.heldUntil).toBeNull();
    expect(anonymous.unavailable).toHaveLength(4);
  });

  it('ignores lapsed holds that have not been cleaned up yet', async () => {
    const { event, seatIds, users } = await setup();
    await holdSeats(prisma, {
      eventId: event.id,
      userId: users[0],
      seatIds: [seatIds[0]],
      now: NOW,
    });

    expect(await getSeatAvailability(prisma, event.id, { now: minutes(11) })).toEqual({
      unavailable: [],
      held: [],
      heldUntil: null,
    });
  });
});
