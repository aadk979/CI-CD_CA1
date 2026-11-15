import type { Queue } from 'bullmq';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnectPrisma, getPrisma } from '@/lib/db';
import { holdSeats } from '@/lib/holds';
import { applyVenueLayout } from '@/lib/seating';
import {
  createReleaseHoldsProcessor,
  holdExpiryJobId,
  scheduleHoldExpiry,
} from '@/server/jobs/release-holds';
import { JOB_NAMES, QUEUE_NAMES, getQueue } from '@/server/queues';
import { resetDatabase } from './helpers';

const prisma = getPrisma();
let queue: Queue;

afterAll(async () => {
  await queue?.obliterate({ force: true });
  await queue?.close();
  await disconnectPrisma();
});

async function heldCart() {
  const venue = await prisma.venue.create({ data: { name: 'Hall', city: 'SG', capacity: 0 } });
  await applyVenueLayout(prisma, venue.id, [{ code: 'A', name: 'A', rows: 1, seatsPerRow: 2 }]);
  const event = await prisma.event.create({
    data: {
      slug: 'gig',
      title: 'Gig',
      startsAt: new Date(Date.now() + 86_400_000),
      status: 'ON_SALE',
      venueId: venue.id,
    },
  });
  const section = await prisma.section.findFirstOrThrow();
  await prisma.priceTier.create({
    data: { eventId: event.id, sectionId: section.id, name: 'GA', priceCents: 5000 },
  });
  const user = await prisma.user.create({
    data: { id: 'user-ada', name: 'Ada', email: 'ada@example.com' },
  });
  const seatIds = (await prisma.seat.findMany()).map((s) => s.id);
  const now = new Date();
  const hold = await holdSeats(prisma, { eventId: event.id, userId: user.id, seatIds, now });
  if (!hold.ok) throw new Error('setup hold failed');
  return { eventId: event.id, userId: user.id, seatIds, expiresAt: hold.expiresAt, now };
}

describe('hold expiry through BullMQ (real Redis + database)', () => {
  beforeEach(async () => {
    await resetDatabase();
    queue = getQueue(QUEUE_NAMES.holds);
    await queue.obliterate({ force: true });
  });

  it('getQueue reuses one producer per queue name', () => {
    expect(getQueue(QUEUE_NAMES.holds)).toBe(queue);
  });

  it('schedules one delayed job per cart, and re-scheduling the same cart is a no-op', async () => {
    const { eventId, userId, expiresAt, now } = await heldCart();

    await scheduleHoldExpiry(queue, { eventId, userId }, expiresAt, now);
    await scheduleHoldExpiry(queue, { eventId, userId }, expiresAt, now); // more seats, same cart

    const delayed = await queue.getDelayed();
    expect(delayed).toHaveLength(1);
    expect(delayed[0]).toMatchObject({
      id: holdExpiryJobId({ eventId, userId }, expiresAt),
      name: JOB_NAMES.releaseHolds,
      data: { eventId, userId },
    });
    // Due when the hold lapses (10 minutes), give or take scheduling latency.
    expect(delayed[0].opts.delay).toBeGreaterThan(9 * 60_000);
  });

  it('the processor frees the cart once it has lapsed, and reports what it freed', async () => {
    const { eventId, userId, seatIds, expiresAt } = await heldCart();
    const freed: unknown[] = [];
    const process = createReleaseHoldsProcessor({
      prisma,
      onReleased: (r) => freed.push(r),
      now: () => new Date(expiresAt.getTime() + 1),
    });

    const result = await process({ eventId, userId });

    expect(result).toHaveLength(1);
    expect(result[0].seatIds.sort()).toEqual([...seatIds].sort());
    expect(freed).toEqual(result);
    expect(await prisma.seatReservation.count()).toBe(0);
  });

  it('a job that runs early (or twice) frees nothing', async () => {
    const { eventId, userId } = await heldCart();
    const process = createReleaseHoldsProcessor({ prisma });

    expect(await process({ eventId, userId })).toEqual([]);
    expect(await process()).toEqual([]); // the periodic sweep, before expiry
    expect(await prisma.seatReservation.count()).toBe(2);
  });
});
