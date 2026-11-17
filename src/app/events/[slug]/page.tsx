import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { HoldCountdown } from '@/components/seats/hold-countdown';
import { SeatPicker } from '@/components/seats/seat-picker';
import { MAX_SEATS_PER_ORDER } from '@/lib/config';
import { getPrisma } from '@/lib/db';
import { getShopAccess } from '@/lib/event-access';
import { isOnSale } from '@/lib/events';
import { formatEventDate, formatPrice } from '@/lib/format';
import { getSeatAvailability } from '@/lib/holds';
import { getRedis } from '@/lib/redis';
import { getSeatMap, type SeatMapSection } from '@/lib/seating';
import { getCurrentUser } from '@/server/session';

/** Distinct price tiers, cheapest last, e.g. "Category 1 · S$188.00". */
function priceList(sections: SeatMapSection[]) {
  const tiers = new Map<string, { name: string; cents: number; currency: string }>();
  for (const { price } of sections) {
    if (price) tiers.set(`${price.tier}|${price.cents}`, { name: price.tier, ...price });
  }
  return [...tiers.values()].sort((a, b) => b.cents - a.cents);
}

async function EventDetails({ params }: Pick<PageProps<'/events/[slug]'>, 'params'>) {
  const { slug } = await params;
  const prisma = getPrisma();
  const [map, user] = await Promise.all([getSeatMap(prisma, slug), getCurrentUser()]);
  if (!map) notFound();

  const onSale = isOnSale(map.event);
  // High-demand on-sale: only fans admitted from the waiting room get to the seat map.
  const access = onSale
    ? await getShopAccess({ prisma, redis: getRedis() }, { event: map.event, userId: user?.id })
    : null;
  if (access && !access.allowed) redirect(`/events/${slug}/queue`);

  // Availability is live data: read it on every request (never cached).
  const availability = await getSeatAvailability(prisma, map.event.id, { userId: user?.id });
  const tiers = priceList(map.sections);

  return (
    <>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">{map.event.title}</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400" data-testid="event-when-where">
          {formatEventDate(map.event.startsAt)} · {map.venue.name}, {map.venue.city}
        </p>
        {map.event.description && <p className="mt-4 max-w-2xl">{map.event.description}</p>}
        {tiers.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2 text-sm" aria-label="Ticket prices">
            {tiers.map((t) => (
              <li
                key={`${t.name}-${t.cents}`}
                className="rounded-full border border-zinc-200 px-3 py-1 dark:border-zinc-800"
              >
                {t.name} · {formatPrice(t.cents, t.currency)}
              </li>
            ))}
          </ul>
        )}
      </header>

      {access?.via === 'pass' && (
        <p
          className="mb-6 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
          data-testid="access-pass"
        >
          You&apos;re in! Pick your seats before your turn ends in{' '}
          <HoldCountdown expiresAt={access.passExpiresAt.toISOString()} testId="pass-countdown" />.
        </p>
      )}

      {!onSale && (
        <p className="mb-6 rounded-md bg-zinc-100 px-4 py-3 text-sm dark:bg-zinc-900">
          Tickets for this event are not on sale.
        </p>
      )}

      <section aria-labelledby="seats-heading">
        <h2 id="seats-heading" className="mb-4 text-xl font-medium">
          Choose your seats
        </h2>
        <SeatPicker
          eventId={map.event.id}
          sections={map.sections}
          unavailable={availability.unavailable}
          held={availability.held}
          heldUntil={availability.heldUntil?.toISOString() ?? null}
          signedIn={Boolean(user)}
          onSale={onSale}
          maxSeats={MAX_SEATS_PER_ORDER}
          checkoutHref={`/events/${slug}/checkout`}
        />
      </section>
    </>
  );
}

export default function EventPage({ params }: PageProps<'/events/[slug]'>) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
        ← All events
      </Link>
      <div className="mt-4">
        {/* params, the session and seat availability are request data: stream them in. */}
        <Suspense fallback={<p className="text-zinc-500">Loading event…</p>}>
          <EventDetails params={params} />
        </Suspense>
      </div>
    </main>
  );
}
