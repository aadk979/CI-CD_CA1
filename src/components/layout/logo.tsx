import Link from 'next/link';
import { APP_NAME } from '@/lib/config';

/** Brand mark: a ticket stub with a queue of dots, filled with the brand gradient. */
export function LogoMark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id="tq-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-violet-soft)" />
          <stop offset="0.55" stopColor="var(--color-pink-soft)" />
          <stop offset="1" stopColor="var(--color-amber-soft)" />
        </linearGradient>
      </defs>
      <path
        d="M6 4h20a2 2 0 0 1 2 2v6a4 4 0 0 0 0 8v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6a4 4 0 0 0 0-8V6a2 2 0 0 1 2-2Z"
        fill="url(#tq-mark)"
      />
      <circle cx="11" cy="16" r="2" fill="var(--color-canvas)" />
      <circle cx="17" cy="16" r="2" fill="var(--color-canvas)" opacity="0.7" />
      <circle cx="23" cy="16" r="2" fill="var(--color-canvas)" opacity="0.4" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link
      href="/"
      className="rounded-btn font-display text-ink flex shrink-0 items-center gap-2 text-lg font-semibold tracking-[-0.5px]"
    >
      <LogoMark />
      {APP_NAME}
    </Link>
  );
}
