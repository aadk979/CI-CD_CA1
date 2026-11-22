import Link from 'next/link';

/** Shown to signed-in users who lack the role for a page (HTTP 403). */
export function ForbiddenNotice() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10" data-testid="forbidden">
      <h1 className="text-2xl font-semibold tracking-tight">You don&apos;t have access</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        This area is for event organisers. If you think you should have access, ask an administrator
        to grant your account the organiser role.
      </p>
      <Link href="/" className="mt-4 inline-block font-medium underline">
        Back to upcoming events
      </Link>
    </main>
  );
}
