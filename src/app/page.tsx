import { Suspense } from 'react';
import { connection } from 'next/server';
import { LiveStatus } from '@/components/live-status';
import { APP_NAME } from '@/lib/config';
import { getPrisma } from '@/lib/db';
import { listUpcomingEvents } from '@/lib/events';

const dateFormat = new Intl.DateTimeFormat('en-SG', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Singapore',
});

async function UpcomingEvents() {
  await connection(); // event list is live data — render per request
  const events = await listUpcomingEvents(getPrisma());

  if (events.length === 0) {
    return <p className="text-zinc-500">No events on sale yet.</p>;
  }

  return (
    <ul className="divide-y divide-zinc-200 dark:divide-zinc-800" data-testid="event-list">
      {events.map((event) => (
        <li key={event.id} className="py-4">
          <p className="font-medium">{event.title}</p>
          <p className="text-sm text-zinc-500">
            {dateFormat.format(event.startsAt)} · {event.venueName}, {event.city}
          </p>
        </li>
      ))}
    </ul>
  );
}

export default function Home() {
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
          <UpcomingEvents />
        </Suspense>
      </section>
    </main>
  );
}
