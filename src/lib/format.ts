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
