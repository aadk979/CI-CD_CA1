import Link from 'next/link';
import { logoutAction } from '@/app/actions/auth';
import { button } from '@/components/ui/styles';
import { isOrganiser } from '@/lib/account';
import { getCurrentUser } from '@/server/session';

const linkClass =
  'flex h-9 items-center rounded-btn px-3 text-sm font-medium text-body transition hover:bg-surface-2 hover:text-ink md:h-8';

/** Reads the session cookie, so it must render inside <Suspense> (see site header). */
export async function UserMenu() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <nav aria-label="Account" className="flex flex-col gap-2 md:flex-row md:items-center">
        <Link href="/login" className={linkClass}>
          Log in
        </Link>
        <Link href="/register" className={`${button.primary} h-9`}>
          Sign up
        </Link>
      </nav>
    );
  }

  return (
    <nav aria-label="Account" className="flex flex-col gap-2 md:flex-row md:items-center md:gap-1">
      <span
        className="text-muted flex items-center gap-2 px-3 text-sm md:mr-2 md:px-0"
        data-testid="signed-in-as"
      >
        <span
          className="bg-violet-soft text-on-light flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
          aria-hidden
        >
          {user.name.trim().charAt(0).toUpperCase() || '?'}
        </span>
        <span>
          <span className="sr-only md:not-sr-only lg:sr-only xl:not-sr-only">Signed in as </span>
          <span className="text-ink font-medium">{user.name}</span>
        </span>
      </span>
      {isOrganiser(user) && (
        <Link href="/organiser" className={linkClass}>
          Organiser
        </Link>
      )}
      <Link href="/tickets" className={linkClass}>
        My tickets
      </Link>
      {/* A real form + Server Action: works without JS and is CSRF-protected by Next. */}
      <form action={logoutAction}>
        <button type="submit" className={`${linkClass} w-full`}>
          Log out
        </button>
      </form>
    </nav>
  );
}
