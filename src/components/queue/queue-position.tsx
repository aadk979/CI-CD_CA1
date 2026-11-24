'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { DURATION, EASE_OUT_EXPO, SPRING } from '@/components/motion/tokens';
import { badge, badgeTone, card } from '@/components/ui/styles';
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

/** "Almost there" once the fan is within this many admission batches of the front. */
const ALMOST_THERE_BATCHES = 3;
const RING_RADIUS = 88;

/** Bursts of brand-coloured dots for the admitted moment (transform and opacity only). */
function Celebration() {
  const reduce = useReducedMotion();
  if (reduce) return null;
  const colours = ['bg-violet-soft', 'bg-pink-soft', 'bg-amber-soft', 'bg-live', 'bg-success'];
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {Array.from({ length: 18 }, (_, i) => {
        const angle = (i / 18) * Math.PI * 2;
        return (
          <motion.span
            key={i}
            className={`absolute top-1/2 left-1/2 h-2 w-2 rounded-full ${colours[i % colours.length]}`}
            initial={{ x: 0, y: 0, opacity: 1, scale: 0.6 }}
            animate={{
              x: Math.cos(angle) * 130,
              y: Math.sin(angle) * 130,
              opacity: 0,
              scale: 1.2,
            }}
            transition={{ duration: 1.1, ease: EASE_OUT_EXPO, delay: (i % 3) * 0.05 }}
          />
        );
      })}
    </div>
  );
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
  const [lostConnection, setLostConnection] = useState(false);
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
      setLostConnection(false);
      if (connectedBefore.current) router.refresh();
      connectedBefore.current = true;
    });
    socket.on('disconnect', () => {
      setConnected(false);
      setLostConnection(true);
    });
    socket.on('connect_error', () => {
      if (connectedBefore.current) setLostConnection(true);
    });
    socket.on('queue:update', apply);

    return () => {
      socket.disconnect();
    };
  }, [eventId, router]);

  const served = Math.max(initialServed, live?.servedThrough ?? 0);
  const waiting = live && live.servedThrough >= initialServed ? live.waiting : initialWaiting;
  const position = ticket - served;
  const admitted = position <= 0;
  // Progress since this page loaded: the ring fills as the fan moves towards the front.
  const startedAt = Math.max(1, ticket - initialServed);
  const progress = admitted ? 1 : Math.min(1, Math.max(0.03, 1 - position / startedAt));
  const almostThere = !admitted && position <= batchSize * ALMOST_THERE_BATCHES;

  useEffect(() => {
    // The seat map checks the access pass on the server; this is just the shortcut there.
    if (admitted) router.replace(eventPath);
  }, [admitted, eventPath, router]);

  if (admitted) {
    return (
      <div className={`${card} relative overflow-hidden px-6 py-14 text-center`}>
        <div className="glow-live absolute inset-0 opacity-80" aria-hidden />
        <Celebration />
        <motion.p
          role="status"
          className="font-display text-display-sm text-ink relative font-semibold"
          data-testid="queue-admitted"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={SPRING}
        >
          It&apos;s your turn! Taking you to the seat map…
        </motion.p>
      </div>
    );
  }

  const circumference = 2 * Math.PI * RING_RADIUS;

  return (
    <div
      className={`${card} relative overflow-hidden p-6 md:p-8`}
      data-testid="queue-status"
      data-live={connected}
    >
      <div className="glow-violet absolute -top-24 -right-24 h-72 w-72" aria-hidden />

      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <p className="text-body text-sm">You&apos;re in the queue. Your place:</p>
        {connected ? (
          <span className={`${badge} ${badgeTone.live}`}>
            <span className="animate-live-pulse bg-live h-1.5 w-1.5 rounded-full" aria-hidden />
            Live
          </span>
        ) : (
          <span className={`${badge} ${lostConnection ? badgeTone.danger : badgeTone.neutral}`}>
            {lostConnection ? 'Reconnecting…' : 'Connecting…'}
          </span>
        )}
      </div>

      <div className="relative mx-auto my-8 h-56 w-56">
        <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90" aria-hidden>
          <defs>
            <linearGradient id="queue-ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="var(--color-violet-soft)" />
              <stop offset="0.5" stopColor="var(--color-pink-soft)" />
              <stop offset="1" stopColor="var(--color-amber-soft)" />
            </linearGradient>
          </defs>
          <circle
            cx="100"
            cy="100"
            r={RING_RADIUS}
            fill="none"
            stroke="var(--color-surface-3)"
            strokeWidth="10"
          />
          <motion.circle
            cx="100"
            cy="100"
            r={RING_RADIUS}
            fill="none"
            stroke="url(#queue-ring)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={false}
            animate={{ strokeDashoffset: circumference * (1 - progress) }}
            transition={{ duration: DURATION.slower, ease: EASE_OUT_EXPO }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p
            className="font-display text-ink text-6xl font-semibold tabular-nums"
            aria-live="polite"
            data-testid="queue-position"
          >
            {/* Re-keyed per value: the new number drops in (one element, so the text stays a number). */}
            <motion.span
              key={position}
              className="inline-block"
              initial={{ y: -16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: DURATION.base, ease: EASE_OUT_EXPO }}
            >
              {position}
            </motion.span>
          </p>
          <p className="text-muted mt-1 text-xs">
            {almostThere ? (
              <span className="text-amber-soft font-semibold">Almost there</span>
            ) : (
              'in line ahead of the seat map'
            )}
          </p>
        </div>
      </div>

      <dl className="relative grid grid-cols-2 gap-3 text-sm">
        <div className="border-hairline bg-surface-2 rounded-btn border px-4 py-3">
          <dt className="text-muted">Estimated wait</dt>
          <dd className="text-ink mt-1 font-semibold" data-testid="queue-wait">
            {formatWait(estimateWaitMs(position, batchSize, intervalMs))}
          </dd>
        </div>
        <div className="border-hairline bg-surface-2 rounded-btn border px-4 py-3">
          <dt className="text-muted">Fans waiting</dt>
          <dd className="text-ink mt-1 font-semibold tabular-nums" data-testid="queue-waiting">
            {Math.max(waiting, position)}
          </dd>
        </div>
      </dl>

      {lostConnection && (
        <p className="text-danger relative mt-4 text-sm" role="alert">
          Connection lost. Your place is safe; we&apos;re reconnecting and will refresh your
          position.
        </p>
      )}
      <p className="text-muted relative mt-5 text-sm">
        Keep this page open. You&apos;ll move to the seat map automatically when it&apos;s your
        turn. Refreshing won&apos;t lose your place.
      </p>
    </div>
  );
}
