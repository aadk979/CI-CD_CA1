import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { joinQueueAction } from '@/app/actions/queue';
import { QueuePosition } from '@/components/queue/queue-position';
import { BackLink, PageShell } from '@/components/ui/page';
import { button, card } from '@/components/ui/styles';
import { ACCESS_PASS_TTL_MS } from '@/lib/config';
import { getPrisma } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { isOnSale } from '@/lib/events';
import { estimateWaitMs, formatEventDate, formatWait } from '@/lib/format';
import { getRedis } from '@/lib/redis';
import { getQueueStatus } from '@/lib/waiting-room';
import { getCurrentUser } from '@/server/session';

async function WaitingRoom({ params }: Pick<PageProps<'/events/[slug]/queue'>, 'params'>) {
  const { slug } = await params;
  const [event, user] = await Promise.all([
    getPrisma().event.findUnique({
      where: { slug },
      select: {
        id: true,
        title: true,
        status: true,
        startsAt: true,
        waitingRoom: true,
        venue: { select: { name: true, city: true } },
      },
    }),
    getCurrentUser(),
  ]);
  if (!event) notFound();
  const eventPath = `/events/${slug}`;
  // Nothing to queue for: the event page shows the seat map, or why it isn't on sale.
  if (!event.waitingRoom || !isOnSale(event)) redirect(eventPath);

  const header = (
    <header className="mb-8">
      <p className="text-amber-soft flex items-center gap-2 text-xs font-semibold tracking-[0.14em] uppercase">
        <span className="bg-amber-soft h-1.5 w-1.5 rounded-full" aria-hidden />
        Waiting room
      </p>
      <h1 className="font-display text-display-sm text-ink md:text-display-md mt-3 font-semibold">
        {event.title}
      </h1>
      <p className="text-body mt-2">
        {formatEventDate(event.startsAt)} · {event.venue.name}, {event.venue.city}
      </p>
    </header>
  );

  if (!user) {
    return (
      <Layout header={header}>
        <div className={`${card} p-6 md:p-8`}>
          <p className="text-body mb-6">
            Demand for this event is high, so fans are let in to pick seats in the order they
            arrive. Log in to join the queue.
          </p>
          <Link href="/login" className={button.primary}>
            Log in to join the queue
          </Link>
        </div>
      </Layout>
    );
  }

  const status = await getQueueStatus(getRedis(), event.id, user.id);
  if (status.state === 'admitted') redirect(eventPath);

  const { WAITING_ROOM_BATCH_SIZE: batchSize, WAITING_ROOM_INTERVAL_MS: intervalMs } = getEnv();

  if (status.state === 'queued') {
    return (
      <Layout header={header}>
        <QueuePosition
          eventId={event.id}
          eventPath={eventPath}
          ticket={status.ticket}
          servedThrough={status.servedThrough}
          waiting={status.waiting}
          batchSize={batchSize}
          intervalMs={intervalMs}
        />
      </Layout>
    );
  }

  // Not in the queue yet. Joining puts this fan behind everyone already waiting.
  const wait = estimateWaitMs(status.waiting + 1, batchSize, intervalMs);
  return (
    <Layout header={header}>
      <div className={`${card} p-6 md:p-8`}>
        <p className="text-body mb-6">
          Demand for this event is high, so fans are let in to pick seats in the order they join the
          queue.
        </p>
        <div className="mb-6 grid grid-cols-2 gap-3 text-sm" aria-hidden>
          <div className="border-hairline bg-surface-2 rounded-btn border px-4 py-3">
            <p className="text-muted">Fans waiting</p>
            <p className="font-display text-ink mt-1 text-2xl font-semibold tabular-nums">
              {status.waiting}
            </p>
          </div>
          <div className="border-hairline bg-surface-2 rounded-btn border px-4 py-3">
            <p className="text-muted">Wait if you join now</p>
            <p className="text-ink mt-1 font-semibold">{formatWait(wait)}</p>
          </div>
        </div>
        <p className="text-muted mb-6 text-sm" data-testid="queue-preview">
          {status.waiting === 0
            ? 'Nobody is waiting right now.'
            : `${status.waiting} fan${status.waiting === 1 ? ' is' : 's are'} waiting.`}{' '}
          Estimated wait if you join now: {formatWait(wait)}.
        </p>
        <form action={joinQueueAction}>
          <input type="hidden" name="slug" value={slug} />
          <button type="submit" className={button.primary}>
            Join the queue
          </button>
        </form>
      </div>
    </Layout>
  );
}

const HOW = [
  ['Your place is fixed', 'You keep your spot in line, even if you refresh or reconnect.'],
  ['Fans go in batches', 'A few fans are let in at a time, in the order they joined.'],
  [
    'You get a shopping pass',
    `Once in, you have ${ACCESS_PASS_TTL_MS / 60_000} minutes to pick and hold seats.`,
  ],
] as const;

/** Two columns on desktop: the live status on the left, what happens next on the right. */
function Layout({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <>
      {header}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div>{children}</div>
        <aside aria-labelledby="queue-how" className="flex flex-col gap-3">
          <h2 id="queue-how" className="font-display text-ink text-lg font-semibold">
            How the waiting room works
          </h2>
          <ol className="flex flex-col gap-3">
            {HOW.map(([title, body], i) => (
              <li key={title} className={`${card} flex gap-4 p-5`}>
                <span className="bg-violet/15 text-violet-soft flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-sm font-semibold">
                  {i + 1}
                </span>
                <span>
                  <span className="text-ink block font-semibold">{title}</span>
                  <span className="text-body text-sm">{body}</span>
                </span>
              </li>
            ))}
          </ol>
          <Link href="/how-it-works#fair-queue" className={`${button.link} mt-1`}>
            More about fair queueing
          </Link>
        </aside>
      </div>
    </>
  );
}

export default function QueuePage({ params }: PageProps<'/events/[slug]/queue'>) {
  return (
    <PageShell tone="live">
      <BackLink href="/events">All events</BackLink>
      <div className="mt-6">
        {/* The session and the queue are request data: stream them in. */}
        <Suspense
          fallback={
            <div className="flex flex-col gap-4" aria-busy>
              <p className="sr-only">Checking the queue…</p>
              <div className="skeleton h-10 w-2/3" />
              <div className="skeleton h-72 w-full" />
            </div>
          }
        >
          <WaitingRoom params={params} />
        </Suspense>
      </div>
    </PageShell>
  );
}
