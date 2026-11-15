import 'server-only';
import { headers } from 'next/headers';
import { getSessionUser, type SessionUser } from '@/lib/account';
import { getAuth } from '@/lib/auth';

/**
 * Data Access Layer entry point for "who is signed in?". Reads the request's
 * cookies, so callers must render inside a <Suspense> boundary (Cache Components).
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  // Await the request first: during prerendering this is where rendering stops,
  // so nothing below (env, database) is touched at build time.
  const requestHeaders = await headers();
  return getSessionUser(getAuth(), requestHeaders);
}
