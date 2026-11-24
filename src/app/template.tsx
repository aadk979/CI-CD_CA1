import type { ReactNode } from 'react';

/**
 * Re-mounts on every navigation, so each route fades in (a CSS animation: it needs no JS,
 * ends with no transform left behind, and is switched off under prefers-reduced-motion).
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="page-enter flex flex-1 flex-col">{children}</div>;
}
