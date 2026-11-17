import type { PrismaClient } from '@/generated/prisma/client';
import type { UserRole } from './account';
import { isUniqueViolation } from './holds';
import { slugify, type EventFieldErrors, type EventFormData } from './event-form';

/**
 * Organiser back office (SCRUM-28): create events as drafts, then publish them for sale.
 * Framework-free, so integration tests run it against the real database. Callers must
 * have checked the user is an organiser first (see src/server/organiser.ts).
 */

export interface VenueOption {
  id: string;
  name: string;
  city: string;
  sections: { id: string; code: string; name: string; seats: number }[];
}

/** Venues with their sections, for the create-event form. */
export async function listVenues(prisma: PrismaClient): Promise<VenueOption[]> {
  const venues = await prisma.venue.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      city: true,
      sections: {
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        select: { id: true, code: true, name: true, _count: { select: { seats: true } } },
      },
    },
  });
  return venues.map((v) => ({
    ...v,
    sections: v.sections.map(({ _count, ...s }) => ({ ...s, seats: _count.seats })),
  }));
}

/** `base`, or `base-2`, `base-3`, … whichever is free. */
async function freeSlug(prisma: PrismaClient, base: string): Promise<string> {
  const taken = new Set(
    (
      await prisma.event.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } })
    ).map((e) => e.slug),
  );
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export type CreateEventResult =
  { ok: true; event: { id: string; slug: string } } | { ok: false; fieldErrors: EventFieldErrors };

/** Create a DRAFT event with its price tiers. Fans can't see it until it is published. */
export async function createEvent(
  prisma: PrismaClient,
  data: EventFormData,
): Promise<CreateEventResult> {
  const venue = await prisma.venue.findUnique({
    where: { id: data.venueId },
    select: { sections: { select: { id: true, name: true } } },
  });
  if (!venue) return { ok: false, fieldErrors: { venueId: 'Choose a venue' } };

  const sectionNames = new Map(venue.sections.map((s) => [s.id, s.name]));
  const foreign = data.prices.find((p) => !sectionNames.has(p.sectionId));
  if (foreign) {
    return { ok: false, fieldErrors: { prices: 'Prices must be for sections of this venue' } };
  }

  const base = slugify(data.title);
  // Two organisers can pick the same free slug at once: the unique index rejects the
  // second, which then retries with the next free one.
  for (let attempt = 0; ; attempt++) {
    const slug = await freeSlug(prisma, base);
    try {
      const event = await prisma.event.create({
        data: {
          slug,
          title: data.title,
          description: data.description,
          startsAt: data.startsAt,
          waitingRoom: data.waitingRoom,
          status: 'DRAFT',
          venueId: data.venueId,
          priceTiers: {
            create: data.prices.map((p) => ({
              sectionId: p.sectionId,
              name: p.tierName ?? sectionNames.get(p.sectionId)!,
              priceCents: p.priceCents,
            })),
          },
        },
        select: { id: true, slug: true },
      });
      return { ok: true, event };
    } catch (err) {
      if (!isUniqueViolation(err) || attempt >= 2) throw err;
    }
  }
}

export type PublishFailure = 'not-found' | 'not-draft' | 'in-past' | 'no-prices';
export type PublishResult = { ok: true; slug: string } | { ok: false; code: PublishFailure };

export const PUBLISH_MESSAGES: Record<PublishFailure, string> = {
  'not-found': 'That event no longer exists.',
  'not-draft': 'This event has already been published.',
  'in-past': 'This event has already started, so it can’t go on sale.',
  'no-prices': 'Price at least one section before publishing.',
};

/** DRAFT → ON_SALE. Only a future event with at least one price tier can go on sale. */
export async function publishEvent(
  prisma: PrismaClient,
  eventId: string,
  now: Date = new Date(),
): Promise<PublishResult> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { slug: true, status: true, startsAt: true, _count: { select: { priceTiers: true } } },
  });
  if (!event) return { ok: false, code: 'not-found' };
  if (event.status !== 'DRAFT') return { ok: false, code: 'not-draft' };
  if (event.startsAt <= now) return { ok: false, code: 'in-past' };
  if (event._count.priceTiers === 0) return { ok: false, code: 'no-prices' };

  // Re-check the status in the write itself, so two clicks publish once.
  const { count } = await prisma.event.updateMany({
    where: { id: eventId, status: 'DRAFT' },
    data: { status: 'ON_SALE' },
  });
  return count === 1 ? { ok: true, slug: event.slug } : { ok: false, code: 'not-draft' };
}

export interface OrganiserEventRow {
  id: string;
  slug: string;
  title: string;
  startsAt: Date;
  status: 'DRAFT' | 'ON_SALE' | 'SOLD_OUT' | 'CANCELLED';
  waitingRoom: boolean;
  venueName: string;
  priceTiers: number;
  ticketsSold: number;
}

/** Every event in every status, soonest first: the organiser dashboard. */
export async function listOrganiserEvents(prisma: PrismaClient): Promise<OrganiserEventRow[]> {
  const events = await prisma.event.findMany({
    orderBy: [{ startsAt: 'asc' }, { title: 'asc' }],
    select: {
      id: true,
      slug: true,
      title: true,
      startsAt: true,
      status: true,
      waitingRoom: true,
      venue: { select: { name: true } },
      _count: { select: { priceTiers: true, tickets: true } },
    },
  });
  return events.map(({ venue, _count, ...e }) => ({
    ...e,
    venueName: venue.name,
    priceTiers: _count.priceTiers,
    ticketsSold: _count.tickets,
  }));
}

/** Grant or revoke the organiser role. False if no account has that email. */
export async function setUserRole(
  prisma: PrismaClient,
  email: string,
  role: UserRole,
): Promise<boolean> {
  const { count } = await prisma.user.updateMany({
    where: { email: email.trim().toLowerCase() },
    data: { role },
  });
  return count === 1;
}
