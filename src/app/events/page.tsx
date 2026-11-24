import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { CatalogueSkeleton } from '@/components/events/catalogue-skeleton';
import { EventCard } from '@/components/events/event-card';
import { LiveStatus } from '@/components/live-status';
import { PageHeading, PageShell } from '@/components/ui/page';
import { button, input } from '@/components/ui/styles';
import { normaliseFilters, type EventFilters } from '@/lib/events';
import { getCities, getUpcomingEvents } from './queries';

export const metadata: Metadata = { title: 'Events' };

async function SearchForm({ filters }: { filters: EventFilters }) {
  await connection();
  const cities = await getCities();
  // A plain GET form: works without JavaScript and keeps the filters in a shareable URL.
  return (
    <form
      action="/events"
      method="get"
      role="search"
      className="rounded-card border-hairline bg-surface/80 mb-10 flex flex-col gap-2 border p-2 backdrop-blur sm:flex-row"
    >
      <div className="relative min-w-0 flex-1">
        <svg
          viewBox="0 0 24 24"
          className="text-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          name="query"
          defaultValue={filters.query}
          placeholder="Search events or venues"
          aria-label="Search events"
          className="rounded-btn text-ink placeholder:text-muted focus-visible:ring-violet-soft h-10 w-full bg-transparent pr-3 pl-9 text-sm outline-none focus-visible:ring-2"
        />
      </div>
      <select
        name="city"
        defaultValue={filters.city ?? ''}
        aria-label="City"
        className={`${input} sm:w-48`}
      >
        <option value="">All cities</option>
        {cities.map((city) => (
          <option key={city} value={city}>
            {city}
          </option>
        ))}
      </select>
      <button type="submit" className={button.primary}>
        Search
      </button>
      {(filters.query || filters.city) && (
        <Link href="/events" className={button.ghost}>
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
      <div className="rounded-card border-hairline-strong border border-dashed px-6 py-16 text-center">
        <p className="text-body" data-testid="no-events">
          {filters.query || filters.city
            ? 'No events match your search.'
            : 'No events on sale yet.'}
        </p>
      </div>
    );
  }

  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="event-list">
      {events.map((event, i) => (
        <li
          key={event.id}
          className="animate-fade-up"
          style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
        >
          <EventCard event={event} />
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
      <Suspense fallback={<div className="rounded-card border-hairline mb-10 h-14 border" />}>
        <SearchForm filters={filters} />
      </Suspense>
      <Suspense
        fallback={
          <>
            <p className="sr-only">Loading events…</p>
            <CatalogueSkeleton />
          </>
        }
      >
        <UpcomingEvents filters={filters} />
      </Suspense>
    </>
  );
}

export default function EventsPage({ searchParams }: PageProps<'/events'>) {
  return (
    <PageShell>
      <PageHeading
        eyebrow="Catalogue"
        title={
          <>
            Find your next <span className="text-gradient">night out</span>
          </>
        }
        lead="Every event on sale, soonest first. High-demand shows open with a fair, first-come waiting room."
      >
        <div className="mt-5">
          <LiveStatus />
        </div>
      </PageHeading>

      <section aria-labelledby="upcoming-heading">
        <h2 id="upcoming-heading" className="font-display text-ink mb-4 text-xl font-semibold">
          Upcoming events
        </h2>
        <Suspense fallback={<CatalogueSkeleton />}>
          <Catalogue searchParams={searchParams} />
        </Suspense>
      </section>
    </PageShell>
  );
}
