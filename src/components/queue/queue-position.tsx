'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { estimateWaitMs, formatWait } from '@/lib/format';
import {
  SOCKET_PATH,
  type ClientToServerEvents,
  type QueueUpdatePayload,
  type ServerToClientEvents,
} from '@/lib/realtime';

export interface QueuePositionProps {
  eventId: string;
  /** Where to go once admitted: the event's seat map. */
  eventPath: string;
  /** This fan's place in line. Fixed for as long as they stay in the queue. */
  ticket: number;
  /** Snapshot from the server render; live updates only ever move it forward. */
  servedThrough: number;
  waiting: number;
  batchSize: number;
  intervalMs: number;
}

/**
 * A fan's live place in the waiting room (SCRUM-36). The server broadcasts how far the
 * queue has moved; position is `ticket - servedThrough`, so it updates without a reload.
 * Once the fan's ticket is reached, they're sent to the seat map automatically.
 */
export function QueuePosition({
  eventId,
  eventPath,
  ticket,
  servedThrough: initialServed,
  waiting: initialWaiting,
  batchSize,
  intervalMs,
}: QueuePositionProps) {
  const router = useRouter();
  const [live, setLive] = useState<QueueUpdatePayload | null>(null);
  const [connected, setConnected] = useState(false);
  const connectedBefore = useRef(false);

  useEffect(() => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({ path: SOCKET_PATH });

    // Out-of-order messages can't move the queue backwards.
    const apply = (update: QueueUpdatePayload | null) => {
      if (!update || update.eventId !== eventId) return;
      setLive((current) =>
        current && current.servedThrough > update.servedThrough ? current : update,
      );
    };

    socket.on('connect', () => {
      // Rooms don't survive a reconnect: rejoin every time. The ack carries the current
      // numbers, covering anything broadcast while this fan wasn't listening.
      socket.emit('queue:watch', eventId, apply);
      setConnected(true);
      if (connectedBefore.current) router.refresh();
      connectedBefore.current = true;
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('queue:update', apply);

    return () => {
      socket.disconnect();
    };
  }, [eventId, router]);

  const served = Math.max(initialServed, live?.servedThrough ?? 0);
  const waiting = live && live.servedThrough >= initialServed ? live.waiting : initialWaiting;
  const position = ticket - served;
  const admitted = position <= 0;

  useEffect(() => {
    // The seat map checks the access pass on the server; this is just the shortcut there.
    if (admitted) router.replace(eventPath);
  }, [admitted, eventPath, router]);

  if (admitted) {
    return (
      <p role="status" className="text-lg font-medium" data-testid="queue-admitted">
        It&apos;s your turn! Taking you to the seat map…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="queue-status" data-live={connected}>
      <p className="text-zinc-600 dark:text-zinc-400">You&apos;re in the queue. Your place:</p>
      <p
        className="text-6xl font-semibold tabular-nums"
        aria-live="polite"
        data-testid="queue-position"
      >
        {position}
      </p>
      <dl className="grid grid-cols-2 gap-4 text-sm sm:max-w-sm">
        <div>
          <dt className="text-zinc-500">Estimated wait</dt>
          <dd className="font-medium" data-testid="queue-wait">
            {formatWait(estimateWaitMs(position, batchSize, intervalMs))}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Fans waiting</dt>
          <dd className="font-medium tabular-nums" data-testid="queue-waiting">
            {Math.max(waiting, position)}
          </dd>
        </div>
      </dl>
      <p className="text-sm text-zinc-500">
        Keep this page open. You&apos;ll move to the seat map automatically when it&apos;s your
        turn. Refreshing won&apos;t lose your place.
      </p>
    </div>
  );
}
