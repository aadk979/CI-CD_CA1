import { describe, expect, it } from 'vitest';
import { MAX_SEATS_PER_ORDER } from '@/lib/config';
import { isValidId, parseHoldInput } from '@/lib/holds';

const seats = (n: number) => Array.from({ length: n }, (_, i) => `seat${i}`);

describe('isValidId', () => {
  it.each(['cmh1abc2d0000xyz', 'a', 'A1'.repeat(32), 'seed-venue_arena'])('accepts %s', (id) => {
    expect(isValidId(id)).toBe(true);
  });

  it.each([
    ['empty string', ''],
    ['too long (65 chars)', 'a'.repeat(65)],
    ['SQL-ish', "1' OR '1'='1"],
    ['path traversal', '../etc'],
    ['number', 42],
    ['null', null],
  ])('rejects %s', (_case, id) => {
    expect(isValidId(id)).toBe(false);
  });
});

describe('parseHoldInput (equivalence partitioning + boundary values)', () => {
  it('accepts a valid request and de-duplicates seats', () => {
    expect(parseHoldInput('event1', ['s1', 's2', 's1'])).toEqual({
      eventId: 'event1',
      seatIds: ['s1', 's2'],
    });
  });

  it.each([
    [1, true],
    [MAX_SEATS_PER_ORDER, true],
    [0, false],
    [MAX_SEATS_PER_ORDER + 1, false],
  ])('%i seats → valid: %s', (count, valid) => {
    expect(parseHoldInput('event1', seats(count)) !== null).toBe(valid);
  });

  it.each([
    ['missing event id', null, ['s1']],
    ['malformed event id', 'bad id!', ['s1']],
    ['a File instead of a seat id', 'event1', [new Blob(['x'])]],
    ['malformed seat id', 'event1', ['s1', '<script>']],
  ])('rejects %s', (_case, eventId, seatIds) => {
    expect(parseHoldInput(eventId, seatIds)).toBeNull();
  });
});
