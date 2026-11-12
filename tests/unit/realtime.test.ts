import { describe, expect, it } from 'vitest';
import { eventRoom, isValidEventId } from '@/lib/realtime';

describe('eventRoom', () => {
  it('namespaces the room by event id', () => {
    expect(eventRoom('abc')).toBe('event:abc');
  });
});

describe('isValidEventId', () => {
  it.each([
    ['cuid-like id', 'clx1abc2def3', true],
    ['slug with hyphens', 'neon-skyline-tour', true],
    ['single char (lower boundary)', 'a', true],
    ['64 chars (upper boundary)', 'a'.repeat(64), true],
    ['65 chars (over boundary)', 'a'.repeat(65), false],
    ['empty string', '', false],
    ['room injection attempt', 'event:other', false],
    ['spaces', 'a b', false],
    ['non-string', 42, false],
    ['undefined', undefined, false],
  ])('%s → %s', (_label, value, expected) => {
    expect(isValidEventId(value)).toBe(expected);
  });
});
