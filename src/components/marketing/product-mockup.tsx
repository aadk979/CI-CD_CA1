'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { DURATION, EASE_OUT_EXPO, SPRING } from '@/components/motion/tokens';

const ROWS = 7;
const COLS = 14;
/** Deterministic "taken" pattern so server and client render the same map. */
const TAKEN = new Set(
  Array.from({ length: ROWS * COLS }, (_, i) => i).filter((i) => (i * 37 + 11) % 7 < 3),
);
const START = 48;
/** Seats that get picked, one after another, while the demo loops. */
const PICKS = [45, 46, 60, 61];

/** A deterministic 21x21 pseudo-QR for the floating ticket (decorative only). */
export function MiniQr({
  seed = 7,
  className = 'h-16 w-16',
}: {
  seed?: number;
  className?: string;
}) {
  const cells: [number, number][] = [];
  for (let y = 0; y < 21; y++) {
    for (let x = 0; x < 21; x++) {
      const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      if (finder) continue;
      if (((x * 73 + y * 151 + seed * 17) ^ (x * y)) % 3 === 0) cells.push([x, y]);
    }
  }
  const finder = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width="7" height="7" fill="var(--color-on-light)" />
      <rect x={x + 1} y={y + 1} width="5" height="5" fill="var(--color-ink)" />
      <rect x={x + 2} y={y + 2} width="3" height="3" fill="var(--color-on-light)" />
    </g>
  );
  return (
    <svg viewBox="-1 -1 23 23" className={`${className} bg-ink rounded-md`} aria-hidden>
      {finder(0, 0)}
      {finder(14, 0)}
      {finder(0, 14)}
      {cells.map(([x, y]) => (
        <rect key={`${x}.${y}`} x={x} y={y} width="1" height="1" fill="var(--color-on-light)" />
      ))}
    </svg>
  );
}

/**
 * The hero's right-hand card: real product UI in miniature (waiting-room position, a seat
 * map fragment, a hold countdown and a QR ticket) rather than a stock illustration. It loops
 * a short story: the queue counts down, the fan is let in, picks two seats, holds them.
 */
