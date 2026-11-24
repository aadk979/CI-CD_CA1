import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogoMark } from '@/components/layout/logo';
import { Backdrop } from '@/components/ui/page';
import { card } from '@/components/ui/styles';

/** Shared frame for the login and register pages: a centred card over the brand glow. */
export function AuthCard({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer: { text: string; linkText: string; href: '/login' | '/register' };
}) {
  return (
    <main className="relative isolate flex flex-1 items-start justify-center px-4 py-16 md:py-24">
      <Backdrop />
      <div className="animate-fade-up w-full max-w-md">
        <div className={`${card} bg-surface/90 p-8 backdrop-blur`}>
          <LogoMark className="mb-6 h-9 w-9" />
          <h1 className="font-display text-display-sm text-ink mb-8 font-semibold">{title}</h1>
          {children}
        </div>
        <p className="text-muted mt-6 text-center text-sm">
          {footer.text}{' '}
          <Link
            href={footer.href}
            className="text-ink decoration-violet-soft font-semibold underline underline-offset-4"
          >
            {footer.linkText}
          </Link>
        </p>
      </div>
    </main>
  );
}
