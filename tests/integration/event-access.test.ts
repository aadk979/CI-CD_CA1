import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnectPrisma, getPrisma } from '@/lib/db';
import { getShopAccess, getShopAccessById } from '@/lib/event-access';
import { hasActiveHold, holdSeats } from '@/lib/holds';
import { createRedis } from '@/lib/redis';
import { applyVenueLayout } from '@/lib/seating';
import { ACTIVE_QUEUES_KEY, admitNext, joinQueue } from '@/lib/waiting-room';
import { resetDatabase } from './helpers';

const prisma = getPrisma();
const redis = createRedis();
const deps = { prisma, redis };

afterAll(async () => {
  await redis.quit();
  await disconnectPrisma();
});

async function clearQueue(eventId: string) {
  const keys = await redis.keys(`waitroom:{${eventId}}:*`);
  if (keys.length) await redis.del(...keys);
  await redis.srem(ACTIVE_QUEUES_KEY, eventId);
}

/** An on-sale event with two priced seats, and two fans. */
async function setup({ waitingRoom }: { waitingRoom: boolean }) {
  const venue = await prisma.venue.create({ data: { name: 'Hall', city: 'SG', capacity: 0 } });
  await applyVenueLayout(prisma, venue.id, [{ code: 'A', name: 'A', rows: 1, seatsPerRow: 2 }]);
  const event = await prisma.event.create({
    data: {
      slug: `gig-${waitingRoom}`,
      title: 'Gig',
      startsAt: new Date(Date.now() + 86_400_000),
      status: 'ON_SALE',
      waitingRoom,
      venueId: venue.id,
    },
  });
  const section = await prisma.section.findFirstOrThrow({ where: { venueId: venue.id } });
  await prisma.priceTier.create({
    data: { eventId: event.id, sectionId: section.id, name: 'GA', priceCents: 5000 },
  });
  for (const id of ['ada', 'bo']) {
    await prisma.user.create({ data: { id, name: id, email: `${id}@example.com` } });
  }
  const seatIds = (await prisma.seat.findMany({ where: { sectionId: section.id } })).map(
    (s) => s.id,
  );
  await clearQueue(event.id);
  return { event, seatIds };
}

describe('who may pick seats (waiting room access)', () => {
  beforeEach(resetDatabase);

  it('ordinary events are open to everyone, signed in or not, without touching Redis', async () => {
    const { event } = await setup({ waitingRoom: false });
    const offline = { prisma, redis: undefined as never }; // any Redis call would throw

    expect(await getShopAccess(offline, { event })).toEqual({ allowed: true, via: 'open' });
    expect(await getShopAccess(offline, { event, userId: 'ada' })).toEqual({
      allowed: true,
      via: 'open',
    });
  });

  it('waiting-room events turn away visitors and fans who have not been admitted', async () => {
    const { event } = await setup({ waitingRoom: true });
    await joinQueue(redis, event.id, 'ada'); // queued, not yet admitted

    expect(await getShopAccess(deps, { event })).toEqual({ allowed: false });
    expect(await getShopAccess(deps, { event, userId: 'ada' })).toEqual({ allowed: false });
    expect(await getShopAccess(deps, { event, userId: 'bo' })).toEqual({ allowed: false });
  });

  it('admitted fans may shop until their pass lapses', async () => {
    const { event } = await setup({ waitingRoom: true });
    await joinQueue(redis, event.id, 'ada');
    await admitNext(redis, event.id, { batchSize: 1, passTtlMs: 60_000 });

    const access = await getShopAccess(deps, { event, userId: 'ada' });

    expect(access).toMatchObject({ allowed: true, via: 'pass' });
    expect(access.allowed && access.via === 'pass' && access.passExpiresAt > new Date()).toBe(true);
    expect(await getShopAccess(deps, { event, userId: 'bo' })).toEqual({ allowed: false });
  });

  it('a fan holding seats keeps access after the pass lapses, until the cart expires', async () => {
    const { event, seatIds } = await setup({ waitingRoom: true });
    const now = new Date();
    await holdSeats(prisma, { eventId: event.id, userId: 'ada', seatIds: [seatIds[0]], now });

    expect(await hasActiveHold(prisma, { eventId: event.id, userId: 'ada', now })).toBe(true);
    expect(await getShopAccess(deps, { event, userId: 'ada', now })).toEqual({
      allowed: true,
      via: 'cart',
    });

    const afterCartExpiry = new Date(now.getTime() + 11 * 60_000);
    expect(await getShopAccess(deps, { event, userId: 'ada', now: afterCartExpiry })).toEqual({
      allowed: false,
    });
  });

  it('checks by event id for Server Actions; unknown events are left to the hold to reject', async () => {
    const { event } = await setup({ waitingRoom: true });

    expect(await getShopAccessById(deps, { eventId: event.id, userId: 'ada' })).toEqual({
      allowed: false,
    });
    expect(await getShopAccessById(deps, { eventId: 'nope', userId: 'ada' })).toEqual({
      allowed: true,
      via: 'open',
    });
  });
});
