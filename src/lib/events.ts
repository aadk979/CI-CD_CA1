import type { PrismaClient } from '@/generated/prisma/client';

export interface EventSummary {
  id: string;
  slug: string;
  title: string;
  startsAt: Date;
  venueName: string;
  city: string;
  /** High-demand on-sale: fans queue in a waiting room first. */
  waitingRoom: boolean;
}

/** Tickets can be bought: the event is on sale and hasn't started yet. */
export function isOnSale(
  event: { status: string; startsAt: Date },
  now: Date = new Date(),
): boolean {
  return event.status === 'ON_SALE' && event.startsAt > now;
}

/** Upcoming events that are on sale, soonest first. */
export async function listUpcomingEvents(
  prisma: PrismaClient,
  { now = new Date(), limit = 20 }: { now?: Date; limit?: number } = {},
): Promise<EventSummary[]> {
  const events = await prisma.event.findMany({
    where: { status: 'ON_SALE', startsAt: { gt: now } },
    orderBy: { startsAt: 'asc' },
    take: limit,
    include: { venue: { select: { name: true, city: true } } },
  });

  return events.map((e) => ({
    id: e.id,
    slug: e.slug,
    title: e.title,
    startsAt: e.startsAt,
    venueName: e.venue.name,
    city: e.venue.city,
    waitingRoom: e.waitingRoom,
  }));
}
