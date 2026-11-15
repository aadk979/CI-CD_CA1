import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import type { PrismaClient } from '@/generated/prisma/client';
import { PASSWORD_MAX, PASSWORD_MIN } from './auth-validation';
import { getPrisma } from './db';
import { getAuthEnv, type AuthEnv } from './env';

/** Sessions last a week and are extended (at most daily) while the user stays active. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export function createAuth(prisma: PrismaClient, { BETTER_AUTH_SECRET, BETTER_AUTH_URL }: AuthEnv) {
  return betterAuth({
    appName: 'TixQueue',
    secret: BETTER_AUTH_SECRET,
    // Cookie `Secure` flag follows this URL's scheme: https → Secure.
    baseURL: BETTER_AUTH_URL,
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN,
      maxPasswordLength: PASSWORD_MAX,
      autoSignIn: true, // registering logs you straight in
    },
    session: {
      expiresIn: SESSION_MAX_AGE_SECONDS,
      updateAge: 60 * 60 * 24,
    },
    advanced: {
      cookiePrefix: 'tixqueue',
      // Explicit, rather than relying on library defaults.
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
    },
    // Must stay last: copies Set-Cookie headers onto the Server Action response.
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { auth?: Auth };

/** Lazy singleton: `next build` imports this module without auth env configured. */
export function getAuth(): Auth {
  globalForAuth.auth ??= createAuth(getPrisma(), getAuthEnv());
  return globalForAuth.auth;
}
