import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const refresh = vi.fn();
const updateTag = vi.fn();
vi.mock('next/cache', () => ({ refresh, updateTag }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock('@/lib/db', () => ({ getPrisma: () => ({}) }));
vi.mock('@/lib/redis', () => ({ getRedis: () => ({}) }));
const getCurrentUser = vi.fn();
vi.mock('@/server/session', () => ({ getCurrentUser }));
const orders = { checkout: vi.fn(), getCart: vi.fn() };
vi.mock('@/lib/orders', () => orders);
const createPaymentIntent = vi.fn();
vi.mock('@/lib/payments', () => ({ createPaymentIntent }));
const scheduleOrderConfirmation = vi.fn();
vi.mock('@/server/jobs/order-email', () => ({ scheduleOrderConfirmation }));
vi.mock('@/server/queues', () => ({
  QUEUE_NAMES: { email: 'e', holds: 'h' },
  getQueue: () => ({}),
}));
const getShopAccessById = vi.fn();
vi.mock('@/lib/event-access', () => ({ getShopAccessById }));
const holdLib = { holdSeats: vi.fn(), releaseSeats: vi.fn() };
vi.mock('@/lib/holds', async (orig) => ({ ...(await orig<object>()), ...holdLib }));
const broadcastSeats = vi.fn();
vi.mock('@/server/broadcast', () => ({ broadcastSeats, getEmitter: () => ({}) }));
const scheduleHoldExpiry = vi.fn();
vi.mock('@/server/jobs/release-holds', () => ({ scheduleHoldExpiry }));
const requireOrganiser = vi.fn();
vi.mock('@/server/organiser', () => ({ requireOrganiser }));
const org = { createEvent: vi.fn(), publishEvent: vi.fn() };
vi.mock('@/lib/organiser', async (orig) => ({ ...(await orig<object>()), ...org }));

const { createPaymentIntentAction, checkoutAction } = await import('@/app/actions/checkout');
const { holdSeatsAction, releaseSeatsAction } = await import('@/app/actions/holds');
const { createEventAction, publishEventAction } = await import('@/app/actions/organiser');

const ID = 'a'.repeat(25);
const form = (o: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) f.append(k, x);
  return f;
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('checkout actions', () => {
  it('payment intent: login, id and cart checks', async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(createPaymentIntentAction(ID)).rejects.toThrow('redirect:/login');
    getCurrentUser.mockResolvedValue({ id: 'u1' });
    expect((await createPaymentIntentAction('bad id')).message).toMatch(/does not exist/);
    orders.getCart.mockResolvedValue(null);
    expect((await createPaymentIntentAction(ID)).message).toMatch(/no seats/);
  });
  it('payment intent: charges the database total, and survives Stripe failing', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1' });
    orders.getCart.mockResolvedValue({ totalCents: 5000, currency: 'sgd' });
    createPaymentIntent.mockResolvedValueOnce({ clientSecret: 'sec' });
    expect(await createPaymentIntentAction(ID)).toEqual({ clientSecret: 'sec' });
    expect(createPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 5000 }),
    );
    createPaymentIntent.mockRejectedValueOnce(new Error('stripe'));
    expect((await createPaymentIntentAction(ID)).message).toMatch(/unavailable/);
  });
  it('checkout: guards, failure refresh, success redirect, email failure ignored', async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(checkoutAction(ID, 'pi')).rejects.toThrow('redirect:/login');
    getCurrentUser.mockResolvedValue({ id: 'u1' });
    expect((await checkoutAction('bad id', 'pi')).message).toMatch(/does not exist/);
    orders.checkout.mockResolvedValueOnce({ ok: false, message: 'nope' });
    expect(await checkoutAction(ID, 'pi')).toEqual({ message: 'nope' });
    expect(refresh).toHaveBeenCalled();
    orders.checkout.mockResolvedValue({ ok: true, orderId: 'o1' });
    await expect(checkoutAction(ID, 'pi')).rejects.toThrow('redirect:/tickets?order=o1');
    scheduleOrderConfirmation.mockRejectedValue(new Error('redis'));
    await expect(checkoutAction(ID, 'pi')).rejects.toThrow('redirect:/tickets?order=o1');
  });
});

