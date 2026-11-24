'use client';

import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Appearance } from '@stripe/stripe-js';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { checkoutAction, createPaymentIntentAction } from '@/app/actions/checkout';
import { button, notice } from '@/components/ui/styles';
import { THEME } from '@/components/ui/tokens';

/** Dark Stripe Payment Element matching the app's tokens (it renders in Stripe's iframe). */
const APPEARANCE: Appearance = {
  theme: 'night',
  variables: {
    colorPrimary: THEME.violetSoft,
    colorBackground: THEME.surface2,
    colorText: THEME.ink,
    colorTextSecondary: THEME.body,
    colorTextPlaceholder: THEME.muted,
    colorDanger: THEME.danger,
    colorSuccess: THEME.success,
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
    borderRadius: THEME.radiusBtn,
    spacingUnit: '4px',
  },
  rules: {
    '.Input': { border: `1px solid ${THEME.hairline}`, boxShadow: 'none' },
    '.Input:focus': { border: `1px solid ${THEME.violetSoft}` },
    '.Label': { fontWeight: '500' },
  },
};

/** Card payment with Stripe's Payment Element (card details never reach our server). */
export function PaymentForm({
  eventId,
  total,
  publishableKey,
}: {
  eventId: string;
  total: string;
  /** Passed from the server at request time, so the image needs no build-time Stripe key. */
  publishableKey?: string;
}) {
  const stripePromise = useMemo(
    () => (publishableKey ? loadStripe(publishableKey) : null),
    [publishableKey],
  );
  const [clientSecret, setClientSecret] = useState<string>();
  const [error, setError] = useState<string>();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // one PaymentIntent per page load, even in Strict Mode
    started.current = true;
    createPaymentIntentAction(eventId).then((r) => {
      if (r.clientSecret) setClientSecret(r.clientSecret);
      else setError(r.message ?? 'Payments are unavailable right now.');
    });
  }, [eventId]);

  if (!stripePromise) {
    return (
      <p role="alert" className={notice.danger}>
        Payments are not configured (missing Stripe publishable key).
      </p>
    );
  }
  if (error) {
    return (
      <p role="alert" className={notice.danger} data-testid="payment-error">
        {error}
      </p>
    );
  }
  if (!clientSecret) {
    return (
      <div className="flex flex-col gap-3" aria-busy>
        <p className="text-muted text-sm">Loading payment form…</p>
        <div className="skeleton h-11 w-full" />
        <div className="grid grid-cols-2 gap-3">
          <div className="skeleton h-11" />
          <div className="skeleton h-11" />
        </div>
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance: APPEARANCE }}>
      <CardForm eventId={eventId} total={total} />
    </Elements>
  );
}

function CardForm({ eventId, total }: { eventId: string; total: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [message, setMessage] = useState<string>();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPaying(true);
    setMessage(undefined);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });
    if (error || !paymentIntent || paymentIntent.status !== 'succeeded') {
      setMessage(error?.message ?? 'Your payment did not go through. Please try again.');
      setPaying(false);
      return;
    }
    // Paid. The server re-checks with Stripe, sells the seats and redirects to My tickets.
    const result = await checkoutAction(eventId, paymentIntent.id);
    if (result?.message) setMessage(result.message);
    setPaying(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <p className={notice.warning}>
        Test mode: no real money moves. Use card{' '}
        <span className="font-mono">4242 4242 4242 4242</span>, any future expiry and any CVC (
        <span className="font-mono">4000 0000 0000 0002</span> is declined). Never enter a real
        card.
      </p>
      <PaymentElement />
      {message && (
        <p role="alert" className={notice.danger} data-testid="payment-error">
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={paying || !stripe}
        className={`${button.primary} h-12 w-full text-base`}
      >
        {paying ? 'Paying…' : `Pay ${total}`}
      </button>
    </form>
  );
}
