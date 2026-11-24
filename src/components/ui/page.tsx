import Link from 'next/link';
import type { ReactNode } from 'react';
import { container } from './styles';

/** Background light for inner pages: a soft violet/pink glow over a faint grid. */
export function Backdrop({ tone = 'brand' }: { tone?: 'brand' | 'live' }) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] overflow-hidden"
      aria-hidden
    >
      <div className="bg-grid absolute inset-0 opacity-60" />
      <div
        className={`absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 ${tone === 'live' ? 'glow-live' : 'glow-violet'}`}
      />
      <div className="glow-pink absolute -top-20 right-[-10%] h-[360px] w-[520px]" />
    </div>
  );
}

/** Standard inner-page frame: `<main>` with the content width, backdrop and vertical rhythm. */
export function PageShell({
  children,
  width = 'content',
  tone,
  testId,
}: {
  children: ReactNode;
  width?: 'content' | 'narrow' | 'form';
  tone?: 'brand' | 'live';
  testId?: string;
}) {
  const max = width === 'narrow' ? 'max-w-3xl' : width === 'form' ? 'max-w-md' : '';
  return (
    <main className="relative isolate flex-1" data-testid={testId}>
      <Backdrop tone={tone} />
      <div className={`${container} ${max} py-12 md:py-16`}>{children}</div>
    </main>
  );
}

/** Eyebrow + display heading + lead paragraph. */
export function PageHeading({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-10">
      {eyebrow && (
        <p className="text-violet-soft mb-3 text-xs font-semibold tracking-[0.14em] uppercase">
          {eyebrow}
        </p>
      )}
      <h1 className="font-display text-display-sm text-ink md:text-display-md font-semibold">
        {title}
      </h1>
      {lead && <div className="text-body mt-3 max-w-2xl">{lead}</div>}
      {children}
    </header>
  );
}

/** Small "back" link with an arrow. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-btn text-muted hover:text-ink inline-flex items-center gap-1.5 text-sm transition"
    >
      <span aria-hidden>←</span>
      {children}
    </Link>
  );
}
