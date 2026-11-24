import Link from 'next/link';
import { badge, badgeTone } from '@/components/ui/styles';
import type { EventSummary } from '@/lib/events';
import { formatEventDate } from '@/lib/format';

/** Poster gradients, picked per event so the grid has variety without stock imagery. */
const POSTERS = [
  'from-violet/70 via-pink/40 to-amber/30',
  'from-live/50 via-violet/50 to-pink/30',
  'from-pink/60 via-amber/40 to-violet/30',
  'from-amber/50 via-pink/40 to-live/30',
] as const;

const dayMonth = new Intl.DateTimeFormat('en-SG', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Asia/Singapore',
});

function posterFor(slug: string) {
  let hash = 0;
  for (const ch of slug) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return POSTERS[hash % POSTERS.length];
}

/**
 * One event in a grid. The title is the link; a stretched overlay makes the whole card
 * clickable while keeping a single, well-named link for screen readers.
 */
export function EventCard({ event }: { event: EventSummary }) {
  const [day, month] = dayMonth.format(event.startsAt).split(' ');
  return (
    <article className="group rounded-card border-hairline bg-surface shadow-card ease-out-expo hover:border-hairline-strong hover:shadow-card-hover has-[a:focus-visible]:ring-violet-soft relative flex h-full flex-col overflow-hidden border transition duration-300 hover:-translate-y-1 has-[a:focus-visible]:-translate-y-1 has-[a:focus-visible]:ring-2">
      <div
        className={`relative flex h-36 items-end justify-between overflow-hidden bg-linear-to-br p-4 ${posterFor(event.slug)}`}
        aria-hidden
      >
        <div className="bg-grain absolute inset-0" />
        <div className="absolute -right-6 -bottom-10 h-40 w-40 rounded-full border border-white/20" />
        <div className="absolute -right-2 -bottom-6 h-28 w-28 rounded-full border border-white/15" />
        <div className="rounded-btn bg-canvas/70 relative px-3 py-1.5 text-center backdrop-blur">
          <p className="font-display text-ink text-xl leading-none font-semibold">{day}</p>
          <p className="text-body mt-0.5 text-[11px] font-semibold tracking-widest uppercase">
            {month}
          </p>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <h3 className="font-display text-ink text-lg font-semibold tracking-[-0.3px]">
          <Link
            href={`/events/${event.slug}`}
            className="outline-none after:absolute after:inset-0 after:content-['']"
          >
            {event.title}
          </Link>
        </h3>
        <p className="text-muted text-sm">
          {formatEventDate(event.startsAt)} · {event.venueName}, {event.city}
        </p>
        <div className="mt-auto flex items-center justify-between pt-3">
          {event.waitingRoom ? (
            <span className={`${badge} ${badgeTone.warning}`}>
              <span className="bg-amber-soft h-1.5 w-1.5 rounded-full" aria-hidden />
              Waiting room
            </span>
          ) : (
            <span className={`${badge} ${badgeTone.success}`}>On sale</span>
          )}
          <span
            className="text-violet-soft text-sm font-semibold transition group-hover:translate-x-0.5"
            aria-hidden
          >
            {event.waitingRoom ? 'Join queue →' : 'Pick seats →'}
          </span>
        </div>
      </div>
    </article>
  );
}
