import type { Metadata } from 'next';
import Link from 'next/link';
import { Backdrop } from '@/components/ui/page';
import { button } from '@/components/ui/styles';

export const metadata: Metadata = { title: 'Page not found' };

/** App-wide 404 for unknown URLs. Event pages have their own "Event not found". */
export default function NotFound() {
  return (
    <main className="relative isolate flex flex-1 items-center justify-center px-4 py-24 text-center">
      <Backdrop />
      <div className="animate-fade-up">
        <p
          className="font-display text-gradient animate-gradient-pan text-[7rem] leading-none font-semibold tracking-[-4px] md:text-[10rem]"
          aria-hidden
        >
          404
        </p>
        <h1 className="font-display text-display-sm text-ink mt-4 font-semibold">
          This seat doesn&apos;t exist
        </h1>
        <p className="text-body mx-auto mt-3 max-w-md">
          The page you were looking for has moved or never existed. The events are still where you
          left them.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/events" className={button.primary}>
            Browse events
          </Link>
          <Link href="/" className={button.secondary}>
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
