'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { holdSeatsAction, releaseSeatsAction, type HoldActionState } from '@/app/actions/holds';
import { button } from '@/components/ui/styles';
import { formatPrice } from '@/lib/format';
import type { SeatMapSection } from '@/lib/seating';
import { HoldCountdown } from './hold-countdown';
import { useSeatUpdates } from './use-seat-updates';

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
  /** Where to pay for held seats. */
  checkoutHref: string;
}

const SEAT_CLASS: Record<SeatState, string> = {
  available:
    'border-seat-available/80 bg-seat-available/10 hover:bg-seat-available/40 hover:scale-125',
  selected:
    'border-seat-selected bg-seat-selected shadow-[0_0_10px_var(--color-seat-selected)] scale-110',
  held: 'border-seat-held bg-seat-held shadow-[0_0_8px_var(--color-seat-held)]',
  unavailable: 'border-seat-taken bg-seat-taken',
  'not-for-sale': 'border-hairline bg-transparent',
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
  checkoutHref,
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
  // Changes pushed over the socket since this render win over the server's snapshot.
  const { changes: live, connected } = useSeatUpdates(eventId, ({ seatIds, status }) => {
    // A seat someone else takes leaves this fan's selection for good, even if it frees up later.
    if (status === 'taken') setPicked((current) => current.filter((id) => !seatIds.includes(id)));
  });
  const isTaken = (seatId: string) => {
    const change = live.get(seatId);
    return change ? change === 'taken' : takenSet.has(seatId);
  };
  // Derived, not stored: once a picked seat is held (or taken by someone else) after a
  // re-render, it simply drops out of the selection.
  const selected = picked.filter((id) => !isTaken(id) && !heldSet.has(id));
  const canPickMore = held.length + selected.length < maxSeats;
  const interactive = onSale && !holding && !releasing;

  function stateOf(seatId: string, priced: boolean): SeatState {
    if (!priced) return 'not-for-sale';
    if (heldSet.has(seatId)) return 'held'; // our own holds broadcast "taken" too
    if (isTaken(seatId)) return 'unavailable';
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul className="text-body flex flex-wrap gap-2 text-xs" aria-label="Seat legend">
          {LEGEND.map(([state, label]) => (
            <li
              key={state}
              className="border-hairline bg-surface flex items-center gap-2 rounded-full border px-3 py-1"
            >
              <span
                className={`h-3 w-3 rounded-[3px] border ${SEAT_CLASS[state].replace(/hover:\S+|scale-\S+/g, '')}`}
                aria-hidden
              />
              {label}
            </li>
          ))}
        </ul>
        <span
          className={`flex items-center gap-2 text-xs font-semibold ${connected ? 'text-live' : 'text-muted'}`}
        >
          <span
            className={`h-2 w-2 rounded-full ${connected ? 'bg-live animate-live-pulse' : 'bg-muted'}`}
            aria-hidden
          />
          {connected ? 'Live availability' : 'Connecting…'}
        </span>
      </div>

      <div
        className="border-hairline bg-surface/60 rounded-card flex flex-col gap-8 overflow-x-auto border p-4 md:p-6"
        data-testid="seat-map"
        data-live={connected}
      >
        <div
          className="border-hairline-strong bg-surface-2 text-muted mx-auto w-2/3 max-w-md rounded-b-[48px] border border-t-0 py-2 text-center text-[11px] font-semibold tracking-[0.4em]"
          aria-hidden
        >
          STAGE
        </div>
        {sections.map((section) => (
          <section key={section.id} aria-label={section.name} className="mx-auto">
            <h3 className="text-ink mb-3 text-sm font-semibold">
              {section.name}
              <span className="text-muted ml-2 font-normal">
                {section.price
                  ? `${section.price.tier} · ${formatPrice(section.price.cents, section.price.currency)}`
                  : 'Not on sale'}
              </span>
            </h3>
            <div className="flex flex-col gap-0.5">
              {section.rows.map((row) => (
                <div key={row.label} className="flex items-center gap-0.5">
                  <span className="text-muted w-7 shrink-0 pr-1 text-right font-mono text-[10px]">
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
                        data-seat
                        disabled={!clickable}
                        onClick={() => toggle(seat.id)}
                        className={`h-3.5 w-3.5 shrink-0 rounded-[3px] border transition duration-150 disabled:cursor-not-allowed ${SEAT_CLASS[state]}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="border-hairline-strong bg-surface-2/90 rounded-card shadow-mock sticky bottom-4 z-10 flex flex-col gap-3 border p-4 backdrop-blur-xl">
        {message && (
          <p
            role="status"
            className={`text-sm font-medium ${messageOk ? 'text-success' : 'text-danger'}`}
          >
            {message}
          </p>
        )}

        {held.length > 0 && heldUntil && (
          <form action={releaseAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="eventId" value={eventId} />
            <p className="text-body text-sm" data-testid="held-summary">
              <span
                className="bg-seat-held mr-2 inline-block h-2 w-2 rounded-full align-middle"
                aria-hidden
              />
              Holding <strong>{held.length}</strong> seat{held.length === 1 ? '' : 's'} (
              {total(held, seats)}) · expires in <HoldCountdown expiresAt={heldUntil} />
            </p>
            <Link href={checkoutHref} className={`${button.primary} sm:ml-auto`}>
              Check out
            </Link>
            <button type="submit" disabled={releasing} className={button.link}>
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
            <p className="text-body text-sm" data-testid="selection-summary">
              {selected.length === 0
                ? `Select up to ${maxSeats - held.length} seat${maxSeats - held.length === 1 ? '' : 's'}.`
                : `${selected.length} selected · ${total(selected, seats)}`}
            </p>
            {signedIn ? (
              <button
                type="submit"
                disabled={selected.length === 0 || holding}
                className={`${held.length > 0 ? button.secondary : button.primary} sm:ml-auto`}
              >
                {holding ? 'Holding…' : 'Hold seats'}
              </button>
            ) : (
              <Link href="/login" className={`${button.primary} sm:ml-auto`}>
                Log in to hold seats
              </Link>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
