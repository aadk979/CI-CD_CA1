'use server';

import 'server-only';
import { refresh } from 'next/cache';
import { getPrisma } from '@/lib/db';
import { HOLD_MESSAGES, holdSeats, isValidId, parseHoldInput, releaseSeats } from '@/lib/holds';
import { scheduleHoldExpiry } from '@/server/jobs/release-holds';
import { QUEUE_NAMES, getQueue } from '@/server/queues';
import { getCurrentUser } from '@/server/session';

// Server Actions are public endpoints: identity comes from the session cookie,
// never from the form, and every input is re-validated before it reaches the database.

export interface HoldActionState {
  ok: boolean;
  message?: string;
}

const SIGN_IN_REQUIRED = 'Log in to hold seats.';

export async function holdSeatsAction(
  _prev: HoldActionState,
  formData: FormData,
): Promise<HoldActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: SIGN_IN_REQUIRED };

  const input = parseHoldInput(formData.get('eventId'), formData.getAll('seatId'));
  if (!input) return { ok: false, message: HOLD_MESSAGES.invalid };

  const result = await holdSeats(getPrisma(), { ...input, userId: user.id });
  refresh(); // re-render the seat map with fresh availability, win or lose
  if (!result.ok) return { ok: false, message: result.message };

  try {
    await scheduleHoldExpiry(
      getQueue(QUEUE_NAMES.holds),
      { eventId: input.eventId, userId: user.id },
      result.expiresAt,
    );
  } catch (err) {
    // The hold itself is saved. If Redis is briefly unavailable, the worker's periodic
    // sweep still releases these seats on time (within a minute), so don't fail the request.
    console.error('Could not schedule hold expiry job', err);
  }

  const count = result.seatIds.length;
  return { ok: true, message: `${count} seat${count === 1 ? '' : 's'} held for you.` };
}

export async function releaseSeatsAction(
  _prev: HoldActionState,
  formData: FormData,
): Promise<HoldActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: SIGN_IN_REQUIRED };

  const eventId = formData.get('eventId');
  if (!isValidId(eventId)) return { ok: false, message: HOLD_MESSAGES.notFound };

  const released = await releaseSeats(getPrisma(), { eventId, userId: user.id });
  refresh();
  return { ok: true, message: released.length ? 'Your seats have been released.' : undefined };
}
