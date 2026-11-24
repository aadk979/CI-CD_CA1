import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { HoldCountdown } from '@/components/seats/hold-countdown';
import { SeatPicker } from '@/components/seats/seat-picker';
import { BackLink, PageShell } from '@/components/ui/page';
import { notice } from '@/components/ui/styles';
import { MAX_SEATS_PER_ORDER } from '@/lib/config';
import { getPrisma } from '@/lib/db';
import { isOrganiser } from '@/lib/account';
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
  // Drafts are unpublished: organisers can preview them, everyone else gets a 404.
  const draft = map.event.status === 'DRAFT';
  if (draft && !isOrganiser(user)) notFound();

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
      <header className="mb-10">
        <p className="text-violet-soft mb-3 text-xs font-semibold tracking-[0.14em] uppercase">
          {onSale ? 'On sale now' : draft ? 'Draft' : 'Event'}
        </p>
        <h1 className="font-display text-display-sm text-ink md:text-display-lg font-semibold">
          {map.event.title}
        </h1>
        <p className="text-body mt-3" data-testid="event-when-where">
          {formatEventDate(map.event.startsAt)} · {map.venue.name}, {map.venue.city}
        </p>
        {map.event.description && (
          <p className="text-body mt-4 max-w-2xl">{map.event.description}</p>
        )}
        {tiers.length > 0 && (
          <ul className="mt-6 flex flex-wrap gap-2 text-sm" aria-label="Ticket prices">
            {tiers.map((t) => (
              <li
                key={`${t.name}-${t.cents}`}
                className="border-hairline-strong bg-surface text-ink rounded-full border px-3 py-1 font-medium"
              >
                {t.name} · {formatPrice(t.cents, t.currency)}
              </li>
            ))}
          </ul>
        )}
      </header>

      {access?.via === 'pass' && (
        <p className={`${notice.success} mb-6`} data-testid="access-pass">
          You&apos;re in! Pick your seats before your turn ends in{' '}
          <HoldCountdown expiresAt={access.passExpiresAt.toISOString()} testId="pass-countdown" />.
        </p>
      )}

      {draft ? (
        <p className={`${notice.warning} mb-6`} data-testid="draft-preview">
          Draft preview: fans can&apos;t see this event until you publish it from the{' '}
          <Link href="/organiser" className="font-medium underline">
            organiser page
          </Link>
          .
        </p>
      ) : (
        !onSale && <p className={`${notice.info} mb-6`}>Tickets for this event are not on sale.</p>
      )}

      <section aria-labelledby="seats-heading">
        <h2 id="seats-heading" className="font-display text-ink mb-4 text-xl font-semibold">
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
    <PageShell>
      <BackLink href="/events">All events</BackLink>
      <div className="mt-6">
        {/* params, the session and seat availability are request data: stream them in. */}
        <Suspense
          fallback={
            <div className="flex flex-col gap-4" aria-busy>
              <p className="sr-only">Loading event…</p>
              <div className="skeleton h-12 w-1/2" />
              <div className="skeleton h-5 w-1/3" />
              <div className="skeleton mt-6 h-96 w-full" />
            </div>
          }
        >
          <EventDetails params={params} />
        </Suspense>
      </div>
    </PageShell>
  );
}
