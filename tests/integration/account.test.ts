import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  getSessionUser,
  logIn,
  logOut,
  registerAccount,
  EMAIL_TAKEN,
  INVALID_CREDENTIALS,
} from '@/lib/account';
import { createAuth } from '@/lib/auth';
import { disconnectPrisma, getPrisma } from '@/lib/db';
import { resetDatabase } from './helpers';

const prisma = getPrisma();
afterAll(disconnectPrisma);

const SECRET = 'integration-test-secret-integration-test-secret';
const auth = createAuth(prisma, {
  BETTER_AUTH_SECRET: SECRET,
  BETTER_AUTH_URL: 'http://localhost:3100',
});
const httpsAuth = createAuth(prisma, {
  BETTER_AUTH_SECRET: SECRET,
  BETTER_AUTH_URL: 'https://tickets.example.com',
});

const FAN = { name: 'Ada Fan', email: 'ada@example.com', password: 'correct-horse-battery' };

/** Turn Set-Cookie response headers into a Cookie request header. */
function cookieHeaderFrom(response: Headers): Headers {
  const pairs = response.getSetCookie().map((c) => c.split(';')[0]);
  return new Headers({ cookie: pairs.join('; ') });
}

async function signInAndGetCookies(a = auth) {
  const { headers } = await a.api.signInEmail({
    body: { email: FAN.email, password: FAN.password },
    headers: new Headers(),
    returnHeaders: true,
  });
  return headers;
}

beforeEach(resetDatabase);

describe('registerAccount', () => {
  it('creates the user with a lower-cased email and a hashed password', async () => {
    const result = await registerAccount(
      auth,
      { ...FAN, email: '  Ada@Example.COM ' },
      new Headers(),
    );

    expect(result).toEqual({ ok: true });
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'ada@example.com' },
      include: { accounts: true },
    });
    expect(user.name).toBe('Ada Fan');
    const stored = user.accounts[0].password!;
    expect(user.accounts[0].providerId).toBe('credential');
    expect(stored).not.toContain(FAN.password);
    expect(stored).toMatch(/^[0-9a-f]+:[0-9a-f]+$/); // scrypt "salt:hash"
  });

  it('rejects a duplicate email regardless of case, against the email field', async () => {
    await registerAccount(auth, FAN, new Headers());

    const result = await registerAccount(auth, { ...FAN, email: 'ADA@example.com' }, new Headers());

    expect(result).toMatchObject({ ok: false, fieldErrors: { email: EMAIL_TAKEN } });
    expect(await prisma.user.count()).toBe(1);
  });

  it('returns per-field errors, echoes safe values and writes nothing', async () => {
    const result = await registerAccount(
      auth,
      { name: '', email: 'nope', password: 'short' },
      new Headers(),
    );

    expect(result.ok).toBe(false);
    expect(Object.keys(result.fieldErrors!).sort()).toEqual(['email', 'name', 'password']);
    expect(result.values).toEqual({ name: '', email: 'nope' });
    expect(result.values).not.toHaveProperty('password');
    expect(await prisma.user.count()).toBe(0);
  });
});

describe('logIn', () => {
  beforeEach(async () => {
    await registerAccount(auth, FAN, new Headers());
  });

  it('accepts the right credentials (email case-insensitive)', async () => {
    expect(
      await logIn(auth, { email: 'ADA@example.com', password: FAN.password }, new Headers()),
    ).toEqual({ ok: true });
  });

  it.each([
    ['a wrong password', { email: FAN.email, password: 'wrong-password' }],
    ['an unknown email', { email: 'nobody@example.com', password: FAN.password }],
  ])('gives the same generic error for %s', async (_case, creds) => {
    expect(await logIn(auth, creds, new Headers())).toEqual({
      ok: false,
      formError: INVALID_CREDENTIALS,
      values: { email: creds.email },
    });
  });

  it('validates presence before calling the auth service', async () => {
    expect(await logIn(auth, { email: '', password: '' }, new Headers())).toMatchObject({
      ok: false,
      fieldErrors: { email: expect.any(String), password: 'Enter your password' },
    });
  });
});

describe('session cookie', () => {
  beforeEach(async () => {
    await registerAccount(auth, FAN, new Headers());
  });

  it('is httpOnly, SameSite=Lax and Secure when the app is served over https', async () => {
    const cookies = (await signInAndGetCookies(httpsAuth)).getSetCookie();
    const session = cookies.find((c) => c.includes('session_token='))!;

    expect(session).toMatch(/^__Secure-tixqueue\.session_token=/);
    expect(session).toMatch(/;\s*HttpOnly/i);
    expect(session).toMatch(/;\s*Secure/i);
    expect(session).toMatch(/;\s*SameSite=Lax/i);
    expect(session).toMatch(/;\s*Path=\//i);
  });

  it('is not marked Secure on plain-http local development', async () => {
    const session = (await signInAndGetCookies())
      .getSetCookie()
      .find((c) => c.includes('session_token='))!;

    expect(session).toMatch(/^tixqueue\.session_token=/);
    expect(session).not.toMatch(/;\s*Secure/i);
    expect(session).toMatch(/;\s*HttpOnly/i);
  });
});

describe('getSessionUser and logOut', () => {
  beforeEach(async () => {
    await registerAccount(auth, FAN, new Headers());
  });

  it('returns null without a session cookie', async () => {
    expect(await getSessionUser(auth, new Headers())).toBeNull();
  });

  it('rejects a forged session cookie', async () => {
    const forged = new Headers({ cookie: 'tixqueue.session_token=forged.value' });
    expect(await getSessionUser(auth, forged)).toBeNull();
  });

  it('logging out deletes the session so the old cookie no longer works', async () => {
    const cookie = cookieHeaderFrom(await signInAndGetCookies());
    const sessionsBefore = await prisma.session.count(); // registration also signed in
    expect(await getSessionUser(auth, cookie)).toEqual({
      id: expect.any(String),
      name: FAN.name,
      email: FAN.email,
    });

    await logOut(auth, cookie);

    expect(await getSessionUser(auth, cookie)).toBeNull();
    // Exactly this session was deleted server-side; the registration session is untouched.
    expect(await prisma.session.count()).toBe(sessionsBefore - 1);
  });

  it('logging out without a session is a no-op', async () => {
    await expect(logOut(auth, new Headers())).resolves.toBeUndefined();
  });
});

describe('getAuth', () => {
  it('builds one shared instance from the validated environment', async () => {
    const { getAuth } = await import('@/lib/auth');
    expect(getAuth()).toBe(getAuth());
    expect(getAuth().options.baseURL).toBe(process.env.BETTER_AUTH_URL);
  });
});
