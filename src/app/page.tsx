import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { getSeatCategories, getUpcomingEvents } from '@/app/events/queries';
import { CatalogueSkeleton } from '@/components/events/catalogue-skeleton';
import { EventCard } from '@/components/events/event-card';
import { MiniQr, ProductMockup } from '@/components/marketing/product-mockup';
import { Band, SectionHeading } from '@/components/marketing/section';
import { CountUp } from '@/components/motion/count-up';
import { HoverLift, Reveal } from '@/components/motion/reveal';
import { StaggerGroup, StaggerItem } from '@/components/motion/stagger';
import { badge, badgeTone, button, card, container } from '@/components/ui/styles';
import { ACCESS_PASS_TTL_MS, APP_NAME, HOLD_DURATION_MS, MAX_SEATS_PER_ORDER } from '@/lib/config';
import { formatPrice } from '@/lib/format';

/* ── Hero ────────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section aria-labelledby="hero-heading" className="relative isolate overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="bg-grid absolute inset-0" />
        <div className="glow-violet absolute -top-40 left-[-10%] h-[620px] w-[760px]" />
        <div className="glow-pink absolute top-10 right-[-15%] h-[560px] w-[720px]" />
        <div className="glow-amber absolute bottom-[-30%] left-1/3 h-[420px] w-[620px]" />
        <div className="bg-grain absolute inset-0" />
      </div>

      <div
        className={`${container} grid items-center gap-16 pt-16 pb-24 md:pt-24 lg:grid-cols-12 lg:gap-10`}
      >
        <StaggerGroup className="lg:col-span-7">
          <StaggerItem>
            <span className={`${badge} ${badgeTone.live}`}>
              <span className="animate-live-pulse bg-live h-1.5 w-1.5 rounded-full" aria-hidden />
              Live seat maps · fair virtual queue
            </span>
          </StaggerItem>
          <StaggerItem>
            <h1
              id="hero-heading"
              className="font-display text-display-md text-ink sm:text-display-lg xl:text-display-xl mt-6 font-semibold"
            >
              The on-sale that{' '}
              <span className="animate-gradient-pan text-gradient">plays fair.</span>
            </h1>
          </StaggerItem>
          <StaggerItem>
            <p className="text-body mt-6 max-w-xl text-lg">
              {APP_NAME} lines fans up in the order they arrive, lets them in a few at a time, and
              holds the seats they pick while they pay. No refresh roulette, no bots jumping the
              queue, tickets with a QR code the moment the payment clears.
            </p>
          </StaggerItem>
          <StaggerItem className="mt-8 flex flex-wrap gap-3">
            <Link href="/events" className={button.primary}>
              Browse events
            </Link>
            <Link href="/how-it-works" className={button.secondary}>
              How the waiting room works
            </Link>
          </StaggerItem>
          <StaggerItem>
            <ul className="text-muted mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {['Card payments by Stripe', 'Seats update in under a second', 'QR tickets'].map(
                (t) => (
                  <li key={t} className="flex items-center gap-2">
                    <svg viewBox="0 0 16 16" className="text-success h-4 w-4" aria-hidden>
                      <path
                        d="M3 8.5 6.5 12 13 4.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {t}
                  </li>
                ),
              )}
            </ul>
          </StaggerItem>
        </StaggerGroup>

        <Reveal className="lg:col-span-5" delay={0.25}>
          <ProductMockup />
        </Reveal>
      </div>
    </section>
  );
}

/* ── Stats ───────────────────────────────────────────────────────────────── */

const minutes = (ms: number) => Math.round(ms / 60_000);

/** Real product rules from src/lib/config.ts, not marketing numbers. */
const STATS = [
  { value: minutes(HOLD_DURATION_MS), suffix: ' min', label: 'Seats held for you while you pay' },
  { value: MAX_SEATS_PER_ORDER, suffix: '', label: 'Seats per fan, so nobody hoards' },
  { value: minutes(ACCESS_PASS_TTL_MS), suffix: ' min', label: 'Shopping window once admitted' },
  { value: 1, prefix: '<', suffix: ' s', label: 'For a taken seat to grey out for everyone' },
] as const;

function Stats() {
  return (
    <section aria-label="Platform rules" className="border-hairline bg-canvas-raised border-y">
      <dl className={`${container} grid grid-cols-2 gap-px py-12 lg:grid-cols-4`}>
        {STATS.map((s, i) => (
          <Reveal
            key={s.label}
            delay={i * 0.08}
            className="flex flex-col-reverse px-4 py-4 text-center"
          >
            <dt className="text-muted mt-2 text-sm">{s.label}</dt>
            <dd className="font-display text-display-sm text-ink md:text-display-md font-semibold">
              <CountUp value={s.value} prefix={'prefix' in s ? s.prefix : ''} suffix={s.suffix} />
            </dd>
          </Reveal>
        ))}
      </dl>
    </section>
  );
}

/* ── How it works ────────────────────────────────────────────────────────── */

