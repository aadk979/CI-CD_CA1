import { z } from 'zod';
import { DESCRIPTION_MAX, TIER_NAME_MAX, TITLE_MAX } from './config';
import { isValidId } from './holds';

export { DESCRIPTION_MAX, TIER_NAME_MAX, TITLE_MAX };

/**
 * Validation for the organiser's "create event" form (SCRUM-28). Pure functions: the Server
 * Action reads the FormData, these decide what is valid, and `createEvent` writes it.
 */

/** S$10,000.00: a typo guard, well above any real ticket. */
export const MAX_PRICE_CENTS = 1_000_000;
/** More price fields than any venue has sections means a tampered form. */
export const MAX_PRICED_SECTIONS = 50;
/** Event times are entered and shown in Singapore time (UTC+8, no daylight saving). */
export const EVENT_UTC_OFFSET = '+08:00';
const EVENT_TIME_ZONE = 'Asia/Singapore';

export interface SectionPriceInput {
  price: string;
  tier: string;
}

/** What the form submitted, as plain strings (before validation). */
export interface EventFormInput {
  title: string;
  description: string;
  venueId: string;
  startsAt: string;
  waitingRoom: boolean;
  /** Keyed by section id. A blank price means "not on sale" for that section. */
  sections: Record<string, SectionPriceInput>;
}

export interface SectionPrice {
  sectionId: string;
  /** Blank tier names default to the section's own name when the event is created. */
  tierName: string | null;
  priceCents: number;
}

export interface EventFormData {
  title: string;
  description: string | null;
  venueId: string;
  startsAt: Date;
  waitingRoom: boolean;
  prices: SectionPrice[];
}

/** Field name → first error. Section fields are `price.<sectionId>` / `tier.<sectionId>`. */
export type EventFieldErrors = Record<string, string>;

export type EventFormResult =
  { ok: true; data: EventFormData } | { ok: false; fieldErrors: EventFieldErrors };

/** "68", "68.5" or "68.50" dollars → 6850 cents. Null if it isn't a valid price. */
export function parsePriceCents(input: string): number | null {
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!match) return null;
  // Integer arithmetic: never let floating point near money.
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return cents <= MAX_PRICE_CENTS ? cents : null;
}

const SGT_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: EVENT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** A Date as the `YYYY-MM-DDTHH:mm` a datetime-local input shows, in Singapore time. */
export function toDateTimeLocal(date: Date): string {
  const parts = Object.fromEntries(SGT_FORMAT.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/**
 * A datetime-local value ("2026-12-01T19:30"), read as Singapore time. Null if malformed
 * or not a real date: "2026-02-30T10:00" would silently roll over to 2 March otherwise.
 */
export function parseEventStart(input: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) return null;
  const date = new Date(`${input}:00${EVENT_UTC_OFFSET}`);
  if (Number.isNaN(date.getTime())) return null;
  return toDateTimeLocal(date) === input ? date : null;
}

/** "Neon Skyline: Encore!" → "neon-skyline-encore". Always matches /^[a-z0-9-]{1,80}$/. */
export function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // é → e
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 80)
    .replace(/^-+|-+$/g, '');
  return slug || 'event';
}

/** Read the create-event form. Unknown and malformed section fields are dropped. */
export function readEventForm(formData: FormData): EventFormInput {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === 'string' ? value : '';
  };

  const sections: Record<string, SectionPriceInput> = {};
  for (const key of formData.keys()) {
    const sectionId = key.startsWith('price.') ? key.slice('price.'.length) : null;
    if (!sectionId || !isValidId(sectionId) || sectionId in sections) continue;
    sections[sectionId] = { price: text(`price.${sectionId}`), tier: text(`tier.${sectionId}`) };
  }

  return {
    title: text('title'),
    description: text('description'),
    venueId: text('venueId'),
    startsAt: text('startsAt'),
    waitingRoom: formData.get('waitingRoom') === 'on',
    sections,
  };
}

const baseSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Enter a title')
    .max(TITLE_MAX, `Title must be ${TITLE_MAX} characters or fewer`),
  description: z
    .string()
    .trim()
    .max(DESCRIPTION_MAX, `Description must be ${DESCRIPTION_MAX} characters or fewer`),
  venueId: z.string().refine((id) => isValidId(id), 'Choose a venue'),
});

/** Validate everything that doesn't need the database. `now` decides what "future" means. */
export function validateEventForm(input: EventFormInput, now: Date = new Date()): EventFormResult {
  const fieldErrors: EventFieldErrors = {};

  const base = baseSchema.safeParse(input);
  if (!base.success) {
    for (const issue of base.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
  }

  const startsAt = parseEventStart(input.startsAt);
  if (!startsAt) fieldErrors.startsAt = 'Enter a date and time';
  else if (startsAt <= now) fieldErrors.startsAt = 'The event must start in the future';

  const entries = Object.entries(input.sections);
  const prices: SectionPrice[] = [];
  if (entries.length > MAX_PRICED_SECTIONS) {
    fieldErrors.prices = 'Too many sections';
  } else {
    for (const [sectionId, { price, tier }] of entries) {
      if (price.trim() === '') continue; // this section isn't on sale
      const priceCents = parsePriceCents(price);
      if (priceCents === null) {
        fieldErrors[`price.${sectionId}`] = 'Enter a price from 0 to 10000, e.g. 68.50';
        continue;
      }
      const tierName = tier.trim();
      if (tierName.length > TIER_NAME_MAX) {
        fieldErrors[`tier.${sectionId}`] = `Tier name must be ${TIER_NAME_MAX} characters or fewer`;
        continue;
      }
      prices.push({ sectionId, tierName: tierName || null, priceCents });
    }
    const sectionErrors = Object.keys(fieldErrors).some((k) => k.includes('.'));
    if (prices.length === 0 && !sectionErrors) {
      fieldErrors.prices = 'Price at least one section';
    }
  }

  if (Object.keys(fieldErrors).length > 0 || !base.success || !startsAt) {
    return { ok: false, fieldErrors };
  }
  return {
    ok: true,
    data: {
      title: base.data.title,
      description: base.data.description || null,
      venueId: base.data.venueId,
      startsAt,
      waitingRoom: input.waitingRoom,
      prices,
    },
  };
}
