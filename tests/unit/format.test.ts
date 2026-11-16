import { describe, expect, it } from 'vitest';
import {
  estimateWaitMs,
  formatCountdown,
  formatEventDate,
  formatPrice,
  formatWait,
} from '@/lib/format';

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

describe('estimateWaitMs (boundary values)', () => {
  // 50 fans admitted every 10 seconds.
  it.each([
    [0, 0], // already admitted
    [-3, 0],
    [1, 10_000], // first in line: the next batch
    [50, 10_000], // last fan of the first batch
    [51, 20_000], // first fan of the second batch
    [500, 100_000],
  ])('position %i → %i ms', (position, expected) => {
    expect(estimateWaitMs(position, 50, 10_000)).toBe(expected);
  });
});

describe('formatWait (boundary values)', () => {
  it.each([
    [0, 'any moment now'],
    [1, 'less than a minute'],
    [59_999, 'less than a minute'],
    [60_000, 'about 1 minute'],
    [60_001, 'about 2 minutes'],
    [600_000, 'about 10 minutes'],
  ])('%i ms → %s', (ms, expected) => {
    expect(formatWait(ms)).toBe(expected);
  });
});
