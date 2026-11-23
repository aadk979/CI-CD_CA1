import Link from 'next/link';
import { Suspense } from 'react';
import { cacheLife, cacheTag } from 'next/cache';
import { connection } from 'next/server';
import { LiveStatus } from '@/components/live-status';
import { APP_NAME } from '@/lib/config';
import { getPrisma } from '@/lib/db';
import {
  EVENTS_CACHE_TAG,
  listEventCities,
  listUpcomingEvents,
  normaliseFilters,
  type EventFilters,
} from '@/lib/events';
import { formatEventDate } from '@/lib/format';

/**
 * The public event list is the same for everyone, so it is cached rather than queried on
 * every visit. Publishing an event expires the tag (SCRUM-28); otherwise it refreshes
 * within minutes, which also drops events that have since started.
 */
async function getUpcomingEvents(filters: EventFilters) {
  'use cache';
  cacheTag(EVENTS_CACHE_TAG);
  cacheLife('minutes');
  return listUpcomingEvents(getPrisma(), filters);
}

async function getCities() {
  'use cache';
  cacheTag(EVENTS_CACHE_TAG);
  cacheLife('minutes');
  return listEventCities(getPrisma());
}

async function SearchForm({ filters }: { filters: EventFilters }) {
  await connection();
  const cities = await getCities();
  // A plain GET form: works without JavaScript and keeps the filters in a shareable URL.
  return (
    <form action="/" method="get" role="search" className="mb-6 flex flex-wrap gap-2">
      <input
        type="search"
        name="query"
        defaultValue={filters.query}
        placeholder="Search events or venues"
        aria-label="Search events or venues"
        className="min-w-0 flex-1 rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-transparent"
      />
      <select
        name="city"
        defaultValue={filters.city ?? ''}
        aria-label="City"
        className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-transparent"
      >
        <option value="">All cities</option>
        {cities.map((city) => (
          <option key={city} value={city}>
            {city}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="rounded bg-zinc-900 px-4 py-2 text-white dark:bg-zinc-100 dark:text-zinc-900"
      >
        Search
      </button>
      {(filters.query || filters.city) && (
        <Link href="/" className="self-center text-sm text-zinc-500 hover:underline">
          Clear
        </Link>
      )}
    </form>
  );
}

async function UpcomingEvents({ filters }: { filters: EventFilters }) {
  // Never at build time: there is no database during `next build`.
  await connection();
  const events = await getUpcomingEvents(filters);

  if (events.length === 0) {
    return (
      <p className="text-zinc-500" data-testid="no-events">
        {filters.query || filters.city ? 'No events match your search.' : 'No events on sale yet.'}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-zinc-200 dark:divide-zinc-800" data-testid="event-list">
      {events.map((event) => (
        <li key={event.id} className="py-4">
          <Link href={`/events/${event.slug}`} className="font-medium hover:underline">
            {event.title}
          </Link>
          {event.waitingRoom && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
              Waiting room
            </span>
          )}
          <p className="text-sm text-zinc-500">
            {formatEventDate(event.startsAt)} · {event.venueName}, {event.city}
          </p>
        </li>
      ))}
    </ul>
  );
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/** Reads the URL filters (runtime data, so it must sit inside a Suspense boundary). */
async function Catalogue({ searchParams }: { searchParams: SearchParams }) {
  const filters = normaliseFilters(await searchParams);
  return (
    <>
      <Suspense fallback={null}>
        <SearchForm filters={filters} />
      </Suspense>
      <Suspense fallback={<p className="text-zinc-500">Loading events…</p>}>
        <UpcomingEvents filters={filters} />
      </Suspense>
    </>
  );
}

export default function Home({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
      <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">{APP_NAME}</h1>
        <LiveStatus />
      </header>

      <section aria-labelledby="upcoming-heading">
        <h2 id="upcoming-heading" className="mb-4 text-xl font-medium">
          Upcoming events
        </h2>
        <Suspense fallback={<p className="text-zinc-500">Loading events…</p>}>
          <Catalogue searchParams={searchParams} />
        </Suspense>
      </section>
    </main>
  );
}
