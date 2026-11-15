import { describe, expect, it, vi } from 'vitest';
import { holdExpiryJobId, scheduleHoldExpiry } from '@/server/jobs/release-holds';
import { JOB_NAMES } from '@/server/queues';

const cart = { eventId: 'evt1', userId: 'usr1' };
const NOW = new Date('2026-12-01T10:00:00Z');

describe('scheduleHoldExpiry', () => {
  it('delays the release job until the hold lapses', async () => {
    const queue = { add: vi.fn().mockResolvedValue(undefined) };
    const expiresAt = new Date(NOW.getTime() + 600_000);

    await scheduleHoldExpiry(queue, cart, expiresAt, NOW);

    expect(queue.add).toHaveBeenCalledWith(JOB_NAMES.releaseHolds, cart, {
      delay: 600_000,
      jobId: holdExpiryJobId(cart, expiresAt),
    });
  });

  it('runs straight away if the hold has already lapsed (never a negative delay)', async () => {
    const queue = { add: vi.fn().mockResolvedValue(undefined) };

    await scheduleHoldExpiry(queue, cart, new Date(NOW.getTime() - 1000), NOW);

    expect(queue.add.mock.calls[0][2].delay).toBe(0);
  });

  it('propagates queue errors so the caller can decide what to do', async () => {
    const queue = { add: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
    await expect(scheduleHoldExpiry(queue, cart, NOW, NOW)).rejects.toThrow('ECONNREFUSED');
  });
});

describe('holdExpiryJobId', () => {
  it('is stable per cart and expiry, and contains no ":" (reserved by BullMQ)', () => {
    const at = new Date(NOW.getTime() + 600_000);
    expect(holdExpiryJobId(cart, at)).toBe(holdExpiryJobId({ ...cart }, new Date(at)));
    expect(holdExpiryJobId(cart, at)).not.toContain(':');
    expect(holdExpiryJobId(cart, at)).not.toBe(holdExpiryJobId({ ...cart, userId: 'usr2' }, at));
  });
});
