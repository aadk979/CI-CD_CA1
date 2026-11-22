import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { PublishButton } from '@/components/organiser/publish-button';
import { getPrisma } from '@/lib/db';
import { formatEventDate } from '@/lib/format';
import { listOrganiserEvents, type OrganiserEventRow } from '@/lib/organiser';
import { requireOrganiser } from '@/server/organiser';

export const metadata: Metadata = { title: 'Organiser', robots: { index: false } };

const STATUS_LABEL: Record<OrganiserEventRow['status'], string> = {
  DRAFT: 'Draft',
  ON_SALE: 'On sale',
  SOLD_OUT: 'Sold out',
  CANCELLED: 'Cancelled',
};

const STATUS_STYLE: Record<OrganiserEventRow['status'], string> = {
  DRAFT: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  ON_SALE: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
  SOLD_OUT: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  CANCELLED: 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200',
};

async function Dashboard({ searchParams }: Pick<PageProps<'/organiser'>, 'searchParams'>) {
  await requireOrganiser();
  const [events, params] = await Promise.all([listOrganiserEvents(getPrisma()), searchParams]);
  const created = events.find((e) => e.slug === params.created);
  const published = events.find((e) => e.slug === params.published);

  return (
    <>
      {(created || published) && (
        <p
          role="status"
          className="mb-6 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
        >
          {created
            ? `“${created.title}” saved as a draft. Fans can’t see it until you publish it.`
            : `“${published!.title}” is on sale and listed on the home page.`}
        </p>
      )}

      {events.length === 0 ? (
        <p className="text-zinc-500">No events yet.</p>
      ) : (
        <ul
          className="divide-y divide-zinc-200 dark:divide-zinc-800"
          data-testid="organiser-events"
        >
          {events.map((event) => (
            <li
              key={event.id}
              className="flex flex-wrap items-center justify-between gap-4 py-4"
              data-testid="organiser-event"
            >
              <div>
                <Link href={`/events/${event.slug}`} className="font-medium hover:underline">
                  {event.title}
                </Link>
                <span
                  className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[event.status]}`}
                  data-testid="event-status"
                >
                  {STATUS_LABEL[event.status]}
                </span>
                <p className="text-sm text-zinc-500">
                  {formatEventDate(event.startsAt)} · {event.venueName} · {event.ticketsSold}{' '}
                  {event.ticketsSold === 1 ? 'ticket' : 'tickets'} sold
                </p>
              </div>
              {event.status === 'DRAFT' && <PublishButton eventId={event.id} title={event.title} />}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function OrganiserPage({ searchParams }: PageProps<'/organiser'>) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Your events</h1>
        <Link
          href="/organiser/events/new"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          New event
        </Link>
      </div>
      {/* The session and the events are request data: stream them in. */}
      <Suspense fallback={<p className="text-zinc-500">Loading events…</p>}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
