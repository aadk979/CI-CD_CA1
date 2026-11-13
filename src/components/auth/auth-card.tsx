import Link from 'next/link';
import type { ReactNode } from 'react';

/** Shared frame for the login and register pages. */
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
    <main className="mx-auto w-full max-w-sm flex-1 px-4 py-16">
      <h1 className="mb-8 text-2xl font-semibold tracking-tight">{title}</h1>
      {children}
      <p className="mt-6 text-sm text-zinc-500">
        {footer.text}{' '}
        <Link href={footer.href} className="font-medium text-zinc-900 underline dark:text-zinc-100">
          {footer.linkText}
        </Link>
      </p>
    </main>
  );
}
