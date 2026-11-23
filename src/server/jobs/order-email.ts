import type { PrismaClient } from '@/generated/prisma/client';
import { buildOrderConfirmation, getOrderForEmail, type EmailSender } from '@/lib/order-email';
import { JOB_NAMES } from '@/server/queues';

export interface OrderEmailJobData {
  orderId: string;
}

interface QueueLike {
  add(name: string, data: OrderEmailJobData, opts: { jobId: string }): Promise<unknown>;
}

/** One confirmation per order: enqueueing twice (e.g. a retried request) is a no-op. */
export const orderEmailJobId = (orderId: string) => `order-confirmation_${orderId}`;

/** Enqueue the confirmation email so checkout never waits on a mail server. */
export async function scheduleOrderConfirmation(queue: QueueLike, orderId: string): Promise<void> {
  await queue.add(
    JOB_NAMES.sendOrderConfirmation,
    { orderId },
    { jobId: orderEmailJobId(orderId) },
  );
}

export interface OrderEmailDeps {
  prisma: PrismaClient;
  send: EmailSender;
}

/**
 * Worker-side processor. Throws if sending fails, so BullMQ retries with backoff (the queue
 * default is 3 attempts). A missing order is not retried: there is nothing to send.
 */
export function createOrderEmailProcessor({ prisma, send }: OrderEmailDeps) {
  return async ({ orderId }: OrderEmailJobData): Promise<{ sent: boolean }> => {
    const order = await getOrderForEmail(prisma, orderId);
    if (!order) return { sent: false };
    await send(buildOrderConfirmation(order));
    return { sent: true };
  };
}
