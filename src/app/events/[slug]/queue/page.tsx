import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { joinQueueAction } from '@/app/actions/queue';
import { QueuePosition } from '@/components/queue/queue-position';
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
      <p className="text-sm font-medium tracking-wide text-amber-700 uppercase dark:text-amber-400">
        Waiting room
      </p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">{event.title}</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        {formatEventDate(event.startsAt)} · {event.venue.name}, {event.venue.city}
      </p>
    </header>
  );

  if (!user) {
    return (
      <>
        {header}
        <p className="mb-4">
          Demand for this event is high, so fans are let in to pick seats in the order they arrive.
          Log in to join the queue.
        </p>
        <Link
          href="/login"
          className="inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Log in to join the queue
        </Link>
      </>
    );
  }

  const status = await getQueueStatus(getRedis(), event.id, user.id);
  if (status.state === 'admitted') redirect(eventPath);

  const { WAITING_ROOM_BATCH_SIZE: batchSize, WAITING_ROOM_INTERVAL_MS: intervalMs } = getEnv();

  if (status.state === 'queued') {
    return (
      <>
        {header}
        <QueuePosition
          eventId={event.id}
          eventPath={eventPath}
          ticket={status.ticket}
          servedThrough={status.servedThrough}
          waiting={status.waiting}
          batchSize={batchSize}
          intervalMs={intervalMs}
        />
      </>
    );
  }

  // Not in the queue yet. Joining puts this fan behind everyone already waiting.
  const wait = estimateWaitMs(status.waiting + 1, batchSize, intervalMs);
  return (
    <>
      {header}
      <p className="mb-2">
        Demand for this event is high, so fans are let in to pick seats in the order they join the
        queue.
      </p>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400" data-testid="queue-preview">
        {status.waiting === 0
          ? 'Nobody is waiting right now.'
          : `${status.waiting} fan${status.waiting === 1 ? ' is' : 's are'} waiting.`}{' '}
        Estimated wait if you join now: {formatWait(wait)}.
      </p>
      <form action={joinQueueAction}>
        <input type="hidden" name="slug" value={slug} />
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Join the queue
        </button>
      </form>
    </>
  );
}

export default function QueuePage({ params }: PageProps<'/events/[slug]/queue'>) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
        ← All events
      </Link>
      <div className="mt-4">
        {/* The session and the queue are request data: stream them in. */}
        <Suspense fallback={<p className="text-zinc-500">Checking the queue…</p>}>
          <WaitingRoom params={params} />
        </Suspense>
      </div>
    </main>
  );
}
