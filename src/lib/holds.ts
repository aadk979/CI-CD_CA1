import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { HOLD_DURATION_MS, MAX_SEATS_PER_ORDER } from './config';

/**
 * Seat holds (SCRUM-31/32/33). Framework-free: the Server Actions and the BullMQ
 * worker wrap these, and the integration tests call them against a real database.
 *
 * Double booking is prevented by the database, not by application checks: each
 * (event, seat) pair can have at most one SeatReservation row, so when two fans
 * race for the same seat the second insert fails and its whole transaction rolls back.
 */

export type HoldErrorCode = 'invalid' | 'not-found' | 'not-on-sale' | 'too-many' | 'unavailable';

export type HoldResult =
  | { ok: true; seatIds: string[]; expiresAt: Date }
  | { ok: false; code: HoldErrorCode; message: string; unavailable?: string[] };

export interface HoldRequest {
  eventId: string;
  userId: string;
  seatIds: string[];
  now?: Date;
}

export interface ReleasedSeats {
  eventId: string;
  seatIds: string[];
}

export interface SeatAvailability {
  /** Held by someone else, or sold. */
  unavailable: string[];
  /** This user's active holds. */
  held: string[];
  /** When this user's holds lapse, or null if they hold nothing. */
  heldUntil: Date | null;
}

const ID_PATTERN = /^[a-z0-9]{1,64}$/i;

/** Database ids are cuids: short alphanumeric strings. */
export function isValidId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

export const HOLD_MESSAGES = {
  invalid: 'Choose at least one seat.',
  notFound: 'This event does not exist.',
  notOnSale: 'Tickets for this event are not on sale.',
  badSeats: 'Some of those seats are not available for this event.',
  tooMany: `You can hold at most ${MAX_SEATS_PER_ORDER} seats.`,
  unavailable: 'Sorry, someone else just took one or more of those seats.',
} as const;

/**
 * Parse untrusted form input. Returns null when anything is malformed, so a
 * tampered request never reaches the database.
 */
