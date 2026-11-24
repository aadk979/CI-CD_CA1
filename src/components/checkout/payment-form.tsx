'use client';

import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { checkoutAction, createPaymentIntentAction } from '@/app/actions/checkout';

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
      <p role="alert" className="text-sm text-red-700 dark:text-red-400">
        Payments are not configured (missing Stripe publishable key).
      </p>
    );
  }
  if (error) {
    return (
      <p
        role="alert"
        className="text-sm text-red-700 dark:text-red-400"
        data-testid="payment-error"
      >
        {error}
      </p>
    );
  }
  if (!clientSecret) return <p className="text-sm text-zinc-500">Loading payment form…</p>;

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
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
    <form onSubmit={onSubmit} className="flex flex-col gap-4 sm:max-w-sm">
      <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        Test mode: no real money moves. Use card{' '}
        <span className="font-mono">4242 4242 4242 4242</span>, any future expiry and any CVC (
        <span className="font-mono">4000 0000 0000 0002</span> is declined). Never enter a real
        card.
      </p>
      <PaymentElement />
      {message && (
        <p
          role="alert"
          className="text-sm text-red-700 dark:text-red-400"
          data-testid="payment-error"
        >
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={paying || !stripe}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {paying ? 'Paying…' : `Pay ${total}`}
      </button>
    </form>
  );
}
