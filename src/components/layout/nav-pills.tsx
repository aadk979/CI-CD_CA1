'use client';

import { motion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DURATION, EASE_OUT_EXPO } from '@/components/motion/tokens';

export const NAV_ITEMS = [
  { href: '/', label: 'Home' },
  { href: '/events', label: 'Events' },
  { href: '/how-it-works', label: 'How it works' },
] as const;

const isActive = (pathname: string, href: string) =>
  href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

const group =
  'flex flex-col gap-1 rounded-card border border-hairline bg-surface/70 p-1 md:flex-row md:rounded-full';
const item =
  'relative flex h-9 items-center whitespace-nowrap rounded-btn px-4 text-sm font-medium transition-colors md:h-8 md:rounded-full';

/** The centred "nav-pill-group": the active segment is a raised pill that slides between items. */
export function NavPills() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main">
      <ul className={group}>
        {NAV_ITEMS.map(({ href, label }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`${item} ${active ? 'text-ink' : 'text-muted hover:text-ink'}`}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="rounded-btn border-hairline-strong bg-surface-3 shadow-card absolute inset-0 border md:rounded-full"
                    transition={{ duration: DURATION.base, ease: EASE_OUT_EXPO }}
                    aria-hidden
                  />
                )}
                <span className="relative">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Same pills without the active state: the prerendered fallback while the path resolves. */
export function NavPillsFallback() {
  return (
    <nav aria-label="Main">
      <ul className={group}>
        {NAV_ITEMS.map(({ href, label }) => (
          <li key={href}>
            <Link href={href} className={`${item} text-muted hover:text-ink`}>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
