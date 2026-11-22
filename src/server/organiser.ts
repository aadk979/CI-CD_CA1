import 'server-only';
import { forbidden, redirect } from 'next/navigation';
import { isOrganiser, type SessionUser } from '@/lib/account';
import { getCurrentUser } from './session';

/**
 * The real authorisation check for organiser pages and Server Actions (SCRUM-24).
 * The proxy turns fans away early with a proper 403, but a Server Action can be called
 * by anyone who knows its id, so every action and page calls this itself as well.
 */
export async function requireOrganiser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isOrganiser(user)) forbidden();
  return user;
}
