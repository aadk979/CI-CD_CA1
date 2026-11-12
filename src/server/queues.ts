import { Queue, type ConnectionOptions } from 'bullmq';

/** Every BullMQ queue in the system. Add new queues here so names stay consistent. */
export const QUEUE_NAMES = {
  /** Housekeeping jobs: worker heartbeat, scheduled clean-ups. */
  system: 'system',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const JOB_NAMES = {
  heartbeat: 'heartbeat',
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