function StepVisual({ step }: { step: number }) {
  switch (step) {
    case 0:
      return (
        <div className="rounded-btn border-hairline bg-surface-2 flex w-full items-center gap-4 border px-4 py-3">
          <span className="text-muted text-xs">Your place</span>
          <span className="font-display text-ink text-2xl font-semibold tabular-nums">12</span>
          <span className="text-live ml-auto flex items-center gap-1.5 text-xs font-semibold">
            <span className="animate-live-pulse bg-live h-1.5 w-1.5 rounded-full" aria-hidden />
            Live
          </span>
        </div>
      );
    case 1:
      return (
        <div className="rounded-btn border-hairline bg-surface-2 grid w-fit grid-cols-8 gap-1 border p-3">
          {Array.from({ length: 24 }, (_, i) => (
            <span
              key={i}
              className={`h-3 w-3 rounded-[3px] border ${
                i === 10 || i === 11
                  ? 'border-seat-selected bg-seat-selected'
                  : i % 5 === 0
                    ? 'border-seat-taken bg-seat-taken'
                    : 'border-seat-available/70'
              }`}
            />
          ))}
        </div>
      );
    case 2:
      return (
        <div className="flex items-center gap-3">
          <span className="rounded-btn bg-ink text-on-light px-4 py-2 text-sm font-semibold">
            Pay $376.00
          </span>
          <span className="text-pink-soft font-mono text-sm">9:58</span>
        </div>
      );
    default:
      return (
        <div className="flex items-center gap-3">
          <MiniQr className="h-14 w-14" seed={3} />
          <span className="text-muted text-xs">
            Floor · Row A
            <br />
            Seat 11
          </span>
        </div>
      );
  }
}

const STEPS = [
  {
    title: 'Join the queue',
    body: 'High-demand shows open with a waiting room. Your place is fixed when you join, and refreshing never sends you to the back.',
  },
  {
    title: 'Pick your seats',
    body: 'Once you are let in, choose up to six seats on a live map. Seats other fans take grey out instantly.',
  },
  {
    title: 'Pay while they are held',
    body: 'Holding seats reserves them for ten minutes. Pay by card through Stripe, with the countdown always in view.',
  },
  {
    title: 'Scan your QR ticket',
    body: 'Tickets appear in My tickets the moment the payment clears, each with its own QR code for the gate.',
  },
] as const;

function HowItWorks() {
  return (
    <Band labelledBy="how-heading">
      <SectionHeading
        id="how-heading"
        eyebrow="How it works"
        title="From queue to QR in four steps"
        lead="Every step shows you exactly where you stand, so a sell-out feels like a line, not a lottery."
      />
      <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <Reveal as="li" key={s.title} delay={i * 0.08}>
            <HoverLift className={`${card} hover:shadow-card-hover flex h-full flex-col gap-6 p-8`}>
              <div className="flex min-h-16 items-center">
                <StepVisual step={i} />
              </div>
              <div>
                <p className="text-violet-soft font-mono text-xs">0{i + 1}</p>
                <h3 className="font-display mt-2 text-xl font-semibold tracking-[-0.5px]">
                  {s.title}
                </h3>
                <p className="text-body mt-2 text-sm">{s.body}</p>
              </div>
            </HoverLift>
          </Reveal>
        ))}
      </ol>
    </Band>
  );
}

/* ── Featured events + seat categories (database, streamed in) ───────────── */

async function FeaturedEvents() {
  await connection(); // never at build time: there is no database during `next build`
  const events = await getUpcomingEvents({ limit: 3 });
  if (events.length === 0) {
    return <p className="text-body text-center">No events on sale yet. Check back soon.</p>;
  }
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {events.map((event, i) => (
        <Reveal as="li" key={event.id} delay={i * 0.08}>
          <EventCard event={event} />
        </Reveal>
      ))}
    </ul>
  );
}

