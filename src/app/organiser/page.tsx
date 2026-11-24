import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { PublishButton } from '@/components/organiser/publish-button';
import { PageHeading, PageShell } from '@/components/ui/page';
import { badge, button, card, notice } from '@/components/ui/styles';
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
  DRAFT: 'border-hairline-strong bg-surface-3 text-body',
  ON_SALE: 'border-success/30 bg-success/10 text-success',
  SOLD_OUT: 'border-amber-soft/30 bg-amber-soft/10 text-amber-soft',
  CANCELLED: 'border-danger/30 bg-danger/10 text-danger',
};

async function Dashboard({ searchParams }: Pick<PageProps<'/organiser'>, 'searchParams'>) {
  await requireOrganiser();
  const [events, params] = await Promise.all([listOrganiserEvents(getPrisma()), searchParams]);
  const created = events.find((e) => e.slug === params.created);
  const published = events.find((e) => e.slug === params.published);

  return (
    <>
      {(created || published) && (
        <p role="status" className={`${notice.success} animate-fade-up mb-6`}>
          {created
            ? `“${created.title}” saved as a draft. Fans can’t see it until you publish it.`
            : `“${published!.title}” is on sale and listed in the event catalogue.`}
        </p>
      )}

      {events.length === 0 ? (
        <p className="border-hairline-strong rounded-card text-body border border-dashed px-6 py-12 text-center">
          No events yet. Create your first one.
        </p>
      ) : (
        <ul className={`${card} divide-hairline divide-y`} data-testid="organiser-events">
          {events.map((event) => (
            <li
              key={event.id}
              className="hover:bg-surface-2/60 flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition"
              data-testid="organiser-event"
            >
              <div>
                <Link
                  href={`/events/${event.slug}`}
                  className="text-ink font-semibold hover:underline"
                >
                  {event.title}
                </Link>
                <span
                  className={`${badge} ml-2 ${STATUS_STYLE[event.status]}`}
                  data-testid="event-status"
                >
                  {STATUS_LABEL[event.status]}
                </span>
                <p className="text-muted mt-1 text-sm">
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
    <PageShell width="narrow">
      <PageHeading
        eyebrow="Organiser"
        title="Your events"
        lead="Draft, preview and publish events. Publishing puts an event in the catalogue straight away."
      >
        <Link href="/organiser/events/new" className={`${button.primary} mt-6`}>
          New event
        </Link>
      </PageHeading>
      {/* The session and the events are request data: stream them in. */}
      <Suspense
        fallback={
          <div className="flex flex-col gap-3" aria-busy>
            <p className="sr-only">Loading events…</p>
            <div className="skeleton h-16 w-full" />
            <div className="skeleton h-16 w-full" />
          </div>
        }
      >
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}
