import { randomBytes } from 'node:crypto';

/**
 * Simulated card payments (SCRUM-39). No real provider and no money moves: the card
 * number only picks the outcome, and it is never stored or logged. Test cards follow
 * Stripe's conventions so the demo feels familiar:
 *   4242 4242 4242 4242  → approved
 *   4000 0000 0000 0002  → declined
 * Any other 16-digit number that passes the Luhn checksum is approved.
 */

export const TEST_CARDS = {
  approved: '4242424242424242',
  declined: '4000000000000002',
} as const;

export type ChargeResult =
  { ok: true; paymentRef: string } | { ok: false; code: 'declined' | 'invalid-card' };

export interface ChargeRequest {
  amountCents: number;
  currency: string;
  cardNumber: string;
}

/** Luhn (mod 10) checksum, which every real card number satisfies. */
export function passesLuhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * Normalise what a fan typed ("4242 4242 4242 4242", "4242-4242-…") to 16 digits,
 * or null if it can't be a card number.
 */
export function parseCardNumber(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const digits = input.replace(/[\s-]/g, '');
  if (!/^\d{16}$/.test(digits)) return null;
  return passesLuhn(digits) ? digits : null;
}

/** Charge a card. Resolves (never throws) with the outcome, like a provider's API. */
export async function chargeCard({
  amountCents,
  cardNumber,
}: ChargeRequest): Promise<ChargeResult> {
  const card = parseCardNumber(cardNumber);
  if (!card || !Number.isInteger(amountCents) || amountCents < 0) {
    return { ok: false, code: 'invalid-card' };
  }
  if (card === TEST_CARDS.declined) return { ok: false, code: 'declined' };
  return { ok: true, paymentRef: `pay_${randomBytes(12).toString('hex')}` };
}

/** Give a payment back, e.g. when the seats lapsed while the card was being charged. */
export async function refundPayment(paymentRef: string): Promise<void> {
  // Simulated: a real provider call goes here. Logged so the demo shows it happening.
  console.info(`Refunded simulated payment ${paymentRef}`);
}
