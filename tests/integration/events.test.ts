import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnectPrisma, getPrisma } from '@/lib/db';
import { listUpcomingEvents } from '@/lib/events';
import { resetDatabase } from './helpers';

const prisma = getPrisma();
const NOW = new Date('2026-12-01T00:00:00.000Z');
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

async function seedVenue() {
  return prisma.venue.create({ data: { name: 'Test Hall', city: 'Singapore', capacity: 500 } });
}

describe('listUpcomingEvents (real database)', () => {
  beforeEach(resetDatabase);
  afterAll(disconnectPrisma);

  it('returns on-sale future events, soonest first, with venue details', async () => {
    const venue = await seedVenue();
    await prisma.event.createMany({
      data: [
        { slug: 'later', title: 'Later', startsAt: days(10), status: 'ON_SALE', venueId: venue.id },
        {
          slug: 'sooner',
          title: 'Sooner',
          startsAt: days(2),
          status: 'ON_SALE',
          venueId: venue.id,
        },
      ],
    });

    const events = await listUpcomingEvents(prisma, { now: NOW });

    expect(events.map((e) => e.slug)).toEqual(['sooner', 'later']);
    expect(events[0]).toMatchObject({ venueName: 'Test Hall', city: 'Singapore' });
  });

  it('excludes past, draft, cancelled and sold-out events', async () => {
    const venue = await seedVenue();
    await prisma.event.createMany({
      data: [
        { slug: 'past', title: 'Past', startsAt: days(-1), status: 'ON_SALE', venueId: venue.id },
        { slug: 'draft', title: 'Draft', startsAt: days(3), status: 'DRAFT', venueId: venue.id },
        { slug: 'off', title: 'Off', startsAt: days(3), status: 'CANCELLED', venueId: venue.id },
        { slug: 'gone', title: 'Gone', startsAt: days(3), status: 'SOLD_OUT', venueId: venue.id },
        { slug: 'ok', title: 'OK', startsAt: days(3), status: 'ON_SALE', venueId: venue.id },
      ],
    });

    const events = await listUpcomingEvents(prisma, { now: NOW });

    expect(events.map((e) => e.slug)).toEqual(['ok']);
  });

  it('treats an event starting exactly now as no longer upcoming (boundary)', async () => {
    const venue = await seedVenue();
    await prisma.event.create({
      data: { slug: 'now', title: 'Now', startsAt: NOW, status: 'ON_SALE', venueId: venue.id },
    });

    expect(await listUpcomingEvents(prisma, { now: NOW })).toEqual([]);
  });

  it('respects the limit', async () => {
    const venue = await seedVenue();
    await prisma.event.createMany({
      data: [1, 2, 3].map((n) => ({
        slug: `e${n}`,
        title: `E${n}`,
        startsAt: days(n),
        status: 'ON_SALE' as const,
        venueId: venue.id,
      })),
    });

    expect(await listUpcomingEvents(prisma, { now: NOW, limit: 2 })).toHaveLength(2);
  });

  it('uses the current time and default limit when no options are given', async () => {
    const venue = await seedVenue();
    await prisma.event.create({
      data: {
        slug: 'future',
        title: 'Future',
        startsAt: new Date(Date.now() + 86_400_000),
        status: 'ON_SALE',
        venueId: venue.id,
      },
    });

    expect(await listUpcomingEvents(prisma)).toHaveLength(1);
  });
});
