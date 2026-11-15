import { APIError } from 'better-auth/api';
import { describe, expect, it, vi } from 'vitest';
import {
  logIn,
  logOut,
  registerAccount,
  INVALID_CREDENTIALS,
  TOO_MANY_ATTEMPTS,
  TRY_AGAIN,
} from '@/lib/account';
import type { Auth } from '@/lib/auth';

// Error paths that are hard to trigger against the real service (rate limits,
// outages) are covered with a stub; the happy paths run for real in
// tests/integration/account.test.ts.

const REGISTER = { name: 'Ada', email: 'ada@example.com', password: 'long-enough' };
const LOGIN = { email: 'ada@example.com', password: 'whatever' };

function authThatThrows(error: unknown): Auth {
  const fail = vi.fn().mockRejectedValue(error);
  return { api: { signUpEmail: fail, signInEmail: fail, signOut: fail } } as unknown as Auth;
}

const apiError = (code: string) =>
  new APIError('BAD_REQUEST', { code, message: `${code} from Better Auth` });

describe('registerAccount error mapping', () => {
  it('maps rate limiting to a friendly form error', async () => {
    expect(
      await registerAccount(authThatThrows(apiError('TOO_MANY_REQUESTS')), REGISTER, new Headers()),
    ).toMatchObject({ ok: false, formError: TOO_MANY_ATTEMPTS });
  });

  it('maps unexpected auth errors to a generic retry message', async () => {
    expect(
      await registerAccount(
        authThatThrows(apiError('FAILED_TO_CREATE_USER')),
        REGISTER,
        new Headers(),
      ),
    ).toMatchObject({ ok: false, formError: TRY_AGAIN, values: { email: REGISTER.email } });
  });

  it('rethrows non-auth failures (e.g. the database is down) for the error boundary', async () => {
    await expect(
      registerAccount(authThatThrows(new Error('connection refused')), REGISTER, new Headers()),
    ).rejects.toThrow('connection refused');
  });
});

describe('logIn error mapping', () => {
  it('maps rate limiting to a friendly form error', async () => {
    expect(
      await logIn(authThatThrows(apiError('TOO_MANY_REQUESTS')), LOGIN, new Headers()),
    ).toMatchObject({ formError: TOO_MANY_ATTEMPTS });
  });

  it('treats every other auth rejection as invalid credentials', async () => {
    expect(
      await logIn(authThatThrows(apiError('EMAIL_NOT_VERIFIED')), LOGIN, new Headers()),
    ).toMatchObject({ formError: INVALID_CREDENTIALS });
  });

  it('rethrows non-auth failures', async () => {
    await expect(logIn(authThatThrows(new Error('boom')), LOGIN, new Headers())).rejects.toThrow(
      'boom',
    );
  });
});

describe('logOut', () => {
  it('rethrows non-auth failures instead of pretending the user is logged out', async () => {
    await expect(logOut(authThatThrows(new Error('db down')), new Headers())).rejects.toThrow(
      'db down',
    );
  });
});
