'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { holdSeatsAction, releaseSeatsAction, type HoldActionState } from '@/app/actions/holds';
import { formatPrice } from '@/lib/format';
import type { SeatMapSection } from '@/lib/seating';
import { HoldCountdown } from './hold-countdown';

type SeatState = 'available' | 'selected' | 'held' | 'unavailable' | 'not-for-sale';

interface SeatInfo {
  label: string;
  price: SeatMapSection['price'];
}

export interface SeatPickerProps {
  eventId: string;
  sections: SeatMapSection[];
  /** Seats taken by other fans (held or sold). */
  unavailable: string[];
  /** Seats this fan is holding. */
  held: string[];
  heldUntil: string | null;
  signedIn: boolean;
  onSale: boolean;
  maxSeats: number;
}

const SEAT_CLASS: Record<SeatState, string> = {
  available:
    'border-emerald-600 bg-white hover:bg-emerald-100 dark:border-emerald-500 dark:bg-zinc-950',
  selected: 'border-zinc-900 bg-zinc-900 dark:border-zinc-100 dark:bg-zinc-100',
  held: 'border-sky-600 bg-sky-500',
  unavailable: 'border-zinc-300 bg-zinc-300 dark:border-zinc-700 dark:bg-zinc-700',
  'not-for-sale': 'border-zinc-200 bg-transparent dark:border-zinc-800',
};

const LEGEND: [SeatState, string][] = [
  ['available', 'Available'],
  ['selected', 'Selected'],
  ['held', 'Held by you'],
  ['unavailable', 'Taken'],
];

const initialState: HoldActionState = { ok: false };

function total(seatIds: string[], seats: Map<string, SeatInfo>) {
  const first = seats.get(seatIds[0])?.price;
  if (!first) return null;
  const cents = seatIds.reduce((sum, id) => sum + (seats.get(id)?.price?.cents ?? 0), 0);
  return formatPrice(cents, first.currency);
}

/** Interactive seat map: pick seats, hold them for 10 minutes, or release them. */
export function SeatPicker({
  eventId,
  sections,
  unavailable,
  held,
  heldUntil,
  signedIn,
  onSale,
  maxSeats,
}: SeatPickerProps) {
  const [picked, setPicked] = useState<string[]>([]);
  // Result of whichever action ran last (hold or release), shown in the status line.
  const [notice, setNotice] = useState<HoldActionState | null>(null);
  const [, holdAction, holding] = useActionState(
    async (prev: HoldActionState, formData: FormData) => {
      const result = await holdSeatsAction(prev, formData);
      if (result.ok) setPicked([]); // held seats leave the selection for good
      setNotice(result);
      return result;
    },
    initialState,
  );
  const [, releaseAction, releasing] = useActionState(
    async (prev: HoldActionState, formData: FormData) => {
      const result = await releaseSeatsAction(prev, formData);
      setNotice(result);
      return result;
    },
    initialState,
  );

  const seats = useMemo(() => {
    const info = new Map<string, SeatInfo>();
    for (const section of sections) {
      for (const row of section.rows) {
        for (const seat of row.seats) {
          info.set(seat.id, {
            label: `${section.name} row ${row.label} seat ${seat.number}`,
            price: section.price,
          });
        }
      }
    }
    return info;
  }, [sections]);

  const takenSet = useMemo(() => new Set(unavailable), [unavailable]);
  const heldSet = useMemo(() => new Set(held), [held]);
  // Derived, not stored: once a picked seat is held (or taken by someone else) after a
  // re-render, it simply drops out of the selection.
  const selected = picked.filter((id) => !takenSet.has(id) && !heldSet.has(id));
  const canPickMore = held.length + selected.length < maxSeats;
  const interactive = onSale && !holding && !releasing;

  function stateOf(seatId: string, priced: boolean): SeatState {
    if (!priced) return 'not-for-sale';
    if (heldSet.has(seatId)) return 'held';
    if (takenSet.has(seatId)) return 'unavailable';
    if (selected.includes(seatId)) return 'selected';
    return 'available';
  }

  function toggle(seatId: string) {
    setPicked((current) =>
      current.includes(seatId) ? current.filter((id) => id !== seatId) : [...current, seatId],
    );
  }

  const message = holding || releasing ? null : notice?.message;
  const messageOk = notice?.ok ?? false;

  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-wrap gap-4 text-sm text-zinc-600 dark:text-zinc-400">
        {LEGEND.map(([state, label]) => (
          <li key={state} className="flex items-center gap-2">
            <span className={`h-3.5 w-3.5 rounded-sm border ${SEAT_CLASS[state]}`} aria-hidden />
            {label}
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-8 overflow-x-auto" data-testid="seat-map">
        {sections.map((section) => (
          <section key={section.id} aria-label={section.name}>
            <h3 className="mb-2 text-sm font-medium">
              {section.name}
              <span className="ml-2 font-normal text-zinc-500">
                {section.price
                  ? `${section.price.tier} · ${formatPrice(section.price.cents, section.price.currency)}`
                  : 'Not on sale'}
              </span>
            </h3>
            <div className="flex flex-col gap-0.5">
              {section.rows.map((row) => (
                <div key={row.label} className="flex items-center gap-0.5">
                  <span className="w-7 shrink-0 text-right font-mono text-[10px] text-zinc-500">
                    {row.label}
                  </span>
                  {row.seats.map((seat) => {
                    const state = stateOf(seat.id, section.price !== null);
                    const clickable =
                      interactive &&
                      (state === 'selected' || (state === 'available' && canPickMore));
                    return (
                      <button
                        key={seat.id}
                        type="button"
                        aria-label={seats.get(seat.id)!.label}
                        aria-pressed={state === 'selected'}
                        data-state={state}
                        disabled={!clickable}
                        onClick={() => toggle(seat.id)}
                        className={`h-3.5 w-3.5 shrink-0 rounded-sm border transition-colors disabled:cursor-not-allowed ${SEAT_CLASS[state]}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="sticky bottom-0 flex flex-col gap-3 border-t border-zinc-200 bg-white/95 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        {message && (
          <p
            role="status"
            className={`text-sm ${messageOk ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}
          >
            {message}
          </p>
        )}

        {held.length > 0 && heldUntil && (
          <form action={releaseAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="eventId" value={eventId} />
            <p className="text-sm" data-testid="held-summary">
              Holding <strong>{held.length}</strong> seat{held.length === 1 ? '' : 's'} (
              {total(held, seats)}) · expires in <HoldCountdown expiresAt={heldUntil} />
            </p>
            <button
              type="submit"
              disabled={releasing}
              className="text-sm font-medium text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              Release seats
            </button>
          </form>
        )}

        {onSale && (
          <form action={holdAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="eventId" value={eventId} />
            {selected.map((id) => (
              <input key={id} type="hidden" name="seatId" value={id} />
            ))}
            <p className="text-sm text-zinc-600 dark:text-zinc-400" data-testid="selection-summary">
              {selected.length === 0
                ? `Select up to ${maxSeats - held.length} seat${maxSeats - held.length === 1 ? '' : 's'}.`
                : `${selected.length} selected · ${total(selected, seats)}`}
            </p>
            {signedIn ? (
              <button
                type="submit"
                disabled={selected.length === 0 || holding}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                {holding ? 'Holding…' : 'Hold seats'}
              </button>
            ) : (
              <Link href="/login" className="text-sm font-medium underline">
                Log in to hold seats
              </Link>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
