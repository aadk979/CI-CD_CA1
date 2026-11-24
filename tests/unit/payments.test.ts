import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import {
  createPaymentIntent,
  refundOwnedPayment,
  refundPayment,
  verifyPayment,
} from '@/lib/payments';

const EXPECTED = { amountCents: 13600, currency: 'SGD', userId: 'ada', eventId: 'evt' };

function fakeStripe(intent?: Partial<Stripe.PaymentIntent> | Error) {
  const retrieve = vi.fn(async () => {
    if (intent instanceof Error) throw intent;
    return {
      id: 'pi_1',
      status: 'succeeded',
      amount: 13600,
      currency: 'sgd',
      metadata: { userId: 'ada', eventId: 'evt' },
      ...intent,
    };
  });
  const create = vi.fn(async () => ({ id: 'pi_new', client_secret: 'pi_new_secret' }));
  const refund = vi.fn(async () => ({}));
  const stripe = {
    paymentIntents: { retrieve, create },
    refunds: { create: refund },
  } as unknown as Stripe;
  return { stripe, retrieve, create, refund };
}

describe('createPaymentIntent', () => {
  it('creates an intent for the amount, tagged with user and event', async () => {
    const { stripe, create } = fakeStripe();

    const result = await createPaymentIntent(EXPECTED, stripe);

    expect(result).toEqual({ id: 'pi_new', clientSecret: 'pi_new_secret' });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 13600,
        currency: 'sgd',
        metadata: { userId: 'ada', eventId: 'evt' },
      }),
    );
  });
});

describe('verifyPayment', () => {
  const request = { paymentIntentId: 'pi_1', ...EXPECTED };

  it('accepts a succeeded intent for this user, event and amount', async () => {
    const { stripe } = fakeStripe();
    expect(await verifyPayment(request, stripe)).toEqual({ ok: true, paymentRef: 'pi_1' });
  });

  it.each([
    ['not yet paid', { status: 'requires_payment_method' as const }],
    ['another fan', { metadata: { userId: 'bo', eventId: 'evt' } }],
    ['another event', { metadata: { userId: 'ada', eventId: 'other' } }],
  ])('rejects an intent that is %s', async (_label, intent) => {
    const { stripe } = fakeStripe(intent);
    expect(await verifyPayment(request, stripe)).toEqual({ ok: false, code: 'payment-failed' });
  });

  it.each([
    ['amount', { amount: 100 }],
    ['currency', { currency: 'usd' }],
  ])('flags a paid intent with the wrong %s as a mismatch', async (_label, intent) => {
    const { stripe } = fakeStripe(intent);
    expect(await verifyPayment(request, stripe)).toEqual({ ok: false, code: 'payment-mismatch' });
  });

  it('treats an unknown intent id as a failed payment', async () => {
    const { stripe } = fakeStripe(new Error('No such payment_intent'));
    expect(await verifyPayment(request, stripe)).toEqual({ ok: false, code: 'payment-failed' });
  });
});

describe('refunds', () => {
  it('refundPayment refunds the intent in full', async () => {
    const { stripe, refund } = fakeStripe();
    await refundPayment('pi_1', stripe);
    expect(refund).toHaveBeenCalledWith({ payment_intent: 'pi_1' });
  });

  it('refundOwnedPayment refunds only a succeeded intent that is the users own', async () => {
    const mine = fakeStripe();
    await refundOwnedPayment('pi_1', 'ada', mine.stripe);
    expect(mine.refund).toHaveBeenCalledTimes(1);

    const theirs = fakeStripe();
    await refundOwnedPayment('pi_1', 'bo', theirs.stripe);
    const unpaid = fakeStripe({ status: 'requires_payment_method' });
    await refundOwnedPayment('pi_1', 'ada', unpaid.stripe);
    const missing = fakeStripe(new Error('missing'));
    await refundOwnedPayment('pi_x', 'ada', missing.stripe);
    for (const f of [theirs, unpaid, missing]) expect(f.refund).not.toHaveBeenCalled();
  });
});
