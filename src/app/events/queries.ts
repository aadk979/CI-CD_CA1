import { cacheLife, cacheTag } from 'next/cache';
import { getPrisma } from '@/lib/db';
import {
  EVENTS_CACHE_TAG,
  listEventCities,
  listUpcomingEvents,
  type EventFilters,
} from '@/lib/events';
import { getSeatMap } from '@/lib/seating';

/**
 * Cached reads shared by the landing page and the /events catalogue. The public event
 * list is the same for everyone, so it is cached rather than queried on every visit.
 * Publishing an event expires the tag (SCRUM-28); otherwise it refreshes within minutes,
 * which also drops events that have since started.
 */
export async function getUpcomingEvents(filters: EventFilters & { limit?: number }) {
  'use cache';
  cacheTag(EVENTS_CACHE_TAG);
  cacheLife('minutes');
  return listUpcomingEvents(getPrisma(), filters);
}

export async function getCities() {
  'use cache';
  cacheTag(EVENTS_CACHE_TAG);
  cacheLife('minutes');
  return listEventCities(getPrisma());
}

/** Seat categories (section, tier, price, seat count) of one event, for the landing page. */
export async function getSeatCategories(slug: string) {
  'use cache';
  cacheTag(EVENTS_CACHE_TAG);
  cacheLife('minutes');
  const map = await getSeatMap(getPrisma(), slug);
  if (!map) return [];
  return map.sections
    .filter((s) => s.price)
    .map((s) => ({
      id: s.id,
      name: s.name,
      tier: s.price!.tier,
      cents: s.price!.cents,
      currency: s.price!.currency,
      seats: s.rows.reduce((n, r) => n + r.seats.length, 0),
      rows: s.rows.length,
    }))
    .sort((a, b) => b.cents - a.cents);
}