describe('hold actions', () => {
  it('hold: requires login, valid input and queue access', async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await holdSeatsAction({ ok: false }, form({}))).message).toMatch(/Log in/);
    getCurrentUser.mockResolvedValue({ id: 'u1' });
    expect((await holdSeatsAction({ ok: false }, form({ eventId: ID }))).ok).toBe(false);
    getShopAccessById.mockResolvedValue({ allowed: false });
    const r = await holdSeatsAction({ ok: false }, form({ eventId: ID, seatId: [ID] }));
    expect(r.message).toMatch(/waiting room/);
    expect(refresh).toHaveBeenCalled();
  });
  it('hold: lib failure, success (pluralised), broadcast and scheduling errors tolerated', async () => {
    getCurrentUser.mockResolvedValue({ id: 'u1' });
    getShopAccessById.mockResolvedValue({ allowed: true });
    const args = form({ eventId: ID, seatId: [ID, 'b'.repeat(25)] });
    holdLib.holdSeats.mockResolvedValueOnce({ ok: false, message: 'taken' });
    expect(await holdSeatsAction({ ok: false }, args)).toEqual({ ok: false, message: 'taken' });
    holdLib.holdSeats.mockResolvedValue({ ok: true, seatIds: ['x', 'y'], expiresAt: new Date() });
    expect((await holdSeatsAction({ ok: false }, args)).message).toBe('2 seats held for you.');
    holdLib.holdSeats.mockResolvedValue({ ok: true, seatIds: ['x'], expiresAt: new Date() });
    broadcastSeats.mockImplementation(() => {
      throw new Error('x');
    });
    scheduleHoldExpiry.mockRejectedValue(new Error('redis'));
    expect((await holdSeatsAction({ ok: false }, args)).message).toBe('1 seat held for you.');
  });
  it('release: guards and messages', async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await releaseSeatsAction({ ok: false }, form({}))).message).toMatch(/Log in/);
    getCurrentUser.mockResolvedValue({ id: 'u1' });
    expect((await releaseSeatsAction({ ok: false }, form({ eventId: 'bad id' }))).ok).toBe(false);
    holdLib.releaseSeats.mockResolvedValueOnce(['s1']);
    expect((await releaseSeatsAction({ ok: false }, form({ eventId: ID }))).message).toMatch(
      /released/,
    );
    holdLib.releaseSeats.mockResolvedValueOnce([]);
    expect(
      (await releaseSeatsAction({ ok: false }, form({ eventId: ID }))).message,
    ).toBeUndefined();
  });
});

describe('organiser actions', () => {
  const valid = () =>
    form({
      title: 'Big Gig',
      description: 'A really great night out for everyone',
      venueId: ID,
      startsAt: new Date(Date.now() + 864e5 * 30).toISOString().slice(0, 16),
      waitingRoom: 'on',
      [`price.${ID}`]: '50',
      [`tier.${ID}`]: 'GENERAL',
    });

  it('create: returns field errors and keeps typed values', async () => {
    const r = await createEventAction(
      {},
      form({ title: '', [`price.${ID}`]: '1', [`tier.${ID}`]: 'X' }),
    );
    expect(requireOrganiser).toHaveBeenCalled();
    expect(r.fieldErrors).toBeDefined();
    expect(r.values?.[`price.${ID}`]).toBe('1');
  });
  it('create: surfaces lib errors and redirects on success', async () => {
    org.createEvent.mockResolvedValueOnce({ ok: false, fieldErrors: { venueId: 'no' } });
    await createEventAction({}, valid());
    org.createEvent.mockResolvedValue({ ok: true, event: { slug: 'big-gig' } });
    const out = await createEventAction({}, valid()).catch((e: Error) => e.message);
    expect(out).toBe('redirect:/organiser?created=big-gig');
  });
  it('publish: validates id, maps failures, refreshes cache and redirects', async () => {
    expect((await publishEventAction({}, form({}))).message).toMatch(/no longer exists/);
    org.publishEvent.mockResolvedValueOnce({ ok: false, code: 'no-prices' });
    expect((await publishEventAction({}, form({ eventId: ID }))).message).toMatch(/Price at least/);
    org.publishEvent.mockResolvedValue({ ok: true, slug: 'big-gig' });
    await expect(publishEventAction({}, form({ eventId: ID }))).rejects.toThrow(
      'redirect:/organiser?published=big-gig',
    );
    expect(updateTag).toHaveBeenCalled();
  });
});
