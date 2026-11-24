import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { TicketReveal } from '@/components/motion/ticket-reveal';
import { PageHeading, PageShell } from '@/components/ui/page';
import { badge, badgeTone, button, card, notice } from '@/components/ui/styles';
import { getPrisma } from '@/lib/db';
import { formatEventDate, formatPrice } from '@/lib/format';
import { listOrders } from '@/lib/orders';
import { ticketQrDataUri } from '@/lib/ticket-qr';
import { getCurrentUser } from '@/server/session';

export const metadata: Metadata = { title: 'My tickets' };

async function MyTickets({ searchParams }: Pick<PageProps<'/tickets'>, 'searchParams'>) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // Only ever this fan's orders: the query is scoped by the session's user id.
  const [orders, { order: justPaid }] = await Promise.all([
    listOrders(getPrisma(), user.id),
    searchParams,
  ]);
  const confirmed = orders.find((o) => o.id === justPaid);
  const qrCodes = new Map(
    await Promise.all(
      orders
        .flatMap((o) => o.tickets)
        .map(async (t) => [t.id, await ticketQrDataUri(t.id)] as const),
    ),
  );

  return (
    <>
      {confirmed && (
        <p role="status" className={`${notice.success} animate-fade-up mb-8`}>
          Payment successful. Your {confirmed.tickets.length} ticket
          {confirmed.tickets.length === 1 ? '' : 's'} for {confirmed.event.title}{' '}
          {confirmed.tickets.length === 1 ? 'is' : 'are'} below.
        </p>
      )}

      {orders.length === 0 ? (
        <div
          data-testid="no-tickets"
          className="border-hairline-strong rounded-card border border-dashed px-6 py-16 text-center"
        >
          <p className="text-body mb-6">You haven&apos;t bought any tickets yet.</p>
          <Link href="/events" className={button.primary}>
            Browse upcoming events
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-8" data-testid="orders">
          {orders.map((order, orderIndex) => (
            <TicketReveal
              key={order.id}
              index={orderIndex}
              className={`${card} relative overflow-hidden`}
              testId="order"
            >
              <div className="bg-gradient-brand absolute inset-x-0 top-0 h-1" aria-hidden />
              <div className="flex flex-wrap items-start justify-between gap-3 p-6">
                <div>
                  <h2 className="font-display text-ink text-xl font-semibold tracking-[-0.5px]">
                    <Link href={`/events/${order.event.slug}`} className="hover:underline">
                      {order.event.title}
                    </Link>
                  </h2>
                  <p className="text-body mt-1 text-sm">
                    {formatEventDate(order.event.startsAt)} · {order.event.venue},{' '}
                    {order.event.city}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`${badge} ${badgeTone.success}`}>Paid</span>
                  <span className="font-display text-ink text-xl font-semibold tabular-nums">
                    {formatPrice(order.totalCents, order.currency)}
                  </span>
                </div>
              </div>

              <ul className="grid gap-4 px-6 pb-6 sm:grid-cols-2 lg:grid-cols-3" aria-label="Seats">
                {order.tickets.map((t) => (
                  <li
                    key={t.id}
                    className="border-hairline bg-surface-2 rounded-card relative flex items-center gap-4 border p-4"
                    data-testid="ticket"
                  >
                    {/* Ticket-stub notches. */}
                    <span
                      className="bg-surface absolute top-1/2 -left-2 h-4 w-4 -translate-y-1/2 rounded-full"
                      aria-hidden
                    />
                    <span
                      className="bg-surface absolute top-1/2 -right-2 h-4 w-4 -translate-y-1/2 rounded-full"
                      aria-hidden
                    />
                    {/* White tile so the code scans on the dark theme. */}
                    {/* eslint-disable-next-line @next/next/no-img-element -- inline SVG data URI */}
                    <img
                      src={qrCodes.get(t.id)}
                      alt={`QR code for ${t.section}, row ${t.row}, seat ${t.number}`}
                      width={96}
                      height={96}
                      className="rounded-btn shrink-0 bg-white p-1"
                    />
                    <span className="border-hairline-strong flex flex-col gap-1 border-l border-dashed pl-4 text-sm">
                      <span className="text-muted text-xs font-semibold tracking-[0.14em] uppercase">
                        Admit one
                      </span>
                      <span className="text-ink font-semibold">
                        {t.section} · Row {t.row} · Seat {t.number}
                      </span>
                      <span className="text-muted">{t.tierName}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="border-hairline text-muted border-t px-6 py-3 text-xs">
                Order {order.id} · bought {formatEventDate(order.createdAt)}
              </p>
            </TicketReveal>
          ))}
        </ul>
      )}
    </>
  );
}

export default function TicketsPage({ searchParams }: PageProps<'/tickets'>) {
  return (
    <PageShell>
      <PageHeading
        eyebrow="Wallet"
        title="My tickets"
        lead="Show the QR code at the gate. Each code is unique to one seat."
      />
      {/* The session and the orders are request data: stream them in. */}
      <Suspense
        fallback={
          <div className="flex flex-col gap-4" aria-busy>
            <p className="sr-only">Loading your tickets…</p>
            <div className="skeleton h-48 w-full" />
          </div>
        }
      >
        <MyTickets searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}