export function parseHoldInput(
  eventId: unknown,
  seatIds: unknown[],
): { eventId: string; seatIds: string[] } | null {
  if (!isValidId(eventId)) return null;
  if (seatIds.length === 0 || seatIds.length > MAX_SEATS_PER_ORDER) return null;
  if (!seatIds.every(isValidId)) return null;
  return { eventId, seatIds: [...new Set(seatIds)] };
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

const activeHold = (now: Date) => ({ status: 'HELD' as const, expiresAt: { gt: now } });

/** Hold seats for a fan. All-or-nothing: either every requested seat is held, or none is. */
export async function holdSeats(
  prisma: PrismaClient,
  { eventId, userId, seatIds, now = new Date() }: HoldRequest,
): Promise<HoldResult> {
  const requested = [...new Set(seatIds)];
  if (requested.length === 0) return { ok: false, code: 'invalid', message: HOLD_MESSAGES.invalid };

  try {
    return await prisma.$transaction(async (tx): Promise<HoldResult> => {
      const event = await tx.event.findUnique({
        where: { id: eventId },
        select: { status: true, startsAt: true, venueId: true },
      });
      if (!event) return { ok: false, code: 'not-found', message: HOLD_MESSAGES.notFound };
      if (event.status !== 'ON_SALE' || event.startsAt <= now) {
        return { ok: false, code: 'not-on-sale', message: HOLD_MESSAGES.notOnSale };
      }

      // Seats must be in this event's venue, in a section that is priced (on sale) for it.
      const validSeats = await tx.seat.count({
        where: {
          id: { in: requested },
          section: { venueId: event.venueId, priceTiers: { some: { eventId } } },
        },
      });
      if (validSeats !== requested.length) {
        return { ok: false, code: 'invalid', message: HOLD_MESSAGES.badSeats };
      }

      // Lapsed holds no longer count: clear them so their seats can be taken right away,
      // without waiting for the expiry job.
      await tx.seatReservation.deleteMany({
        where: {
          eventId,
          status: 'HELD',
          expiresAt: { lte: now },
          OR: [{ seatId: { in: requested } }, { userId }],
        },
      });

      const mine = await tx.seatReservation.findMany({
        where: { eventId, userId, ...activeHold(now) },
        select: { seatId: true, expiresAt: true },
        orderBy: { expiresAt: 'asc' },
      });
      const alreadyHeld = new Set(mine.map((r) => r.seatId));
      const toHold = requested.filter((id) => !alreadyHeld.has(id));
      if (alreadyHeld.size + toHold.length > MAX_SEATS_PER_ORDER) {
        return { ok: false, code: 'too-many', message: HOLD_MESSAGES.tooMany };
      }

      // One timer per cart: new seats expire with the ones already held.
      const expiresAt = mine[0]?.expiresAt ?? new Date(now.getTime() + HOLD_DURATION_MS);
      await tx.seatReservation.createMany({
        data: toHold.map((seatId) => ({ eventId, seatId, userId, status: 'HELD', expiresAt })),
      });

      return { ok: true, seatIds: [...alreadyHeld, ...toHold], expiresAt };
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // Lost the race for at least one seat. Report which ones so the UI can grey them out.
    const taken = await prisma.seatReservation.findMany({
      where: {
        eventId,
        seatId: { in: requested },
        userId: { not: userId },
        OR: [{ status: 'SOLD' }, activeHold(now)],
      },
      select: { seatId: true },
    });
    return {
      ok: false,
      code: 'unavailable',
      message: HOLD_MESSAGES.unavailable,
      unavailable: taken.map((r) => r.seatId),
    };
  }
}

/** Release a fan's holds for an event: the given seats, or all of them. Returns what was freed. */
export async function releaseSeats(
  prisma: PrismaClient,
  { eventId, userId, seatIds }: { eventId: string; userId: string; seatIds?: string[] },
): Promise<string[]> {
  return prisma.$transaction(async (tx) => {
    const where = {
      eventId,
      userId,
      status: 'HELD' as const,
      ...(seatIds && { seatId: { in: seatIds } }),
    };
    const rows = await tx.seatReservation.findMany({ where, select: { id: true, seatId: true } });
    await tx.seatReservation.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
    return rows.map((r) => r.seatId);
  });
}

/**
 * Delete holds that have lapsed, optionally only one fan's cart for one event (the
 * delayed BullMQ job) or everything (the periodic sweep). Returns the freed seats per event.
 */
export async function releaseExpiredHolds(
  prisma: PrismaClient,
  {
    now = new Date(),
    eventId,
    userId,
    batchSize = 1000,
  }: { now?: Date; eventId?: string; userId?: string; batchSize?: number } = {},
): Promise<ReleasedSeats[]> {
  const where = {
    status: 'HELD' as const,
    expiresAt: { lte: now },
    ...(eventId && { eventId }),
    ...(userId && { userId }),
  };
  const rows = await prisma.seatReservation.findMany({
    where,
    select: { id: true, eventId: true, seatId: true },
    take: batchSize,
  });
  if (rows.length === 0) return [];
  // Re-check expiry in the delete so a row that changed in between is left alone.
  await prisma.seatReservation.deleteMany({
    where: { ...where, id: { in: rows.map((r) => r.id) } },
  });

  const byEvent = new Map<string, string[]>();
  for (const row of rows)
    byEvent.set(row.eventId, [...(byEvent.get(row.eventId) ?? []), row.seatId]);
  return [...byEvent].map(([id, seats]) => ({ eventId: id, seatIds: seats }));
}

/** Which seats of an event are taken, and which ones this user is holding. */
export async function getSeatAvailability(
  prisma: PrismaClient,
  eventId: string,
  { userId, now = new Date() }: { userId?: string; now?: Date } = {},
): Promise<SeatAvailability> {
  const rows = await prisma.seatReservation.findMany({
    where: { eventId, OR: [{ status: 'SOLD' }, activeHold(now)] },
    select: { seatId: true, userId: true, status: true, expiresAt: true },
  });

  const availability: SeatAvailability = { unavailable: [], held: [], heldUntil: null };
  for (const row of rows) {
    if (row.status === 'HELD' && userId && row.userId === userId) {
      availability.held.push(row.seatId);
      if (!availability.heldUntil || row.expiresAt! < availability.heldUntil) {
        availability.heldUntil = row.expiresAt;
      }
    } else {
      availability.unavailable.push(row.seatId);
    }
  }
  return availability;
}
