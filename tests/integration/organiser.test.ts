import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnectPrisma, getPrisma } from '@/lib/db';
import type { EventFormData } from '@/lib/event-form';
import { listUpcomingEvents } from '@/lib/events';
import { holdSeats } from '@/lib/holds';
import {
  createEvent,
  listOrganiserEvents,
  listVenues,
  publishEvent,
  PUBLISH_MESSAGES,
} from '@/lib/organiser';
import { getSeatMap, applyVenueLayout } from '@/lib/seating';
import { resetDatabase } from './helpers';

const prisma = getPrisma();
const DAY = 86_400_000;
afterAll(disconnectPrisma);

/** Two venues: Hall (Floor 2×3, Balcony 1×3) and Annex (Stalls 1×2). */
async function setup() {
  const hall = await prisma.venue.create({ data: { name: 'Hall', city: 'SG', capacity: 0 } });
  await applyVenueLayout(prisma, hall.id, [
    { code: 'FLR', name: 'Floor', rows: 2, seatsPerRow: 3 },
    { code: 'BAL', name: 'Balcony', rows: 1, seatsPerRow: 3 },
  ]);
  const annex = await prisma.venue.create({ data: { name: 'Annex', city: 'SG', capacity: 0 } });
  await applyVenueLayout(prisma, annex.id, [
    { code: 'STL', name: 'Stalls', rows: 1, seatsPerRow: 2 },
  ]);
  const section = async (code: string) =>
    (await prisma.section.findFirstOrThrow({ where: { code } })).id;
  return {
    hall: hall.id,
    annex: annex.id,
    floor: await section('FLR'),
    balcony: await section('BAL'),
    stalls: await section('STL'),
  };
}

function form(venueId: string, overrides: Partial<EventFormData> = {}): EventFormData {
  return {
    title: 'Harbour Lights',
    description: null,
    venueId,
    startsAt: new Date(Date.now() + 7 * DAY),
    waitingRoom: false,
    prices: [],
    ...overrides,
  };
}

describe('listVenues', () => {
  beforeEach(resetDatabase);

  it('lists venues by name with their sections in venue order and seat counts', async () => {
    const ids = await setup();
    expect(await listVenues(prisma)).toEqual([
      {
        id: ids.annex,
        name: 'Annex',
        city: 'SG',
        sections: [{ id: ids.stalls, code: 'STL', name: 'Stalls', seats: 2 }],
      },
      {
        id: ids.hall,
        name: 'Hall',
        city: 'SG',
        sections: [
          { id: ids.floor, code: 'FLR', name: 'Floor', seats: 6 },
          { id: ids.balcony, code: 'BAL', name: 'Balcony', seats: 3 },
        ],
      },
    ]);
  });
});

describe('createEvent (SCRUM-28)', () => {
  beforeEach(resetDatabase);

  it('creates a DRAFT with its price tiers, naming blank tiers after the section', async () => {
    const ids = await setup();
    const result = await createEvent(
      prisma,
      form(ids.hall, {
        description: 'Bring a jacket.',
        waitingRoom: true,
        prices: [
          { sectionId: ids.floor, tierName: 'Category 1', priceCents: 12000 },
          { sectionId: ids.balcony, tierName: null, priceCents: 0 },
        ],
      }),
    );

    expect(result).toEqual({ ok: true, event: { id: expect.any(String), slug: 'harbour-lights' } });
    const event = await prisma.event.findUniqueOrThrow({
      where: { slug: 'harbour-lights' },
      include: { priceTiers: { orderBy: { priceCents: 'desc' } } },
    });
    expect(event).toMatchObject({
      status: 'DRAFT',
      description: 'Bring a jacket.',
      waitingRoom: true,
      venueId: ids.hall,
    });
    expect(event.priceTiers.map((t) => [t.sectionId, t.name, t.priceCents])).toEqual([
      [ids.floor, 'Category 1', 12000],
      [ids.balcony, 'Balcony', 0],
    ]);
  });

  it('a draft is not listed for fans', async () => {
    const ids = await setup();
    const price = [{ sectionId: ids.floor, tierName: null, priceCents: 5000 }];
    await createEvent(prisma, form(ids.hall, { prices: price }));
    expect(await listUpcomingEvents(prisma)).toEqual([]);
  });

  it('gives events with the same title distinct slugs', async () => {
    const ids = await setup();
    const price = [{ sectionId: ids.floor, tierName: null, priceCents: 5000 }];
    const slugs = [];
    for (let i = 0; i < 3; i++) {
      const result = await createEvent(prisma, form(ids.hall, { prices: price }));
      slugs.push(result.ok && result.event.slug);
    }
    expect(slugs).toEqual(['harbour-lights', 'harbour-lights-2', 'harbour-lights-3']);
  });

  it('two organisers creating the same title at once both succeed, with distinct slugs', async () => {
    const ids = await setup();
    const price = [{ sectionId: ids.floor, tierName: null, priceCents: 5000 }];
    const results = await Promise.all(
      [1, 2, 3].map(() => createEvent(prisma, form(ids.hall, { prices: price }))),
    );
    const slugs = results.map((r) => r.ok && r.event.slug);
    expect(new Set(slugs).size).toBe(3);
  });

  it('rejects an unknown venue', async () => {
    await setup();
    expect(await createEvent(prisma, form('novenue'))).toEqual({
      ok: false,
      fieldErrors: { venueId: 'Choose a venue' },
    });
  });

  it("rejects prices for another venue's sections, and writes nothing", async () => {
    const ids = await setup();
    const result = await createEvent(
      prisma,
      form(ids.hall, { prices: [{ sectionId: ids.stalls, tierName: null, priceCents: 100 }] }),
    );
    expect(result).toEqual({
      ok: false,
      fieldErrors: { prices: 'Prices must be for sections of this venue' },
    });
    expect(await prisma.event.count()).toBe(0);
  });
});

