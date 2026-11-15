import type { PrismaClient } from '@/generated/prisma/client';
import { releaseExpiredHolds, type ReleasedSeats } from '@/lib/holds';
import { JOB_NAMES } from '@/server/queues';

/** Safety net: how often the worker sweeps for lapsed holds whose own job never ran. */
export const HOLD_SWEEP_INTERVAL_MS = 60_000;

export interface ReleaseHoldsJobData {
  eventId: string;
  userId: string;
}

interface QueueLike {
  add(
    name: string,
    data: ReleaseHoldsJobData,
    opts: { delay: number; jobId: string },
  ): Promise<unknown>;
}

/**
 * Deterministic job id: holding more seats in the same cart keeps the same expiry, so
 * re-scheduling is a no-op instead of piling up duplicate jobs. (BullMQ ids can't contain ":".)
 */
export function holdExpiryJobId({ eventId, userId }: ReleaseHoldsJobData, expiresAt: Date): string {
  return `hold-expiry_${eventId}_${userId}_${expiresAt.getTime()}`;
}

/** Enqueue a delayed job that frees this cart's seats the moment its timer runs out. */
export async function scheduleHoldExpiry(
  queue: QueueLike,
  data: ReleaseHoldsJobData,
  expiresAt: Date,
  now: Date = new Date(),
): Promise<void> {
  await queue.add(JOB_NAMES.releaseHolds, data, {
    delay: Math.max(0, expiresAt.getTime() - now.getTime()),
    jobId: holdExpiryJobId(data, expiresAt),
  });
}

export interface ReleaseHoldsDeps {
  prisma: PrismaClient;
  /** Called with the seats freed per event, e.g. to broadcast availability. */
  onReleased?: (released: ReleasedSeats) => void;
  now?: () => Date;
}

/**
 * Worker-side processor. With job data it releases one cart (the delayed job);
 * without it, every lapsed hold (the periodic sweep). Both only touch expired holds,
 * so a job that runs late, early or twice is harmless.
 */
export function createReleaseHoldsProcessor({
  prisma,
  onReleased,
  now = () => new Date(),
}: ReleaseHoldsDeps) {
  return async (data?: Partial<ReleaseHoldsJobData>): Promise<ReleasedSeats[]> => {
    const released = await releaseExpiredHolds(prisma, {
      now: now(),
      eventId: data?.eventId,
      userId: data?.userId,
    });
    released.forEach((r) => onReleased?.(r));
    return released;
  };
}
