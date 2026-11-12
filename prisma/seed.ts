import { loadEnv } from '../src/lib/load-env';
import type { SectionLayout } from '../src/lib/seating';

loadEnv();

/** Demo seat map for Harbour Arena (1,400 seats). */
const ARENA_LAYOUT: SectionLayout[] = [
  { code: 'FLR', name: 'Floor', rows: 10, seatsPerRow: 20 },
  { code: 'LB', name: 'Lower Bowl', rows: 20, seatsPerRow: 30 },
  { code: 'UB', name: 'Upper Bowl', rows: 15, seatsPerRow: 40 },
];

/** Price per section code, in cents (SGD). */
const EVENTS = [
  {
    slug: 'neon-skyline-tour',
    title: 'Neon Skyline Tour',
    daysAhead: 14,
    prices: { FLR: ['Category 1', 18800], LB: ['Category 2', 12800], UB: ['Category 3', 6800] },
  },
  {
    slug: 'jazz-by-the-bay',
    title: 'Jazz by the Bay',
    daysAhead: 30,
    prices: { FLR: ['Premium', 9800], LB: ['Standard', 6800], UB: ['Standard', 6800] },
  },
] as const;

async function main() {
  const { getPrisma, disconnectPrisma } = await import('../src/lib/db');
  const { applyVenueLayout } = await import('../src/lib/seating');
  const prisma = getPrisma();

  const venue = await prisma.venue.upsert({
    where: { id: 'seed-venue-arena' },
    update: {},
    create: { id: 'seed-venue-arena', name: 'Harbour Arena', city: 'Singapore', capacity: 0 },
  });
  const seating = await applyVenueLayout(prisma, venue.id, ARENA_LAYOUT);
  const sections = await prisma.section.findMany({ where: { venueId: venue.id } });

  for (const e of EVENTS) {
    const event = await prisma.event.upsert({
      where: { slug: e.slug },
      update: {},
      create: {
        slug: e.slug,
        title: e.title,
        status: 'ON_SALE',
        startsAt: new Date(Date.now() + e.daysAhead * 24 * 60 * 60 * 1000),
        venueId: venue.id,
      },
    });

    for (const section of sections) {
      const price = e.prices[section.code as keyof typeof e.prices];
      if (!price) continue;
      const [name, priceCents] = price;
      await prisma.priceTier.upsert({
        where: { eventId_sectionId: { eventId: event.id, sectionId: section.id } },
        update: { name, priceCents },
        create: { eventId: event.id, sectionId: section.id, name, priceCents },
      });
    }
  }

  console.log(
    `Seeded venue "${venue.name}" (${seating.sections} sections, ${seating.seats} seats) ` +
      `with ${EVENTS.length} priced events.`,
  );
  await disconnectPrisma();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
