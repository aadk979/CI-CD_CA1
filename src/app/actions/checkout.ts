'use server';

import 'server-only';
import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import { getPrisma } from '@/lib/db';
import { isValidId } from '@/lib/holds';
import { checkout } from '@/lib/orders';
import { scheduleOrderConfirmation } from '@/server/jobs/order-email';
import { QUEUE_NAMES, getQueue } from '@/server/queues';
import { getCurrentUser } from '@/server/session';

export interface CheckoutActionState {
  message?: string;
}

/**
 * Pay for the seats in the fan's cart (SCRUM-39). Identity comes from the session; the
 * price comes from the database, never the form, so a tampered request can't change it.
 */
export async function checkoutAction(
  _prev: CheckoutActionState,
  formData: FormData,
): Promise<CheckoutActionState> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const eventId = formData.get('eventId');
  if (!isValidId(eventId)) return { message: 'This event does not exist.' };

  const result = await checkout(getPrisma(), {
    eventId,
    userId: user.id,
    cardNumber: formData.get('cardNumber'),
  });
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
