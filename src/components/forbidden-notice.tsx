import Link from 'next/link';
import { button } from '@/components/ui/styles';

/** Shown to signed-in users who lack the role for a page (HTTP 403). */
export function ForbiddenNotice() {
  return (
    <main
      className="relative isolate mx-auto w-full max-w-3xl flex-1 px-4 py-16"
      data-testid="forbidden"
    >
      <p className="text-danger mb-3 text-xs font-semibold tracking-[0.14em] uppercase">403</p>
      <h1 className="font-display text-display-sm text-ink font-semibold">
        You don&apos;t have access
      </h1>
      <p className="text-body mt-2">
        This area is for event organisers. If you think you should have access, ask an administrator
        to grant your account the organiser role.
      </p>
      <Link href="/events" className={`${button.primary} mt-6`}>
        Back to upcoming events
      </Link>
    </main>
  );
}