export function ProductMockup() {
  const reduce = useReducedMotion();
  const [position, setPosition] = useState(START);
  const [picked, setPicked] = useState(0);
  const [hold, setHold] = useState(9 * 60 + 42);

  useEffect(() => {
    if (reduce) return;
    const timer = setInterval(() => {
      setPosition((p) => (p <= 0 ? START : Math.max(0, p - 4)));
    }, 900);
    const seatTimer = setInterval(() => setPicked((n) => (n >= PICKS.length ? 0 : n + 1)), 1600);
    const clock = setInterval(() => setHold((s) => (s <= 0 ? 600 : s - 1)), 1000);
    return () => {
      clearInterval(timer);
      clearInterval(seatTimer);
      clearInterval(clock);
    };
  }, [reduce]);

  const admitted = position === 0;
  const progress = 1 - position / START;
  const selected = new Set(PICKS.slice(0, picked));

  return (
    <div
      role="img"
      aria-label="Preview of TixQueue: a live waiting-room position, a seat map with two seats selected, and a QR ticket"
      className="relative"
    >
      <div
        className="rounded-mock bg-gradient-brand absolute -inset-px opacity-50 blur-[2px]"
        aria-hidden
      />
      <div className="rounded-mock bg-surface shadow-mock relative overflow-hidden">
        {/* Window bar */}
        <div className="border-hairline flex items-center gap-2 border-b px-4 py-3">
          <span className="bg-surface-3 h-2.5 w-2.5 rounded-full" />
          <span className="bg-surface-3 h-2.5 w-2.5 rounded-full" />
          <span className="bg-surface-3 h-2.5 w-2.5 rounded-full" />
          <span className="text-muted ml-2 truncate font-mono text-[11px]">
            /events/aurora-world-tour/queue
          </span>
          <span className="border-live/30 bg-live/10 text-live ml-auto flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold">
            <span className="animate-live-pulse bg-live h-1.5 w-1.5 rounded-full" />
            Live
          </span>
        </div>

        {/* Queue widget */}
        <div className="border-hairline border-b p-5">
          <p className="text-amber-soft text-[11px] font-semibold tracking-[0.14em] uppercase">
            Waiting room
          </p>
          <div className="mt-2 flex items-end justify-between gap-4">
            <div>
              <p className="text-muted text-xs">{admitted ? 'Status' : 'Your place in line'}</p>
              <div className="font-display text-ink relative h-11 overflow-hidden text-4xl leading-tight font-semibold tabular-nums">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={admitted ? 'in' : position}
                    className={`block ${admitted ? 'text-gradient' : ''}`}
                    initial={{ y: 24, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -24, opacity: 0 }}
                    transition={{ duration: DURATION.base, ease: EASE_OUT_EXPO }}
                  >
                    {admitted ? "You're in!" : position}
                  </motion.span>
                </AnimatePresence>
              </div>
            </div>
            <p className="text-muted pb-1 text-right text-xs">
              ~{Math.max(1, Math.ceil(position / 20))} min
              <br />
              <span className="text-body">{position + 212} waiting</span>
            </p>
          </div>
          <div className="bg-surface-3 mt-3 h-1.5 overflow-hidden rounded-full">
            <motion.div
              className="bg-gradient-brand h-full origin-left rounded-full"
              animate={{ scaleX: Math.max(0.04, progress) }}
              transition={{ duration: DURATION.slow, ease: EASE_OUT_EXPO }}
            />
          </div>
        </div>

        {/* Seat map fragment */}
        <div className="p-5">
          <div className="border-hairline-strong bg-surface-2 text-muted mx-auto mb-4 h-6 w-2/3 rounded-b-[40px] border border-t-0 text-center text-[10px] leading-6 font-semibold tracking-[0.3em]">
            STAGE
          </div>
          <div
            className="mx-auto grid w-fit gap-1"
            style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: ROWS * COLS }, (_, i) => {
              const isSel = selected.has(i);
              const taken = TAKEN.has(i) && !PICKS.includes(i);
              return (
                <motion.span
                  key={i}
                  className={`h-3 w-3 rounded-[3px] border sm:h-3.5 sm:w-3.5 ${
                    isSel
                      ? 'border-seat-selected bg-seat-selected'
                      : taken
                        ? 'border-seat-taken bg-seat-taken'
                        : 'border-seat-available/70 bg-transparent'
                  }`}
                  animate={{ scale: isSel ? [1, 1.5, 1] : 1 }}
                  transition={SPRING}
                />
              );
            })}
          </div>
          <div className="text-muted mt-4 flex flex-wrap justify-center gap-3 text-[10px]">
            <span className="flex items-center gap-1">
              <span className="border-seat-available h-2 w-2 rounded-[2px] border" /> Available
            </span>
            <span className="flex items-center gap-1">
              <span className="bg-seat-selected h-2 w-2 rounded-[2px]" /> Selected
            </span>
            <span className="flex items-center gap-1">
              <span className="bg-seat-taken h-2 w-2 rounded-[2px]" /> Taken
            </span>
          </div>
        </div>

        {/* Sticky summary */}
        <div className="border-hairline bg-surface-2 flex items-center gap-3 border-t px-5 py-3 text-xs">
          <span className="text-body">
            <strong className="text-ink">{Math.max(selected.size, 2)} seats</strong> held ·{' '}
            <span className="text-pink-soft font-mono tabular-nums">
              {Math.floor(hold / 60)}:{String(hold % 60).padStart(2, '0')}
            </span>
          </span>
          <span className="rounded-btn bg-ink text-on-light ml-auto px-3 py-1.5 font-semibold">
            Check out
          </span>
        </div>
      </div>

      {/* Floating ticket */}
      <motion.div
        className="rounded-card border-hairline-strong bg-surface-2/95 shadow-mock absolute -bottom-8 -left-6 hidden w-56 items-center gap-3 border p-3 backdrop-blur sm:flex"
        initial={{ opacity: 0, y: 20, rotate: -6 }}
        animate={{ opacity: 1, y: 0, rotate: -4 }}
        transition={{ duration: DURATION.slower, ease: EASE_OUT_EXPO, delay: 0.9 }}
      >
        <MiniQr />
        <div className="text-[11px] leading-snug">
          <p className="text-ink font-semibold">Admit one</p>
          <p className="text-muted">Floor · Row A · Seat 12</p>
          <p className="text-success mt-1 font-semibold">Paid · $188.00</p>
        </div>
      </motion.div>
    </div>
  );
}
