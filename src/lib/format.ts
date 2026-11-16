/** Display formatting shared by server and client components. */

const dateTimeFormat = new Intl.DateTimeFormat('en-SG', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Singapore',
});

/** Event date in the venue's time zone (Singapore), e.g. "29 Nov 2026, 8:00 pm". */
export function formatEventDate(date: Date): string {
  return dateTimeFormat.format(date);
}

/** Money is stored in integer minor units (cents): 18800 SGD → "$188.00" (en-SG). */
export function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-SG', { style: 'currency', currency }).format(cents / 100);
}

/** Remaining time as m:ss, never negative: 61_000 → "1:01". */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

/** Rough wait for someone at `position` in a queue: one batch is admitted every interval. */
export function estimateWaitMs(position: number, batchSize: number, intervalMs: number): number {
  if (position <= 0) return 0;
  return Math.ceil(position / batchSize) * intervalMs;
}

/** A queue wait in words: 0 → "any moment now", 45_000 → "less than a minute", 90_000 → "about 2 minutes". */
export function formatWait(ms: number): string {
  if (ms <= 0) return 'any moment now';
  if (ms < 60_000) return 'less than a minute';
  const minutes = Math.ceil(ms / 60_000);
  return `about ${minutes} minute${minutes === 1 ? '' : 's'}`;
}
