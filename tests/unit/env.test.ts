import { describe, expect, it } from 'vitest';
import { parseEnv } from '@/lib/env';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
};

describe('parseEnv', () => {
  it('accepts a valid environment and applies defaults', () => {
    const env = parseEnv(valid);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
  });

  it('coerces PORT from a string', () => {
    expect(parseEnv({ ...valid, PORT: '8080' }).PORT).toBe(8080);
  });

  it.each([
    ['DATABASE_URL', { REDIS_URL: valid.REDIS_URL }],
    ['REDIS_URL', { DATABASE_URL: valid.DATABASE_URL }],
  ])('rejects a missing %s with a readable message', (name, source) => {
    expect(() => parseEnv(source)).toThrow(name);
  });

  // Boundary values for PORT: 0 is invalid, 1 is the smallest valid port.
  it.each([
    ['0', false],
    ['1', true],
    ['-1', false],
    ['abc', false],
  ])('PORT=%s valid=%s', (port, ok) => {
    const run = () => parseEnv({ ...valid, PORT: port });
    if (ok) expect(run).not.toThrow();
    else expect(run).toThrow('PORT');
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => parseEnv({ ...valid, NODE_ENV: 'staging' })).toThrow('NODE_ENV');
  });
});
