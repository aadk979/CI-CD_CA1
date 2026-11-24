import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { PaymentForm } from '@/components/checkout/payment-form';
import { HoldCountdown } from '@/components/seats/hold-countdown';
import { BackLink, PageShell } from '@/components/ui/page';
import { button, card } from '@/components/ui/styles';
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
      <BackLink href={eventPath}>Back to seats</BackLink>
      <header className="mt-6 mb-10">
        <p className="text-violet-soft mb-3 text-xs font-semibold tracking-[0.14em] uppercase">
          Secure checkout
        </p>
        <h1 className="font-display text-display-sm text-ink md:text-display-md font-semibold">
          Checkout
        </h1>
        <p className="text-body mt-2">
          {event.title} · {formatEventDate(event.startsAt)} · {event.venue.name}
        </p>
      </header>

      {!cart ? (
        <div data-testid="empty-cart" className={`${card} max-w-xl p-8`}>
          <p className="text-body mb-6">
            You have no seats on hold for this event. Holds last 10 minutes, so yours may have
            expired.
          </p>
          <Link href={eventPath} className={button.primary}>
            Choose seats
          </Link>
        </div>
      ) : (
        <div className="grid items-start gap-8 lg:grid-cols-[1fr_1.1fr]">
          <section aria-labelledby="cart-heading" className={`${card} p-6 lg:sticky lg:top-24`}>
            <h2 id="cart-heading" className="font-display text-ink mb-4 text-xl font-semibold">
              Your seats
            </h2>
            <ul className="divide-hairline divide-y" data-testid="cart">
              {cart.items.map((item) => (
                <li key={item.seatId} className="flex justify-between gap-4 py-3 text-sm">
                  <span className="text-ink">
                    {item.section} · Row {item.row} · Seat {item.number}
                    <span className="text-muted ml-2">{item.tierName}</span>
                  </span>
                  <span className="text-ink tabular-nums">
                    {formatPrice(item.priceCents, cart.currency)}
                  </span>
                </li>
              ))}
              <li
                className="text-ink flex justify-between pt-4 font-semibold"
                data-testid="cart-total"
              >
                <span>Total</span>
                <span className="font-display text-gradient text-2xl tabular-nums">
                  {formatPrice(cart.totalCents, cart.currency)}
                </span>
              </li>
            </ul>
            <p className="border-hairline bg-surface-2 rounded-btn text-body mt-5 border px-4 py-3 text-sm">
              Seats held for{' '}
              <HoldCountdown expiresAt={cart.expiresAt.toISOString()} testId="checkout-countdown" />
              .{' '}
              <Link href={eventPath} className={button.link}>
                Change seats
              </Link>
            </p>
          </section>

          <section aria-labelledby="payment-heading" className={`${card} p-6`}>
            <h2 id="payment-heading" className="font-display text-ink mb-4 text-xl font-semibold">
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
    <PageShell>
      <Suspense
        fallback={
          <div className="flex flex-col gap-4" aria-busy>
            <p className="sr-only">Loading your cart…</p>
            <div className="skeleton h-12 w-1/3" />
            <div className="skeleton h-64 w-full" />
          </div>
        }
      >
        <Checkout params={params} />
      </Suspense>
    </PageShell>
  );
}
