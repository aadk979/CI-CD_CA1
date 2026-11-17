import { describe, expect, it } from 'vitest';
import { isOrganiser } from '@/lib/account';
import {
  DESCRIPTION_MAX,
  MAX_PRICE_CENTS,
  MAX_PRICED_SECTIONS,
  parseEventStart,
  parsePriceCents,
  readEventForm,
  slugify,
  TIER_NAME_MAX,
  TITLE_MAX,
  toDateTimeLocal,
  validateEventForm,
  type EventFormInput,
} from '@/lib/event-form';

const NOW = new Date('2026-11-17T04:00:00Z'); // 12:00 in Singapore

const valid: EventFormInput = {
  title: 'Harbour Lights',
  description: '',
  venueId: 'venue1',
  startsAt: '2026-12-01T19:30',
  waitingRoom: false,
  sections: { sec1: { price: '68.50', tier: 'Category 1' }, sec2: { price: '', tier: '' } },
};

const errorsFor = (input: Partial<EventFormInput>) => {
  const result = validateEventForm({ ...valid, ...input }, NOW);
  return result.ok ? {} : result.fieldErrors;
};

describe('isOrganiser', () => {
  it.each([
    [{ role: 'ORGANISER' as const }, true],
    [{ role: 'FAN' as const }, false],
    [null, false],
    [undefined, false],
  ])('%o → %s', (user, expected) => {
    expect(isOrganiser(user)).toBe(expected);
  });
});

describe('parsePriceCents (equivalence partitioning + boundary values)', () => {
  it.each([
    ['0', 0], // free: lower boundary
    ['0.01', 1],
    ['68', 6800],
    ['68.5', 6850],
    [' 68.50 ', 6850],
    ['10000', MAX_PRICE_CENTS], // upper boundary
    ['10000.00', MAX_PRICE_CENTS],
  ])('accepts %j as %i cents', (input, cents) => {
    expect(parsePriceCents(input)).toBe(cents);
  });

  it.each([
    ['10000.01', 'one cent over the maximum'],
    ['-1', 'negative'],
    ['68.505', 'three decimal places'],
    ['68.', 'trailing point'],
    ['.5', 'no whole dollars'],
    ['1e3', 'exponent'],
    ['$68', 'currency symbol'],
    ['abc', 'not a number'],
    ['', 'empty'],
  ])('rejects %j (%s)', (input) => {
    expect(parsePriceCents(input)).toBeNull();
  });
});

describe('parseEventStart', () => {
  it('reads the value as Singapore time (UTC+8)', () => {
    expect(parseEventStart('2026-12-01T19:30')?.toISOString()).toBe('2026-12-01T11:30:00.000Z');
  });

  it.each([
    ['2026-02-30T10:00', 'a day that does not exist'],
    ['2026-12-01T24:00', 'hour 24'],
    ['2026-12-01', 'no time'],
    ['2026-12-01T19:30:00', 'seconds'],
    ['2026-12-01T19:30Z', 'a time zone'],
    ['', 'empty'],
  ])('rejects %j (%s)', (input) => {
    expect(parseEventStart(input)).toBeNull();
  });

  it('round-trips with toDateTimeLocal', () => {
    expect(toDateTimeLocal(new Date('2026-12-31T16:05:00Z'))).toBe('2027-01-01T00:05');
  });
});

describe('slugify', () => {
  it.each([
    ['Neon Skyline: Encore!', 'neon-skyline-encore'],
    ['  Café  Señor  ', 'cafe-senor'],
    ['Jazz -- by the -- Bay', 'jazz-by-the-bay'],
    ['!!!', 'event'], // nothing usable left
    ['演唱会', 'event'],
  ])('%j → %j', (title, slug) => {
    expect(slugify(title)).toBe(slug);
  });

  it('is at most 80 characters and never ends with a hyphen', () => {
    const slug = slugify(`${'a'.repeat(79)} b`);
    expect(slug).toBe('a'.repeat(79));
    expect(slugify('x'.repeat(200))).toHaveLength(80);
  });
});

