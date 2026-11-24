'use server';

import 'server-only';
import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import { getPrisma } from '@/lib/db';
import { isValidId } from '@/lib/holds';
import { checkout, getCart } from '@/lib/orders';
import { createPaymentIntent } from '@/lib/payments';
import { scheduleOrderConfirmation } from '@/server/jobs/order-email';
import { QUEUE_NAMES, getQueue } from '@/server/queues';
import { getCurrentUser } from '@/server/session';

export interface CheckoutActionState {
  message?: string;
}

export interface PaymentIntentState {
  clientSecret?: string;
  message?: string;
}

/**
 * Start a Stripe payment for the seats in the fan's cart. The amount comes from the
 * database (never the browser), so a tampered request can't change what is charged.
 */
export async function createPaymentIntentAction(eventId: string): Promise<PaymentIntentState> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isValidId(eventId)) return { message: 'This event does not exist.' };

  const cart = await getCart(getPrisma(), { eventId, userId: user.id });
  if (!cart) return { message: 'You have no seats on hold for this event.' };
  try {
    const { clientSecret } = await createPaymentIntent({
      amountCents: cart.totalCents,
      currency: cart.currency,
      userId: user.id,
      eventId,
    });
    return { clientSecret };
  } catch (err) {
    console.error('Could not start the Stripe payment', err);
    return { message: 'Payments are unavailable right now. Please try again shortly.' };
  }
}

/**
 * Finish checkout after the browser confirmed the Stripe payment (SCRUM-39). Identity comes
 * from the session; checkout() re-verifies the payment with Stripe before selling anything.
 */
export async function checkoutAction(
  eventId: string,
  paymentIntentId: string,
): Promise<CheckoutActionState> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isValidId(eventId)) return { message: 'This event does not exist.' };

  const result = await checkout(getPrisma(), { eventId, userId: user.id, paymentIntentId });
  if (!result.ok) {
    refresh(); // show the cart as it is now (e.g. emptied by an expired hold)
    return { message: result.message };
  }
  try {
    await scheduleOrderConfirmation(getQueue(QUEUE_NAMES.email), result.orderId);
  } catch (err) {
    // The order is paid and saved; a missing email must never undo or hide that.
    console.error('Could not queue the order confirmation email', err);
  }
  redirect(`/tickets?order=${result.orderId}`);
}