describe('publishEvent (SCRUM-28)', () => {
  beforeEach(resetDatabase);

  async function draft(overrides: Partial<EventFormData> = {}) {
    const ids = await setup();
    const result = await createEvent(
      prisma,
      form(ids.hall, {
        prices: [{ sectionId: ids.floor, tierName: 'Cat 1', priceCents: 5000 }],
        ...overrides,
      }),
    );
    if (!result.ok) throw new Error('setup failed');
    return result.event;
  }

  it('puts a draft on sale: listed for fans, and seats can be held', async () => {
    const event = await draft();
    expect(await publishEvent(prisma, event.id)).toEqual({ ok: true, slug: event.slug });

    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).status).toBe(
      'ON_SALE',
    );
    expect((await listUpcomingEvents(prisma)).map((e) => e.slug)).toEqual([event.slug]);

    await prisma.user.create({ data: { id: 'ada', name: 'Ada', email: 'ada@example.com' } });
    const map = await getSeatMap(prisma, event.slug);
    const seatId = map!.sections[0].rows[0].seats[0].id;
    const hold = await holdSeats(prisma, { eventId: event.id, userId: 'ada', seatIds: [seatId] });
    expect(hold.ok).toBe(true);
  });

  it('refuses to publish twice', async () => {
    const event = await draft();
    await publishEvent(prisma, event.id);
    expect(await publishEvent(prisma, event.id)).toEqual({ ok: false, code: 'not-draft' });
  });

  it('two simultaneous publishes put it on sale once', async () => {
    const event = await draft();
    const results = await Promise.all([
      publishEvent(prisma, event.id),
      publishEvent(prisma, event.id),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, code: 'not-draft' });
  });

  it.each([
    ['exactly now', 0, false],
    ['one minute from now', 60_000, true],
  ])('an event starting %s publishable=%s (boundary)', async (_label, offset, ok) => {
    const now = new Date(Date.now() + 7 * DAY);
    const event = await draft({ startsAt: new Date(now.getTime() + offset) });
    const result = await publishEvent(prisma, event.id, now);
    expect(result.ok).toBe(ok);
    if (!ok) expect(result).toEqual({ ok: false, code: 'in-past' });
  });

  it('refuses an event with no prices (e.g. a draft made outside the form)', async () => {
    const ids = await setup();
    const event = await prisma.event.create({
      data: {
        slug: 'bare',
        title: 'Bare',
        startsAt: new Date(Date.now() + DAY),
        venueId: ids.hall,
      },
    });
    expect(await publishEvent(prisma, event.id)).toEqual({ ok: false, code: 'no-prices' });
  });

  it('reports an unknown event', async () => {
    expect(await publishEvent(prisma, 'missing')).toEqual({ ok: false, code: 'not-found' });
  });

  it('has a message for every failure', () => {
    expect(Object.keys(PUBLISH_MESSAGES).sort()).toEqual([
      'in-past',
      'no-prices',
      'not-draft',
      'not-found',
    ]);
  });
});

describe('listOrganiserEvents', () => {
  beforeEach(resetDatabase);

  it('lists every event in every status, soonest first, with tiers and tickets sold', async () => {
    const ids = await setup();
    const at = (days: number) => new Date(Date.now() + days * DAY);
    await prisma.event.create({
      data: { slug: 'later', title: 'Later', startsAt: at(9), venueId: ids.hall },
    });
    const soon = await prisma.event.create({
      data: {
        slug: 'soon',
        title: 'Soon',
        startsAt: at(2),
        venueId: ids.hall,
        status: 'ON_SALE',
        waitingRoom: true,
        priceTiers: { create: { sectionId: ids.floor, name: 'Cat 1', priceCents: 100 } },
      },
    });
    await prisma.user.create({ data: { id: 'ada', name: 'Ada', email: 'ada@example.com' } });
    const seat = await prisma.seat.findFirstOrThrow({ where: { sectionId: ids.floor } });
    await prisma.order.create({
      data: {
        userId: 'ada',
        eventId: soon.id,
        totalCents: 100,
        currency: 'SGD',
        paymentRef: 'pay_test',
        tickets: {
          create: { eventId: soon.id, seatId: seat.id, tierName: 'Cat 1', priceCents: 100 },
        },
      },
    });

    expect(await listOrganiserEvents(prisma)).toEqual([
      {
        id: soon.id,
        slug: 'soon',
        title: 'Soon',
        startsAt: expect.any(Date),
        status: 'ON_SALE',
        waitingRoom: true,
        venueName: 'Hall',
        priceTiers: 1,
        ticketsSold: 1,
      },
      expect.objectContaining({ slug: 'later', status: 'DRAFT', priceTiers: 0, ticketsSold: 0 }),
    ]);
  });
});
