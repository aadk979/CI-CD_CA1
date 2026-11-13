import type { PrismaClient } from '@/generated/prisma/client';

/** A rectangular block of seats: `rows` rows of `seatsPerRow` seats each. */
export interface SectionLayout {
  code: string;
  name: string;
  rows: number;
  seatsPerRow: number;
}

export interface SeatPosition {
  row: string;
  number: number;
}

export interface SeatMapSeat {
  id: string;
  number: number;
}

export interface SeatMapRow {
  label: string;
  seats: SeatMapSeat[];
}

export interface SeatMapSection {
  id: string;
  code: string;
  name: string;
  /** null when the section isn't priced (not on sale) for this event. */
  price: { tier: string; cents: number; currency: string } | null;
  rows: SeatMapRow[];
}

export interface SeatMap {
  event: { id: string; slug: string; title: string };
  venue: { id: string; name: string };
  totalSeats: number;
  sections: SeatMapSection[];
}

const MAX_ROWS = 26 + 26 ** 2 + 26 ** 3; // A..ZZZ — matches the DB CHECK constraint
const SECTION_CODE = /^[A-Z0-9]{1,8}$/;

/**
 * Spreadsheet-style row label for a zero-based index: 0 → A, 25 → Z, 26 → AA, 701 → ZZ, 702 → AAA.
 */
export function rowLabel(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= MAX_ROWS) {
    throw new RangeError(`Row index must be an integer in [0, ${MAX_ROWS}), got ${index}`);
  }
  let label = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    label = String.fromCharCode(65 + ((n - 1) % 26)) + label;
  }
  return label;
}

/** Orders row labels the way they appear in a venue: A..Z, then AA..ZZ (not lexicographic). */
export function compareRowLabels(a: string, b: string): number {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}

function assertLayout(layout: SectionLayout): void {
  if (!SECTION_CODE.test(layout.code)) {
    throw new RangeError(`Section code must be 1–8 uppercase letters/digits, got "${layout.code}"`);
  }
  if (!layout.name.trim()) throw new RangeError(`Section ${layout.code} needs a name`);
  for (const key of ['rows', 'seatsPerRow'] as const) {
    const value = layout[key];
    if (!Number.isInteger(value) || value < 1) {
      throw new RangeError(
        `Section ${layout.code}: ${key} must be a positive integer, got ${value}`,
      );
    }
  }
  if (layout.rows > MAX_ROWS) {
    throw new RangeError(`Section ${layout.code}: at most ${MAX_ROWS} rows supported`);
  }
}

/** Every seat position in a section, row by row (A1, A2, …, B1, …). */
export function buildSeats(layout: SectionLayout): SeatPosition[] {
  assertLayout(layout);
  const seats: SeatPosition[] = [];
  for (let r = 0; r < layout.rows; r++) {
    const row = rowLabel(r);
    for (let number = 1; number <= layout.seatsPerRow; number++) seats.push({ row, number });
  }
  return seats;
}

export function countSeats(layouts: SectionLayout[]): number {
  return layouts.reduce((sum, l) => sum + l.rows * l.seatsPerRow, 0);
}

/**
 * Create (or top up) a venue's sections and seats from a layout. Idempotent: existing
 * sections are matched by code and existing seats are skipped, so it is safe to re-run.
 * Also sets the venue's capacity to the total number of seats it now has.
 */
export async function applyVenueLayout(
  prisma: PrismaClient,
  venueId: string,
  layouts: SectionLayout[],
): Promise<{ sections: number; seats: number }> {
  layouts.forEach(assertLayout);
  const codes = layouts.map((l) => l.code);
  if (new Set(codes).size !== codes.length) {
    throw new RangeError(`Duplicate section codes in layout: ${codes.join(', ')}`);
  }

  return prisma.$transaction(async (tx) => {
    for (const [sortOrder, layout] of layouts.entries()) {
      const section = await tx.section.upsert({
        where: { venueId_code: { venueId, code: layout.code } },
        update: { name: layout.name, sortOrder },
        create: { venueId, code: layout.code, name: layout.name, sortOrder },
      });
      await tx.seat.createMany({
        data: buildSeats(layout).map((s) => ({ ...s, sectionId: section.id })),
        skipDuplicates: true,
      });
    }
    const [sections, seats] = await Promise.all([
      tx.section.count({ where: { venueId } }),
      tx.seat.count({ where: { section: { venueId } } }),
    ]);
    await tx.venue.update({ where: { id: venueId }, data: { capacity: seats } });
    return { sections, seats };
  });
}

/** The seat map for an event: its venue's sections, rows and seats, with this event's prices. */
export async function getSeatMap(prisma: PrismaClient, slug: string): Promise<SeatMap | null> {
  const event = await prisma.event.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      venue: {
        select: {
          id: true,
          name: true,
          sections: {
            orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
            select: {
              id: true,
              code: true,
              name: true,
              seats: { select: { id: true, row: true, number: true } },
            },
          },
        },
      },
      priceTiers: { select: { sectionId: true, name: true, priceCents: true, currency: true } },
    },
  });
  if (!event) return null;

  const prices = new Map(event.priceTiers.map((p) => [p.sectionId, p]));
  let totalSeats = 0;

  const sections = event.venue.sections.map((section): SeatMapSection => {
    const byRow = new Map<string, SeatMapSeat[]>();
    for (const seat of section.seats) {
      const row = byRow.get(seat.row) ?? [];
      row.push({ id: seat.id, number: seat.number });
      byRow.set(seat.row, row);
    }
    const rows = [...byRow.entries()]
      .sort(([a], [b]) => compareRowLabels(a, b))
      .map(([label, seats]) => ({ label, seats: seats.sort((a, b) => a.number - b.number) }));
    totalSeats += section.seats.length;

    const tier = prices.get(section.id);
    return {
      id: section.id,
      code: section.code,
      name: section.name,
      price: tier ? { tier: tier.name, cents: tier.priceCents, currency: tier.currency } : null,
      rows,
    };
  });

  return {
    event: { id: event.id, slug: event.slug, title: event.title },
    venue: { id: event.venue.id, name: event.venue.name },
    totalSeats,
    sections,
  };
}
