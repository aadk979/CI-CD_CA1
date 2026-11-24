import Stripe from 'stripe';

/**
 * Card payments through Stripe (test mode in dev and CI; live keys in production).
 *
 * The card number never touches our server: Stripe's Payment Element collects it in an
 * iframe and confirms a PaymentIntent that we created for the cart's server-side total.
 * After that, checkout() calls verifyPayment() to confirm with Stripe that the intent
 * really succeeded, for this user, this event and this amount, before selling any seats.
 *
 * Stripe test cards: 4242 4242 4242 4242 (approved), 4000 0000 0000 0002 (declined),
 * 4000 0025 0000 3155 (needs 3-D Secure). Any future expiry, any CVC.
 */

export type PaymentFailureCode = 'payment-failed' | 'payment-mismatch';

export type VerifyResult =
  { ok: true; paymentRef: string } | { ok: false; code: PaymentFailureCode };

export interface PaymentExpectation {
  amountCents: number;
  currency: string;
  userId: string;
  eventId: string;
}

export interface VerifyRequest extends PaymentExpectation {
  paymentIntentId: string;
}

let stripeClient: Stripe | undefined;

/** Lazy, so `next build` and tests that never charge don't need a Stripe key. */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  stripeClient ??= new Stripe(key);
  return stripeClient;
}

/** Start a payment for a cart. The browser confirms it with the returned client secret. */
export async function createPaymentIntent(
  { amountCents, currency, userId, eventId }: PaymentExpectation,
  stripe: Stripe = getStripe(),
): Promise<{ id: string; clientSecret: string }> {
  const intent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: currency.toLowerCase(),
    allowed_payment_method_types: ['card'],
    metadata: { userId, eventId },
  });
  if (!intent.client_secret) throw new Error('Stripe returned no client secret');
  return { id: intent.id, clientSecret: intent.client_secret };
}

/**
 * Ask Stripe whether a PaymentIntent was paid, and that it belongs to this purchase.
 * Resolves (never throws) for payment problems, so a bad or foreign intent id from the
 * browser is just a failed payment.
 */
export async function verifyPayment(
  { paymentIntentId, amountCents, currency, userId, eventId }: VerifyRequest,
  stripe: Stripe = getStripe(),
): Promise<VerifyResult> {
  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch {
    return { ok: false, code: 'payment-failed' };
  }
  // Someone else's payment (or one for another event): never ours to use or refund.
  if (intent.metadata.userId !== userId || intent.metadata.eventId !== eventId) {
    return { ok: false, code: 'payment-failed' };
  }
  if (intent.status !== 'succeeded') return { ok: false, code: 'payment-failed' };
  // Paid, but for a different cart (e.g. seats changed after the intent was created).
  if (intent.amount !== amountCents || intent.currency !== currency.toLowerCase()) {
    return { ok: false, code: 'payment-mismatch' };
  }
  return { ok: true, paymentRef: intent.id };
}

/** Give a payment back, e.g. when the seats lapsed while the card was being charged. */
export async function refundPayment(
  paymentRef: string,
  stripe: Stripe = getStripe(),
): Promise<void> {
  await stripe.refunds.create({ payment_intent: paymentRef });
}

/**
 * Refund a payment that can't be turned into an order (the holds lapsed, or the event went
 * off sale, before checkout could see it), but only if it succeeded and is this user's.
 */
export async function refundOwnedPayment(
  paymentIntentId: string,
  userId: string,
  stripe: Stripe = getStripe(),
): Promise<void> {
  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch {
    return;
  }
  if (intent.metadata.userId !== userId || intent.status !== 'succeeded') return;
  await refundPayment(intent.id, stripe);
}
