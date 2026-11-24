'use client'; // Error boundaries must be Client Components

import Link from 'next/link';
import { useEffect } from 'react';
import { Backdrop } from '@/components/ui/page';
import { button } from '@/components/ui/styles';

/** Fallback for unexpected errors below the root layout; the header and footer stay usable. */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest =
    error instanceof Error && 'digest' in error
      ? String((error as { digest?: string }).digest)
      : null;

  return (
    <main className="relative isolate flex flex-1 items-center justify-center px-4 py-24 text-center">
      <Backdrop />
      <div className="animate-fade-up max-w-md">
        <p className="text-danger mb-3 text-xs font-semibold tracking-[0.14em] uppercase">
          Something went wrong
        </p>
        <h1 className="font-display text-display-sm text-ink font-semibold">We dropped that one</h1>
        <p className="text-body mt-3">
          An unexpected error stopped this page from loading. Any seats you were holding are still
          held until their timer runs out.
        </p>
        {digest && <p className="text-muted mt-3 font-mono text-xs">Reference: {digest}</p>}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => retry()} className={button.primary}>
            Try again
          </button>
          <Link href="/events" className={button.secondary}>
            Browse events
          </Link>
        </div>
      </div>
    </main>
  );
}
