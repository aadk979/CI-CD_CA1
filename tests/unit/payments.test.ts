import { describe, expect, it, vi } from 'vitest';
import { TEST_CARDS, chargeCard, parseCardNumber, passesLuhn, refundPayment } from '@/lib/payments';

describe('passesLuhn', () => {
  it.each([
    [TEST_CARDS.approved, true],
    [TEST_CARDS.declined, true],
    ['4242424242424241', false], // last digit off by one
    ['0000000000000000', true],
  ])('%s → %s', (digits, ok) => {
    expect(passesLuhn(digits)).toBe(ok);
  });
});

// Equivalence partitions: valid card · wrong length · non-digits · bad checksum · not a string.
describe('parseCardNumber', () => {
  it.each([
    ['plain 16 digits', '4242424242424242', '4242424242424242'],
    ['grouped with spaces', '4242 4242 4242 4242', '4242424242424242'],
    ['grouped with hyphens', '4242-4242-4242-4242', '4242424242424242'],
    ['15 digits (below boundary)', '424242424242424', null],
    ['17 digits (above boundary)', '42424242424242420', null],
    ['letters', '4242 4242 4242 424a', null],
    ['fails the checksum', '4242424242424241', null],
    ['empty', '', null],
    ['not a string', 4242424242424242, null],
    ['missing', null, null],
  ])('%s', (_label, input, expected) => {
    expect(parseCardNumber(input)).toBe(expected);
  });
});

describe('chargeCard (simulated provider)', () => {
  const request = { amountCents: 18800, currency: 'SGD' };

  it('approves the success test card with a unique payment reference', async () => {
    const a = await chargeCard({ ...request, cardNumber: TEST_CARDS.approved });
    const b = await chargeCard({ ...request, cardNumber: TEST_CARDS.approved });
    expect(a).toMatchObject({ ok: true, paymentRef: expect.stringMatching(/^pay_[0-9a-f]{24}$/) });
    expect(a.ok && b.ok && a.paymentRef !== b.paymentRef).toBe(true);
  });

  it('approves any other valid card number', async () => {
    expect(await chargeCard({ ...request, cardNumber: '5555 5555 5555 4444' })).toMatchObject({
      ok: true,
    });
  });

  it('declines the decline test card', async () => {
    expect(await chargeCard({ ...request, cardNumber: TEST_CARDS.declined })).toEqual({
      ok: false,
      code: 'declined',
    });
  });

  // Boundary values for the amount: 0 is a valid (free) order, negatives and fractions are not.
  it.each([
    [0, true],
    [1, true],
    [-1, false],
    [10.5, false],
  ])('amount %s cents accepted=%s', async (amountCents, ok) => {
    const result = await chargeCard({ ...request, amountCents, cardNumber: TEST_CARDS.approved });
    expect(result.ok).toBe(ok);
  });

  it('rejects an invalid card without charging it', async () => {
    expect(await chargeCard({ ...request, cardNumber: '1234' })).toEqual({
      ok: false,
      code: 'invalid-card',
    });
  });
});

describe('refundPayment (simulated provider)', () => {
  it('records the refund for the given payment', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    await refundPayment('pay_abc');
    expect(log).toHaveBeenCalledWith('Refunded simulated payment pay_abc');
    log.mockRestore();
  });
});
