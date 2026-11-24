'use client';

import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { button } from '@/components/ui/styles';

/**
 * Wraps the header's navigation. From `md` up it is an inline row; below that it collapses
 * behind a hamburger button and opens as a panel under the 64px bar. The children render
 * once, so links and test ids are never duplicated.
 */
export function SiteMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Following a link (or submitting log out) closes the panel.
  const closeOnNavigate = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('a, button[type="submit"]')) setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className={`${button.icon} ml-auto md:hidden`}
        aria-expanded={open}
        aria-controls="site-menu"
        aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden fill="none" stroke="currentColor">
          {open ? (
            <path strokeWidth="2" strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          ) : (
            <path strokeWidth="2" strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
          )}
        </svg>
      </button>
      {/* Clicks only bubble up here to close the panel; the links inside are the controls. */}
      <div
        id="site-menu"
        onClick={closeOnNavigate}
        className={`${open ? 'flex' : 'hidden'} top-nav border-hairline bg-canvas-raised shadow-mock absolute inset-x-0 flex-col gap-4 border-b p-4 md:static md:flex md:flex-1 md:flex-row md:items-center md:justify-between md:border-0 md:bg-transparent md:p-0 md:shadow-none`}
      >
        {children}
      </div>
    </>
  );
}
