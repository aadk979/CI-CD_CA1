import { describe, expect, it } from 'vitest';
import { loadEnv } from '@/lib/load-env';

describe('loadEnv', () => {
  it('resolves @next/env and keeps test-mode values (.env.test)', () => {
    expect(() => loadEnv()).not.toThrow();
    expect(process.env.DATABASE_URL).toContain('ticketing_test');
  });
});
