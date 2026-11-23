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

/** Cache tag for the public event list; publishing an event expires it (SCRUM-28). */
export const EVENTS_CACHE_TAG = 'events';

/** Tickets can be bought: the event is on sale and hasn't started yet. */
export function isOnSale(
  event: { status: string; startsAt: Date },
  now: Date = new Date(),
): boolean {
  return event.status === 'ON_SALE' && event.startsAt > now;
}

export interface EventFilters {
  /** Case-insensitive match on the event title or venue name. */
  query?: string;
  /** Exact venue city (as returned by listEventCities). */
  city?: string;
}

/** Trim user input from the URL; empty or over-long values mean "no filter". */
export function normaliseFilters(raw: { query?: unknown; city?: unknown }): EventFilters {
  const clean = (v: unknown) => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s.length > 0 && s.length <= 100 ? s : undefined;
  };
  return { query: clean(raw.query), city: clean(raw.city) };
}

/** Upcoming events that are on sale, soonest first, optionally filtered. */
export async function listUpcomingEvents(
  prisma: PrismaClient,
  { now = new Date(), limit = 20, query, city }: { now?: Date; limit?: number } & EventFilters = {},
): Promise<EventSummary[]> {
  const events = await prisma.event.findMany({
    where: {
      status: 'ON_SALE',
      startsAt: { gt: now },
      ...(query && {
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { venue: { name: { contains: query, mode: 'insensitive' } } },
        ],
      }),
      ...(city && { venue: { city } }),
    },
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

/** Cities that have at least one upcoming on-sale event, for the filter dropdown. */
export async function listEventCities(
  prisma: PrismaClient,
  { now = new Date() }: { now?: Date } = {},
): Promise<string[]> {
  const venues = await prisma.venue.findMany({
    where: { events: { some: { status: 'ON_SALE', startsAt: { gt: now } } } },
    select: { city: true },
    distinct: ['city'],
    orderBy: { city: 'asc' },
  });
  return venues.map((v) => v.city);
}