describe('readEventForm', () => {
  it('collects section prices and drops malformed or unknown fields', () => {
    const form = new FormData();
    form.set('title', 'Harbour Lights');
    form.set('venueId', 'venue1');
    form.set('startsAt', '2026-12-01T19:30');
    form.set('waitingRoom', 'on');
    form.set('price.sec1', '68');
    form.set('tier.sec1', 'Cat 1');
    form.set('price.sec2', '40'); // no tier field: blank
    form.set('price.bad id!', '1'); // not a valid id
    form.set('tier.sec3', 'orphan tier'); // no price field: ignored
    form.set('description', new Blob(['x'])); // a file where text belongs

    expect(readEventForm(form)).toEqual({
      title: 'Harbour Lights',
      description: '',
      venueId: 'venue1',
      startsAt: '2026-12-01T19:30',
      waitingRoom: true,
      sections: { sec1: { price: '68', tier: 'Cat 1' }, sec2: { price: '40', tier: '' } },
    });
  });

  it('treats a missing checkbox as no waiting room', () => {
    expect(readEventForm(new FormData()).waitingRoom).toBe(false);
  });
});

describe('validateEventForm (equivalence partitioning + boundary values)', () => {
  it('accepts a valid form, trimming text and skipping unpriced sections', () => {
    const result = validateEventForm(
      { ...valid, title: '  Harbour Lights ', description: '  Bring a jacket. ' },
      NOW,
    );
    expect(result).toEqual({
      ok: true,
      data: {
        title: 'Harbour Lights',
        description: 'Bring a jacket.',
        venueId: 'venue1',
        startsAt: new Date('2026-12-01T11:30:00Z'),
        waitingRoom: false,
        prices: [{ sectionId: 'sec1', tierName: 'Category 1', priceCents: 6850 }],
      },
    });
  });

  it('stores a blank description as null and a blank tier name as null', () => {
    const result = validateEventForm(
      { ...valid, sections: { sec1: { price: '10', tier: '   ' } } },
      NOW,
    );
    expect(result.ok && result.data).toMatchObject({
      description: null,
      prices: [{ sectionId: 'sec1', tierName: null, priceCents: 1000 }],
    });
  });

  it.each([
    ['', false],
    ['   ', false],
    ['x', true],
    ['x'.repeat(TITLE_MAX), true],
    ['x'.repeat(TITLE_MAX + 1), false],
  ])('title %j valid=%s', (title, ok) => {
    expect('title' in errorsFor({ title })).toBe(!ok);
  });

  it.each([
    [DESCRIPTION_MAX, true],
    [DESCRIPTION_MAX + 1, false],
  ])('description of %i characters valid=%s', (length, ok) => {
    expect('description' in errorsFor({ description: 'x'.repeat(length) })).toBe(!ok);
  });

  it.each([
    ['2026-11-17T12:00', false, 'exactly now'],
    ['2026-11-17T12:01', true, 'one minute from now'],
    ['2026-11-17T11:59', false, 'one minute ago'],
    ['not a date', false, 'malformed'],
  ])('start %j valid=%s (%s)', (startsAt, ok) => {
    expect('startsAt' in errorsFor({ startsAt })).toBe(!ok);
  });

  it.each([
    ['', 'missing'],
    ['bad id!', 'malformed'],
  ])('rejects a %s venue', (venueId) => {
    expect(errorsFor({ venueId })).toEqual({ venueId: 'Choose a venue' });
  });

  it('needs at least one priced section', () => {
    expect(errorsFor({ sections: { sec1: { price: '', tier: 'Cat 1' } } })).toEqual({
      prices: 'Price at least one section',
    });
    expect(errorsFor({ sections: {} })).toEqual({ prices: 'Price at least one section' });
  });

  it('puts a bad price or tier name next to its own section', () => {
    expect(
      errorsFor({
        sections: {
          sec1: { price: 'free', tier: '' },
          sec2: { price: '10', tier: 'x'.repeat(TIER_NAME_MAX + 1) },
          sec3: { price: '10', tier: 'x'.repeat(TIER_NAME_MAX) },
        },
      }),
    ).toEqual({
      'price.sec1': 'Enter a price from 0 to 10000, e.g. 68.50',
      'tier.sec2': `Tier name must be ${TIER_NAME_MAX} characters or fewer`,
    });
  });

  it.each([
    [MAX_PRICED_SECTIONS, true],
    [MAX_PRICED_SECTIONS + 1, false],
  ])('%i section fields valid=%s (tampered forms are cut off)', (count, ok) => {
    const sections = Object.fromEntries(
      Array.from({ length: count }, (_, i) => [`s${i}`, { price: '10', tier: '' }]),
    );
    expect('prices' in errorsFor({ sections })).toBe(!ok);
  });

  it('reports every invalid field at once', () => {
    expect(
      Object.keys(errorsFor({ title: '', venueId: '', startsAt: '', sections: {} })).sort(),
    ).toEqual(['prices', 'startsAt', 'title', 'venueId']);
  });
});
