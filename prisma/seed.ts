import { loadEnv } from '../src/lib/load-env';

loadEnv();

async function main() {
  const { getPrisma, disconnectPrisma } = await import('../src/lib/db');
  const prisma = getPrisma();

  const venue = await prisma.venue.upsert({
    where: { id: 'seed-venue-arena' },
    update: {},
    create: { id: 'seed-venue-arena', name: 'Harbour Arena', city: 'Singapore', capacity: 12000 },
  });

  const events = [
    { slug: 'neon-skyline-tour', title: 'Neon Skyline Tour', daysAhead: 14 },
    { slug: 'jazz-by-the-bay', title: 'Jazz by the Bay', daysAhead: 30 },
  ];

  for (const e of events) {
    await prisma.event.upsert({
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
  }

  console.log(`Seeded venue "${venue.name}" with ${events.length} events.`);
  await disconnectPrisma();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
