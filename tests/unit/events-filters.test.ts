import { describe, expect, it } from 'vitest';
import { normaliseFilters } from '@/lib/events';

describe('normaliseFilters', () => {
  it('trims values and drops empty ones', () => {
    expect(normaliseFilters({ query: '  neon ', city: '   ' })).toEqual({
      query: 'neon',
      city: undefined,
    });
  });

  it('ignores non-string values such as repeated params', () => {
    expect(normaliseFilters({ query: ['a', 'b'], city: undefined })).toEqual({
      query: undefined,
      city: undefined,
    });
  });

  it('drops over-long input', () => {
    expect(normaliseFilters({ query: 'x'.repeat(101) }).query).toBeUndefined();
  });
});
