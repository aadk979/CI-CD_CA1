import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@/generated/prisma/client';
import { buildOrderConfirmation, type OrderForEmail } from '@/lib/order-email';
import {
  createOrderEmailProcessor,
  orderEmailJobId,
  scheduleOrderConfirmation,
} from '@/server/jobs/order-email';
import { JOB_NAMES } from '@/server/queues';

const order: OrderForEmail = {
  id: 'ord123',
  recipientName: 'Ada',
  recipientEmail: 'ada@example.com',
  totalCents: 13600,
  currency: 'SGD',
  event: {
    title: 'Neon Skyline Tour',
    startsAt: new Date('2026-12-20T12:00:00Z'),
    venue: 'Harbour Arena',
    city: 'Singapore',
  },
  seats: [
    { section: 'Floor', row: 'A', number: 1, tierName: 'Golden Circle' },
    { section: 'Floor', row: 'A', number: 2, tierName: 'Golden Circle' },
  ],
};

describe('buildOrderConfirmation', () => {
  it('addresses the buyer and lists event, seats, total and reference', () => {
    const msg = buildOrderConfirmation(order);
    expect(msg.to).toBe('ada@example.com');
    expect(msg.subject).toBe('Your tickets for Neon Skyline Tour');
    expect(msg.text).toContain('Hi Ada,');
    expect(msg.text).toContain('Your 2 tickets are confirmed');
    expect(msg.text).toContain('Floor, Row A, Seat 2 (Golden Circle)');
    expect(msg.text).toContain('Harbour Arena, Singapore');
    expect(msg.text).toContain('Order reference: ord123');
  });

  it('uses singular wording for one ticket', () => {
    const msg = buildOrderConfirmation({ ...order, seats: [order.seats[0]] });
    expect(msg.text).toContain('Your 1 ticket is confirmed');
  });
});

describe('scheduleOrderConfirmation', () => {
  it('enqueues one job per order with a stable id (no duplicate emails)', async () => {
    const queue = { add: vi.fn().mockResolvedValue(undefined) };
    await scheduleOrderConfirmation(queue, 'ord123');
    expect(queue.add).toHaveBeenCalledWith(
      JOB_NAMES.sendOrderConfirmation,
      { orderId: 'ord123' },
      { jobId: orderEmailJobId('ord123') },
    );
    expect(orderEmailJobId('ord123')).not.toContain(':');
  });
});

function prismaWith(row: unknown) {
  return { order: { findUnique: vi.fn().mockResolvedValue(row) } } as unknown as PrismaClient;
}

const row = {
  id: 'ord123',
  totalCents: 13600,
  currency: 'SGD',
  user: { name: 'Ada', email: 'ada@example.com' },
  event: {
    title: 'Neon Skyline Tour',
    startsAt: new Date('2026-12-20T12:00:00Z'),
    venue: { name: 'Harbour Arena', city: 'Singapore' },
  },
  tickets: [
    { tierName: 'GC', seat: { row: 'A', number: 2, section: { name: 'Floor' } } },
    { tierName: 'GC', seat: { row: 'A', number: 1, section: { name: 'Floor' } } },
  ],
};

describe('createOrderEmailProcessor', () => {
  it('sends the confirmation for an existing order, seats in order', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const run = createOrderEmailProcessor({ prisma: prismaWith(row), send });

    expect(await run({ orderId: 'ord123' })).toEqual({ sent: true });
    expect(send).toHaveBeenCalledOnce();
    const { to, text } = send.mock.calls[0][0];
    expect(to).toBe('ada@example.com');
    expect(text.indexOf('Seat 1')).toBeLessThan(text.indexOf('Seat 2'));
  });

  it('sends nothing when the order no longer exists', async () => {
    const send = vi.fn();
    const run = createOrderEmailProcessor({ prisma: prismaWith(null), send });
    expect(await run({ orderId: 'gone' })).toEqual({ sent: false });
    expect(send).not.toHaveBeenCalled();
  });

  it('rethrows delivery failures so BullMQ retries the job', async () => {
    const send = vi.fn().mockRejectedValue(new Error('SMTP down'));
    const run = createOrderEmailProcessor({ prisma: prismaWith(row), send });
    await expect(run({ orderId: 'ord123' })).rejects.toThrow('SMTP down');
  });
});
