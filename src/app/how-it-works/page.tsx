import type { Metadata } from 'next';
import Link from 'next/link';
import { Band, SectionHeading } from '@/components/marketing/section';
import { Reveal } from '@/components/motion/reveal';
import { Backdrop } from '@/components/ui/page';
import { button, card, container } from '@/components/ui/styles';
import { ACCESS_PASS_TTL_MS, HOLD_DURATION_MS, MAX_SEATS_PER_ORDER } from '@/lib/config';

export const metadata: Metadata = {
  title: 'How the waiting room works',
  description: 'How TixQueue keeps high-demand on-sales fair: a first-come queue, batches, holds.',
};

const PASS_MIN = ACCESS_PASS_TTL_MS / 60_000;
const HOLD_MIN = HOLD_DURATION_MS / 60_000;

const TIMELINE = [
  {
    tag: 'Join',
    tone: 'text-amber-soft',
    title: 'You join the queue',
    body: 'Opening a high-demand event takes you to its waiting room. Joining gives you a numbered place behind everyone already waiting. That number never changes.',
  },
  {
    tag: 'Wait',
    tone: 'text-live',
    title: 'Your place counts down live',
    body: 'A background worker lets fans in a few at a time, in order. Your position and estimated wait update over a WebSocket, without reloading.',
  },
  {
    tag: 'Admitted',
    tone: 'text-success',
    title: `You get a ${PASS_MIN}-minute pass`,
    body: 'When your number comes up you are sent to the seat map automatically, with a timed pass. Opening the seat map without one sends you back to the queue.',
  },
  {
    tag: 'Hold',
    tone: 'text-pink-soft',
    title: `Seats are held for ${HOLD_MIN} minutes`,
    body: `Pick up to ${MAX_SEATS_PER_ORDER} seats and hold them. Other fans see them taken within a second. If the hold lapses, they go back on sale.`,
  },
  {
    tag: 'Paid',
    tone: 'text-violet-soft',
    title: 'Pay and get QR tickets',
    body: 'Card payment runs through Stripe. Once it clears, the seats are sold to you and each ticket appears in My tickets with its own QR code.',
  },
] as const;

const FAQ = [
  [
    'What if I refresh or lose my connection?',
    'You keep your place. The page reconnects on its own and catches up with how far the queue has moved.',
  ],
  [
    'Can I open the event in several tabs to get ahead?',
    'No. Your place belongs to your account, not the tab, so every tab shows the same number.',
  ],
  [
    'What happens if my hold runs out?',
    'The seats are released for other fans and you can pick again while your pass lasts. The countdown pulses during the last minute.',
  ],
  [
    'Do normal events have a queue?',
    'Only events the organiser marks as high demand. Everything else opens straight to the seat map.',
  ],
] as const;

export default function HowItWorksPage() {
  return (
    <main className="flex-1">
      <section aria-labelledby="hiw-heading" className="relative isolate overflow-hidden">
        <Backdrop />
        <div className={`${container} py-section text-center`}>
          <p className="text-violet-soft mb-3 text-xs font-semibold tracking-[0.14em] uppercase">
            How it works
          </p>
          <h1
            id="hiw-heading"
            className="font-display text-display-md text-ink md:text-display-xl mx-auto max-w-4xl font-semibold"
          >
            A line you can see, <span className="text-gradient">not a lottery.</span>
          </h1>
          <p className="text-body mx-auto mt-6 max-w-2xl text-lg">
            When thousands of fans arrive at once, the fastest refresh should not win. The waiting
            room lets people in by arrival order and protects the seats they pick while they pay.
          </p>
        </div>
      </section>

      <Band surface="raised" id="fair-queue" labelledBy="timeline-heading">
        <SectionHeading
          id="timeline-heading"
          eyebrow="Fair queueing"
          title="From arrival to QR ticket"
          lead="Five states, each one visible to you on screen."
        />
        <ol className="relative mx-auto max-w-3xl">
          <span
            className="bg-gradient-brand absolute top-2 bottom-2 left-[19px] w-px opacity-50"
            aria-hidden
          />
          {TIMELINE.map((step, i) => (
            <Reveal as="li" key={step.tag} delay={i * 0.06} className="relative flex gap-6 pb-10">
              <span
                className={`border-hairline-strong bg-surface relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border font-mono text-sm font-semibold ${step.tone}`}
                aria-hidden
              >
                {i + 1}
              </span>
              <div className={`${card} flex-1 p-6`}>
                <p className={`text-xs font-semibold tracking-[0.14em] uppercase ${step.tone}`}>
                  {step.tag}
                </p>
                <h3 className="font-display mt-2 text-xl font-semibold tracking-[-0.5px]">
                  {step.title}
                </h3>
                <p className="text-body mt-2 text-sm">{step.body}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </Band>

      <Band labelledBy="faq-heading">
        <SectionHeading id="faq-heading" eyebrow="Questions" title="What if…" />
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {FAQ.map(([q, a]) => (
            <details key={q} className={`${card} group p-0`}>
              <summary className="text-ink flex cursor-pointer list-none items-center justify-between gap-4 p-5 font-semibold">
                {q}
                <span
                  className="text-violet-soft transition duration-200 group-open:rotate-45"
                  aria-hidden
                >
                  +
                </span>
              </summary>
              <p className="text-body px-5 pb-5 text-sm">{a}</p>
            </details>
          ))}
        </div>
        <div className="mt-14 flex justify-center">
          <Link href="/events" className={button.primary}>
            Find an event
          </Link>
        </div>
      </Band>
    </main>
  );
}
