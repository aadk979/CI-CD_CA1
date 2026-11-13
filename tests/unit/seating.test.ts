import { describe, expect, it } from 'vitest';
import { buildSeats, compareRowLabels, countSeats, rowLabel } from '@/lib/seating';

describe('rowLabel', () => {
  it.each([
    [0, 'A'],
    [25, 'Z'],
    [26, 'AA'],
    [27, 'AB'],
    [51, 'AZ'],
    [52, 'BA'],
    [701, 'ZZ'],
    [702, 'AAA'],
    [18_277, 'ZZZ'],
  ])('index %i → %s', (index, label) => {
    expect(rowLabel(index)).toBe(label);
  });

  it.each([-1, 1.5, Number.NaN, 18_278])('rejects out-of-range index %s', (index) => {
    expect(() => rowLabel(index)).toThrow(RangeError);
  });
});

describe('compareRowLabels', () => {
  it('sorts single letters before double letters (venue order, not alphabetical)', () => {
    expect(['AA', 'B', 'A', 'Z', 'AB'].sort(compareRowLabels)).toEqual(['A', 'B', 'Z', 'AA', 'AB']);
  });

  it('treats equal labels as equal', () => {
    expect(compareRowLabels('C', 'C')).toBe(0);
  });
});

describe('buildSeats', () => {
  it('generates every seat row by row, numbered from 1', () => {
    expect(buildSeats({ code: 'FLR', name: 'Floor', rows: 2, seatsPerRow: 3 })).toEqual([
      { row: 'A', number: 1 },
      { row: 'A', number: 2 },
      { row: 'A', number: 3 },
      { row: 'B', number: 1 },
      { row: 'B', number: 2 },
      { row: 'B', number: 3 },
    ]);
  });

  it('produces unique positions', () => {
    const seats = buildSeats({ code: 'UB', name: 'Upper', rows: 30, seatsPerRow: 10 });
    expect(new Set(seats.map((s) => `${s.row}-${s.number}`)).size).toBe(300);
    expect(seats.at(-1)).toEqual({ row: 'AD', number: 10 });
  });

  it.each([
    [{ rows: 0 }, /rows must be a positive integer/],
    [{ rows: 2.5 }, /rows must be a positive integer/],
    [{ seatsPerRow: -1 }, /seatsPerRow must be a positive integer/],
    [{ code: 'flr' }, /Section code/],
    [{ code: '' }, /Section code/],
    [{ name: '  ' }, /needs a name/],
    [{ rows: 18_279 }, /at most/],
  ])('rejects invalid layout %o', (override, message) => {
    const layout = { code: 'FLR', name: 'Floor', rows: 1, seatsPerRow: 1, ...override };
    expect(() => buildSeats(layout)).toThrow(message);
  });
});

describe('countSeats', () => {
  it('sums rows × seats across sections', () => {
    expect(
      countSeats([
        { code: 'A', name: 'A', rows: 10, seatsPerRow: 20 },
        { code: 'B', name: 'B', rows: 3, seatsPerRow: 7 },
      ]),
    ).toBe(221);
  });

  it('is zero for no sections', () => {
    expect(countSeats([])).toBe(0);
  });
});
