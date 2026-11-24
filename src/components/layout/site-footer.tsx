import Link from 'next/link';
import { APP_NAME } from '@/lib/config';
import { container } from '@/components/ui/styles';
import { LogoMark } from './logo';

const COLUMNS = [
  {
    heading: 'Fans',
    links: [
      { href: '/events', label: 'All events' },
      { href: '/how-it-works', label: 'How the waiting room works' },
      { href: '/tickets', label: 'Your tickets' },
    ],
  },
  {
    heading: 'Organisers',
    links: [
      { href: '/register', label: 'Create an account' },
      { href: '/organiser', label: 'Event host dashboard' },
      { href: '/organiser/events/new', label: 'Publish an event' },
    ],
  },
  {
    heading: 'Platform',
    links: [
      { href: '/how-it-works#fair-queue', label: 'Fair queueing' },
      { href: '/api/health', label: 'Service health' },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-hairline bg-canvas-raised border-t">
      <div
        className={`${container} grid gap-10 py-16 sm:grid-cols-3 lg:grid-cols-[1.4fr_repeat(3,1fr)]`}
      >
        <div className="max-w-xs sm:col-span-3 lg:col-span-1">
          <p className="font-display text-ink flex items-center gap-2 text-lg font-semibold">
            <LogoMark className="h-6 w-6" />
            {APP_NAME}
          </p>
          <p className="text-muted mt-3 text-sm">
            Fair queueing, live seat maps and instant QR tickets for high-demand on-sales.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.heading} aria-label={`${col.heading} links`}>
            <h2 className="text-ink text-sm font-semibold">{col.heading}</h2>
            <ul className="mt-4 flex flex-col gap-3 text-sm">
              {col.links.map((l) => (
                <li key={l.href}>
                  {/* The health endpoint is JSON, not a page: a plain anchor, no prefetch. */}
                  {l.href.startsWith('/api') ? (
                    <a href={l.href} className="text-muted hover:text-ink transition">
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} className="text-muted hover:text-ink transition">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-hairline border-t">
        <p className={`${container} text-muted py-6 text-xs`}>
          {APP_NAME} is a coursework demo. Payments run in Stripe test mode: never enter a real
          card.
        </p>
      </div>
    </footer>
  );
}
