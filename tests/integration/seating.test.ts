import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnectPrisma, getPrisma } from '@/lib/db';
import { applyVenueLayout, getSeatMap, type SectionLayout } from '@/lib/seating';
import { resetDatabase } from './helpers';

const prisma = getPrisma();
afterAll(disconnectPrisma);

const LAYOUT: SectionLayout[] = [
  { code: 'FLR', name: 'Floor', rows: 2, seatsPerRow: 3 },
  { code: 'UB', name: 'Upper Bowl', rows: 28, seatsPerRow: 2 },
];

async function seedVenueAndEvent() {
  const venue = await prisma.venue.create({
    data: { name: 'Test Hall', city: 'Singapore', capacity: 0 },
  });
  const event = await prisma.event.create({
    data: {
      slug: 'test-gig',
      title: 'Test Gig',
      startsAt: new Date('2026-12-24T12:00:00Z'),
      status: 'ON_SALE',
      venueId: venue.id,
    },
  });
  return { venue, event };
}

describe('applyVenueLayout (real database)', () => {
  beforeEach(resetDatabase);

  it('creates sections and seats and sets venue capacity to the seat count', async () => {
    const { venue } = await seedVenueAndEvent();

    expect(await applyVenueLayout(prisma, venue.id, LAYOUT)).toEqual({ sections: 2, seats: 62 });
    expect((await prisma.venue.findUniqueOrThrow({ where: { id: venue.id } })).capacity).toBe(62);
  });

  it('is idempotent — re-running creates no duplicates', async () => {
    const { venue } = await seedVenueAndEvent();
    await applyVenueLayout(prisma, venue.id, LAYOUT);

    expect(await applyVenueLayout(prisma, venue.id, LAYOUT)).toEqual({ sections: 2, seats: 62 });
    expect(await prisma.seat.count()).toBe(62);
  });

  it('rejects duplicate section codes before touching the database', async () => {
    const { venue } = await seedVenueAndEvent();
    const dup = [LAYOUT[0], { ...LAYOUT[1], code: 'FLR' }];

    await expect(applyVenueLayout(prisma, venue.id, dup)).rejects.toThrow(/Duplicate section/);
    expect(await prisma.section.count()).toBe(0);
  });
});

describe('getSeatMap (real database)', () => {
  beforeEach(resetDatabase);

  it('returns null for an unknown event', async () => {
    expect(await getSeatMap(prisma, 'nope')).toBeNull();
  });

  it('groups seats into rows in venue order with per-event prices', async () => {
    const { venue, event } = await seedVenueAndEvent();
    await applyVenueLayout(prisma, venue.id, LAYOUT);
    const floor = await prisma.section.findFirstOrThrow({ where: { code: 'FLR' } });
    await prisma.priceTier.create({
      data: { eventId: event.id, sectionId: floor.id, name: 'Category 1', priceCents: 18800 },
    });

    const map = await getSeatMap(prisma, 'test-gig');

    expect(map).toMatchObject({
      event: { slug: 'test-gig', title: 'Test Gig' },
      venue: { name: 'Test Hall' },
      totalSeats: 62,
    });
    const [flr, ub] = map!.sections;
    expect(flr).toMatchObject({
      code: 'FLR',
      price: { tier: 'Category 1', cents: 18800, currency: 'SGD' },
    });
    expect(flr.rows.map((r) => r.label)).toEqual(['A', 'B']);
    expect(flr.rows[0].seats.map((s) => s.number)).toEqual([1, 2, 3]);
    // Unpriced section, and AA/AB come after Z rather than between A and B.
    expect(ub.price).toBeNull();
    expect(ub.rows.map((r) => r.label).slice(-3)).toEqual(['Z', 'AA', 'AB']);
  });
});

describe('database integrity constraints', () => {
  beforeEach(resetDatabase);

  async function floorSection() {
    const { venue, event } = await seedVenueAndEvent();
    await applyVenueLayout(prisma, venue.id, [LAYOUT[0]]);
    return { event, section: await prisma.section.findFirstOrThrow() };
  }

  it('prevents the same seat existing twice in a section', async () => {
    const { section } = await floorSection();
    await expect(
      prisma.seat.create({ data: { sectionId: section.id, row: 'A', number: 1 } }),
    ).rejects.toThrow();
  });

  it.each([
    [{ row: 'A', number: 0 }, 'non-positive seat number'],
    [{ row: 'a', number: 9 }, 'lowercase row label'],
  ])('rejects %o (%s)', async (seat, _reason: string) => {
    const { section } = await floorSection();
    await expect(prisma.seat.create({ data: { sectionId: section.id, ...seat } })).rejects.toThrow(
      /check constraint/i,
    );
  });

  it('allows only one price tier per section per event', async () => {
    const { event, section } = await floorSection();
    const tier = { eventId: event.id, sectionId: section.id, name: 'Cat 1', priceCents: 100 };
    await prisma.priceTier.create({ data: tier });
    await expect(prisma.priceTier.create({ data: tier })).rejects.toThrow();
  });

  it.each([
    [{ priceCents: -1 }, 'negative price'],
    [{ currency: 'sg$' }, 'malformed currency'],
  ])(
    'rejects price tier with %o (%s)',
    async (override: { priceCents?: number; currency?: string }, _reason: string) => {
      const { event, section } = await floorSection();
      await expect(
        prisma.priceTier.create({
          data: { eventId: event.id, sectionId: section.id, name: 'X', priceCents: 1, ...override },
        }),
      ).rejects.toThrow(/check constraint/i);
    },
  );

  it('cascades: deleting an event removes its price tiers but keeps the seats', async () => {
    const { event, section } = await floorSection();
    await prisma.priceTier.create({
      data: { eventId: event.id, sectionId: section.id, name: 'Cat 1', priceCents: 100 },
    });

    await prisma.event.delete({ where: { id: event.id } });

    expect(await prisma.priceTier.count()).toBe(0);
    expect(await prisma.seat.count()).toBe(6);
  });
});
