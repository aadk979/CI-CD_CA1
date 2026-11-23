import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
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
        <p
          role="status"
          className="mb-6 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
        >
          Payment successful. Your {confirmed.tickets.length} ticket
          {confirmed.tickets.length === 1 ? '' : 's'} for {confirmed.event.title}{' '}
          {confirmed.tickets.length === 1 ? 'is' : 'are'} below.
        </p>
      )}

      {orders.length === 0 ? (
        <div data-testid="no-tickets">
          <p className="mb-4 text-zinc-600 dark:text-zinc-400">
            You haven&apos;t bought any tickets yet.
          </p>
          <Link href="/" className="font-medium underline">
            Browse upcoming events
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-6" data-testid="orders">
          {orders.map((order) => (
            <li
              key={order.id}
              className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800"
              data-testid="order"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-medium">
                  <Link href={`/events/${order.event.slug}`} className="hover:underline">
                    {order.event.title}
                  </Link>
                </h2>
                <span className="font-medium tabular-nums">
                  {formatPrice(order.totalCents, order.currency)}
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {formatEventDate(order.event.startsAt)} · {order.event.venue}, {order.event.city}
              </p>
              <ul className="mt-3 flex flex-col gap-3 text-sm" aria-label="Seats">
                {order.tickets.map((t) => (
                  <li key={t.id} className="flex items-center gap-4" data-testid="ticket">
                    {/* White tile so the code scans in dark mode too. */}
                    {/* eslint-disable-next-line @next/next/no-img-element -- inline SVG data URI */}
                    <img
                      src={qrCodes.get(t.id)}
                      alt={`QR code for ${t.section}, row ${t.row}, seat ${t.number}`}
                      width={96}
                      height={96}
                      className="rounded bg-white"
                    />
                    <span>
                      {t.section} · Row {t.row} · Seat {t.number}
                      <span className="ml-2 text-zinc-500">{t.tierName}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-zinc-500">
                Order {order.id} · bought {formatEventDate(order.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function TicketsPage({ searchParams }: PageProps<'/tickets'>) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <h1 className="mb-8 text-3xl font-semibold tracking-tight">My tickets</h1>
      {/* The session and the orders are request data: stream them in. */}
      <Suspense fallback={<p className="text-zinc-500">Loading your tickets…</p>}>
        <MyTickets searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
