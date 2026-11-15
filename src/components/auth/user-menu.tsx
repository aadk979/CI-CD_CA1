import Link from 'next/link';
import { logoutAction } from '@/app/actions/auth';
import { getCurrentUser } from '@/server/session';

const linkClass =
  'text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100';

/** Reads the session cookie, so it must render inside <Suspense> (see site header). */
export async function UserMenu() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <nav aria-label="Account" className="flex items-center gap-4">
        <Link href="/login" className={linkClass}>
          Log in
        </Link>
        <Link
          href="/register"
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Sign up
        </Link>
      </nav>
    );
  }

  return (
    <nav aria-label="Account" className="flex items-center gap-4">
      <span className="text-sm text-zinc-600 dark:text-zinc-400" data-testid="signed-in-as">
        Signed in as{' '}
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{user.name}</span>
      </span>
      {/* A real form + Server Action: works without JS and is CSRF-protected by Next. */}
      <form action={logoutAction}>
        <button type="submit" className={linkClass}>
          Log out
        </button>
      </form>
    </nav>
  );
}
