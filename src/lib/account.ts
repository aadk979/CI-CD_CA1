import { isAPIError } from 'better-auth/api';
import type { Auth } from './auth';
import {
  loginSchema,
  registerSchema,
  toFieldErrors,
  type FormState,
  type LoginInput,
  type RegisterInput,
} from './auth-validation';

/**
 * Framework-free account logic. Server Actions wrap these with `headers()` and
 * `redirect()`; tests call them directly against the test database.
 */

/** Deliberately vague: never reveal whether the email or the password was wrong. */
export const INVALID_CREDENTIALS = 'Incorrect email or password.';
export const EMAIL_TAKEN = 'An account with this email already exists.';
export const TRY_AGAIN = 'Something went wrong. Please try again.';
export const TOO_MANY_ATTEMPTS = 'Too many attempts. Please wait a moment and try again.';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

function errorCode(err: unknown): string | undefined {
  if (!isAPIError(err)) return undefined;
  const body = err.body as { code?: string } | undefined;
  return body?.code;
}

export async function registerAccount(
  auth: Auth,
  raw: Record<string, string>,
  headers: Headers,
): Promise<FormState<RegisterInput>> {
  const values = { name: raw.name ?? '', email: raw.email ?? '' };
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error), values };
  }

  try {
    await auth.api.signUpEmail({ body: parsed.data, headers });
    return { ok: true };
  } catch (err) {
    if (!isAPIError(err)) throw err;
    switch (errorCode(err)) {
      case 'USER_ALREADY_EXISTS':
      case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
        return { ok: false, fieldErrors: { email: EMAIL_TAKEN }, values };
      case 'TOO_MANY_REQUESTS':
        return { ok: false, formError: TOO_MANY_ATTEMPTS, values };
      default:
        return { ok: false, formError: TRY_AGAIN, values };
    }
  }
}

export async function logIn(
  auth: Auth,
  raw: Record<string, string>,
  headers: Headers,
): Promise<FormState<LoginInput>> {
  const values = { email: raw.email ?? '' };
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error), values };
  }

  try {
    await auth.api.signInEmail({ body: parsed.data, headers });
    return { ok: true };
  } catch (err) {
    if (!isAPIError(err)) throw err;
    if (errorCode(err) === 'TOO_MANY_REQUESTS') {
      return { ok: false, formError: TOO_MANY_ATTEMPTS, values };
    }
    // Unknown email, wrong password, unusable account: all look identical.
    return { ok: false, formError: INVALID_CREDENTIALS, values };
  }
}

/** Deletes the session server-side, so the old cookie stops working immediately. */
export async function logOut(auth: Auth, headers: Headers): Promise<void> {
  try {
    await auth.api.signOut({ headers });
  } catch (err) {
    // No (or an already-expired) session: logging out is already done.
    if (!isAPIError(err)) throw err;
  }
}

/** The signed-in user, or null. Exposes only what the UI needs. */
export async function getSessionUser(auth: Auth, headers: Headers): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const { id, name, email } = session.user;
  return { id, name, email };
}
