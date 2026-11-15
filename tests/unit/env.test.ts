import { describe, expect, it } from 'vitest';
import { parseAuthEnv, parseEnv } from '@/lib/env';

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

describe('parseAuthEnv', () => {
  const secret = 's'.repeat(32);

  it('accepts a 32+ character secret and an http(s) URL', () => {
    expect(
      parseAuthEnv({ BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: 'https://a.example' }),
    ).toEqual({ BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: 'https://a.example' });
  });

  it.each([
    [
      { BETTER_AUTH_SECRET: 's'.repeat(31), BETTER_AUTH_URL: 'http://localhost:3000' },
      'BETTER_AUTH_SECRET',
    ],
    [{ BETTER_AUTH_URL: 'http://localhost:3000' }, 'BETTER_AUTH_SECRET'],
    [{ BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: 'not a url' }, 'BETTER_AUTH_URL'],
    [{ BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: 'ftp://files.example' }, 'BETTER_AUTH_URL'],
    [{ BETTER_AUTH_SECRET: secret }, 'BETTER_AUTH_URL'],
  ])('rejects %o naming %s', (source, name) => {
    expect(() => parseAuthEnv(source)).toThrow(name);
  });

  it('is independent of the core env (the worker needs no auth secret)', () => {
    expect(() => parseEnv(valid)).not.toThrow();
  });
});
