import { describe, expect, it } from 'vitest';
import { formatCountdown, formatEventDate, formatPrice } from '@/lib/format';

// en-SG shows the local currency as "$" and qualifies foreign dollars ("US$").
describe('formatPrice', () => {
  it.each([
    [18800, 'SGD', '$188.00'],
    [0, 'SGD', '$0.00'],
    [1, 'SGD', '$0.01'],
    [6850, 'USD', 'US$68.50'],
  ])('%i %s → %s', (cents, currency, expected) => {
    expect(formatPrice(cents, currency)).toBe(expected);
  });
});

describe('formatCountdown (boundary values)', () => {
  it.each([
    [600_000, '10:00'],
    [61_000, '1:01'],
    [59_001, '1:00'], // partial seconds round up, so it never shows 0:00 too early
    [1, '0:01'],
    [0, '0:00'],
    [-5_000, '0:00'],
  ])('%i ms → %s', (ms, expected) => {
    expect(formatCountdown(ms)).toBe(expected);
  });
});

describe('formatEventDate', () => {
  it('shows the time in Singapore regardless of the server time zone', () => {
    expect(formatEventDate(new Date('2026-12-24T12:00:00Z'))).toMatch(/24 Dec 2026.*8:00\s?pm/i);
  });
});