async function SeatCategories() {
  await connection();
  // Show the soonest event with the richest price list (most categories).
  const upcoming = await getUpcomingEvents({ limit: 3 });
  const options = await Promise.all(
    upcoming.map(async (event) => ({ event, categories: await getSeatCategories(event.slug) })),
  );
  const best = options.reduce<(typeof options)[number] | null>(
    (top, o) => (!top || o.categories.length > top.categories.length ? o : top),
    null,
  );
  if (!best || best.categories.length === 0) return null;
  const { event: first, categories } = best;

  return (
    <Band labelledBy="categories-heading">
      <SectionHeading
        id="categories-heading"
        eyebrow="Seat categories"
        title={
          <>
            Pick your view of <span className="text-gradient">{first.title}</span>
          </>
        }
        lead={`Live prices for ${first.venueName}. Every category gets the same fair queue and ten-minute hold.`}
      />
      <ul className="flex flex-wrap justify-center gap-5">
        {categories.map((c, i) => {
          const featured = i === 0;
          return (
            <Reveal
              as="li"
              key={c.id}
              delay={i * 0.08}
              className="w-full md:w-[calc((100%-2.5rem)/3)]"
            >
              <HoverLift
                className={`rounded-card relative flex h-full flex-col p-8 ${
                  featured
                    ? 'border-violet-soft/40 bg-surface-2 shadow-card-hover border'
                    : `${card}`
                }`}
              >
                {featured && (
                  <span className={`${badge} ${badgeTone.brand} absolute top-6 right-6`}>
                    Closest to the stage
                  </span>
                )}
                <h3 className="font-display text-xl font-semibold tracking-[-0.5px]">{c.name}</h3>
                <p className="text-muted text-sm">{c.tier}</p>
                <p className="font-display text-display-sm text-ink mt-6 font-semibold">
                  {formatPrice(c.cents, c.currency)}
                  <span className="text-muted ml-1 font-sans text-sm font-normal">/ seat</span>
                </p>
                <ul className="text-body mt-6 flex flex-col gap-3 text-sm">
                  {[
                    `${c.seats.toLocaleString('en-SG')} seats in ${c.rows} row${c.rows === 1 ? '' : 's'}`,
                    `Up to ${MAX_SEATS_PER_ORDER} per order`,
                    'Held for 10 minutes while you pay',
                    'QR ticket on purchase',
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span className="bg-gradient-brand mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/events/${first.slug}`}
                  className={`${featured ? button.primary : button.secondary} mt-8`}
                  aria-label={`See ${c.name} seats for ${first.title}`}
                >
                  See seats
                </Link>
              </HoverLift>
            </Reveal>
          );
        })}
      </ul>
    </Band>
  );
}

/* ── Testimonials (illustrative) ─────────────────────────────────────────── */

const QUOTES = [
  {
    quote:
      'I could see my place drop every few seconds instead of staring at a spinner. When it said I was in, the seats I wanted were still there.',
    name: 'Concert-goer',
    role: 'Fan, arena on-sale',
    initial: 'C',
    avatar: 'bg-avatar-orange',
  },
  {
    quote:
      'The ten-minute hold took the panic out of checkout. The countdown was always on screen, so I knew exactly how long I had.',
    name: 'Season regular',
    role: 'Fan, jazz series',
    initial: 'S',
    avatar: 'bg-avatar-pink',
  },
  {
    quote:
      'Drafting the event, previewing the seat map and switching on the waiting room took minutes. Publishing put it live straight away.',
    name: 'Event organiser',
    role: 'Promoter, small venue',
    initial: 'E',
    avatar: 'bg-avatar-violet',
  },
] as const;

function Testimonials() {
  return (
    <Band surface="raised" labelledBy="voices-heading">
      <SectionHeading
        id="voices-heading"
        eyebrow="What it feels like"
        title="Built for the moment the gates open"
        lead="Illustrative quotes describing the intended experience; not from real customers."
      />
      <ul className="grid gap-5 md:grid-cols-3">
        {QUOTES.map((q, i) => (
          <Reveal as="li" key={q.name} delay={i * 0.08}>
            <figure className={`${card} flex h-full flex-col p-8`}>
              <blockquote className="text-body flex-1">“{q.quote}”</blockquote>
              <figcaption className="mt-6 flex items-center gap-3">
                <span
                  className={`text-on-light flex h-9 w-9 items-center justify-center rounded-full text-base font-bold ${q.avatar}`}
                  aria-hidden
                >
                  {q.initial}
                </span>
                <span className="text-sm">
                  <span className="text-ink block font-semibold">{q.name}</span>
                  <span className="text-muted">{q.role}</span>
                </span>
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </ul>
    </Band>
  );
}

/* ── CTA band ────────────────────────────────────────────────────────────── */

function CtaBand() {
  return (
    <section aria-labelledby="cta-heading" className="py-section">
      <div className={container}>
        <Reveal className="rounded-mock border-hairline-strong bg-surface relative isolate overflow-hidden border px-6 py-16 text-center md:px-16 md:py-20">
          <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
            <div className="bg-grid absolute inset-0" />
            <div className="glow-violet absolute -top-1/2 left-1/2 h-[480px] w-[820px] -translate-x-1/2" />
            <div className="glow-pink absolute -bottom-1/2 left-1/4 h-[380px] w-[520px]" />
          </div>
          <h2
            id="cta-heading"
            className="font-display text-display-sm md:text-display-lg mx-auto max-w-2xl font-semibold"
          >
            Be first in line for the <span className="text-gradient">next big night.</span>
          </h2>
          <p className="text-body mx-auto mt-4 max-w-xl">
            Create a free account so you are ready to join the queue the second an on-sale opens.
            Selling tickets instead? Pick the organiser option when you sign up.
          </p>
          <div className="mt-8 flex justify-center">
            <Link href="/register" className={button.primary}>
              Create your account
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function Home() {
  return (
    <main className="flex-1">
      <Hero />
      <Stats />
      <HowItWorks />
      <Band surface="raised" labelledBy="featured-heading">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHeading
            id="featured-heading"
            eyebrow="On sale now"
            title="Featured events"
            align="left"
          />
          <Link href="/events" className={`${button.secondary} mb-14`}>
            See all events
          </Link>
        </div>
        <Suspense fallback={<CatalogueSkeleton />}>
          <FeaturedEvents />
        </Suspense>
      </Band>
      <Suspense fallback={null}>
        <SeatCategories />
      </Suspense>
      <Testimonials />
      <CtaBand />
    </main>
  );
}
