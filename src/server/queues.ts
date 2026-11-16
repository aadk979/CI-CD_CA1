import { Queue, type ConnectionOptions } from 'bullmq';
import { createRedis } from '@/lib/redis';

/** Every BullMQ queue in the system. Add new queues here so names stay consistent. */
export const QUEUE_NAMES = {
  /** Housekeeping jobs: worker heartbeat, scheduled clean-ups. */
  system: 'system',
  /** Seat holds: release each cart when its timer runs out, plus a periodic sweep. */
  holds: 'holds',
  /** Virtual waiting room: admit the next batch of queued fans on a fixed interval. */
  waitingRoom: 'waiting-room',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const JOB_NAMES = {
  heartbeat: 'heartbeat',
  releaseHolds: 'release-holds',
  sweepHolds: 'sweep-holds',
  admitQueue: 'admit-queue',
} as const;

export function createQueue(name: QueueName, connection: ConnectionOptions): Queue {
  return new Queue(name, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  });
}

const globalForQueues = globalThis as unknown as { queues?: Map<QueueName, Queue> };

/**
 * Shared producer-side queue for the web process (Server Actions enqueue jobs here).
 * One connection per queue per process, created on first use so builds never need Redis.
 */
export function getQueue(name: QueueName): Queue {
  globalForQueues.queues ??= new Map();
  let queue = globalForQueues.queues.get(name);
  if (!queue) {
    queue = createQueue(name, createRedis());
    globalForQueues.queues.set(name, queue);
  }
  return queue;
}
