'use client';

import { useActionState } from 'react';
import { checkoutAction, type CheckoutActionState } from '@/app/actions/checkout';

const initialState: CheckoutActionState = {};

/** Simulated card payment. On success the action redirects to My tickets. */
export function PaymentForm({ eventId, total }: { eventId: string; total: string }) {
  const [state, action, paying] = useActionState(checkoutAction, initialState);

  return (
    <form action={action} className="flex flex-col gap-4 sm:max-w-sm">
      <input type="hidden" name="eventId" value={eventId} />
      <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        Demo checkout: no real payment is taken. Use test card{' '}
        <span className="font-mono">4242 4242 4242 4242</span>, or{' '}
        <span className="font-mono">4000 0000 0000 0002</span> to see a decline. Never enter a real
        card.
      </p>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Card number
        <input
          name="cardNumber"
          inputMode="numeric"
          autoComplete="off"
          placeholder="4242 4242 4242 4242"
          maxLength={23}
          required
          className="rounded-md border border-zinc-300 px-3 py-2 font-mono font-normal dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      {state.message && !paying && (
        <p
          role="alert"
          className="text-sm text-red-700 dark:text-red-400"
          data-testid="payment-error"
        >
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={paying}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {paying ? 'Paying…' : `Pay ${total}`}
      </button>
    </form>
  );
}
