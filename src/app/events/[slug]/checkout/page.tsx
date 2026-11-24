import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { PaymentForm } from '@/components/checkout/payment-form';
import { HoldCountdown } from '@/components/seats/hold-countdown';
import { getPrisma } from '@/lib/db';
import { formatEventDate, formatPrice } from '@/lib/format';
import { getCart } from '@/lib/orders';
import { getCurrentUser } from '@/server/session';

export const metadata: Metadata = { title: 'Checkout' };

async function Checkout({ params }: Pick<PageProps<'/events/[slug]/checkout'>, 'params'>) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const prisma = getPrisma();
  const event = await prisma.event.findUnique({
    where: { slug },
    select: { id: true, title: true, startsAt: true, venue: { select: { name: true } } },
  });
  if (!event) notFound();

  const cart = await getCart(prisma, { eventId: event.id, userId: user.id });
  const eventPath = `/events/${slug}`;

  return (
    <>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Checkout</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          {event.title} · {formatEventDate(event.startsAt)} · {event.venue.name}
        </p>
      </header>

      {!cart ? (
        <div data-testid="empty-cart">
          <p className="mb-4">
            You have no seats on hold for this event. Holds last 10 minutes, so yours may have
            expired.
          </p>
          <Link href={eventPath} className="font-medium underline">
            Choose seats
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <section aria-labelledby="cart-heading">
            <h2 id="cart-heading" className="mb-3 text-xl font-medium">
              Your seats
            </h2>
            <ul
              className="divide-y divide-zinc-200 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800"
              data-testid="cart"
            >
              {cart.items.map((item) => (
                <li key={item.seatId} className="flex justify-between gap-4 px-4 py-3 text-sm">
                  <span>
                    {item.section} · Row {item.row} · Seat {item.number}
                    <span className="ml-2 text-zinc-500">{item.tierName}</span>
                  </span>
                  <span className="tabular-nums">
                    {formatPrice(item.priceCents, cart.currency)}
                  </span>
                </li>
              ))}
              <li className="flex justify-between px-4 py-3 font-medium" data-testid="cart-total">
                <span>Total</span>
                <span className="tabular-nums">{formatPrice(cart.totalCents, cart.currency)}</span>
              </li>
            </ul>
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              Seats held for{' '}
              <HoldCountdown expiresAt={cart.expiresAt.toISOString()} testId="checkout-countdown" />
              .{' '}
              <Link href={eventPath} className="underline">
                Change seats
              </Link>
            </p>
          </section>

          <section aria-labelledby="payment-heading">
            <h2 id="payment-heading" className="mb-3 text-xl font-medium">
              Payment
            </h2>
            <PaymentForm
              eventId={event.id}
              total={formatPrice(cart.totalCents, cart.currency)}
              publishableKey={process.env.STRIPE_PUBLISHABLE_KEY}
            />
          </section>
        </div>
      )}
    </>
  );
}

export default function CheckoutPage({ params }: PageProps<'/events/[slug]/checkout'>) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <Suspense fallback={<p className="text-zinc-500">Loading your cart…</p>}>
        <Checkout params={params} />
      </Suspense>
    </main>
  );
}
