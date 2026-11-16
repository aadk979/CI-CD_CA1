/**
 * Background worker process — consumes BullMQ queues.
 * Runs as a separate process/container from the web server so slow jobs never
 * block HTTP requests, and so it can be scaled independently.
 */
import { loadEnv } from '@/lib/load-env';
import { Emitter } from '@socket.io/redis-emitter';
import { Worker } from 'bullmq';
import { ACCESS_PASS_TTL_MS } from '@/lib/config';
import { disconnectPrisma, getPrisma } from '@/lib/db';
import { getEnv } from '@/lib/env';
import type { ServerToClientEvents } from '@/lib/realtime';
import { createRedis } from '@/lib/redis';
import { admitFromAllQueues } from '@/lib/waiting-room';
import { broadcastQueue, broadcastSeats } from '@/server/broadcast';
import { createAdmitQueueProcessor } from '@/server/jobs/admit-queue';
import { HEARTBEAT_INTERVAL_MS, createHeartbeatProcessor } from '@/server/jobs/heartbeat';
import {
  HOLD_SWEEP_INTERVAL_MS,
  createReleaseHoldsProcessor,
  type ReleaseHoldsJobData,
} from '@/server/jobs/release-holds';
import { JOB_NAMES, QUEUE_NAMES, createQueue } from '@/server/queues';

loadEnv();

async function main() {
  const redis = createRedis();
  const emitter = new Emitter<ServerToClientEvents>(createRedis());

  const systemQueue = createQueue(QUEUE_NAMES.system, redis);
  await systemQueue.upsertJobScheduler(
    JOB_NAMES.heartbeat,
    { every: HEARTBEAT_INTERVAL_MS },
    { name: JOB_NAMES.heartbeat },
  );

  const heartbeat = createHeartbeatProcessor({
    redis,
    emit: (payload) => emitter.emit('system:heartbeat', payload),
  });

  const systemWorker = new Worker(
    QUEUE_NAMES.system,
    async (job) => {
      switch (job.name) {
        case JOB_NAMES.heartbeat:
          return heartbeat();
        default:
          throw new Error(`Unknown job "${job.name}" on queue "${QUEUE_NAMES.system}"`);
      }
    },
    { connection: createRedis() },
  );

  const holdsQueue = createQueue(QUEUE_NAMES.holds, redis);
  await holdsQueue.upsertJobScheduler(
    JOB_NAMES.sweepHolds,
    { every: HOLD_SWEEP_INTERVAL_MS },
    { name: JOB_NAMES.sweepHolds },
  );

  const releaseHolds = createReleaseHoldsProcessor({
    prisma: getPrisma(),
    onReleased: ({ eventId, seatIds }) => {
      console.log(`Released ${seatIds.length} expired hold(s) for event ${eventId}`);
      broadcastSeats(emitter, eventId, seatIds, 'available');
    },
  });

  const holdsWorker = new Worker<Partial<ReleaseHoldsJobData>>(
    QUEUE_NAMES.holds,
    async (job) => {
      switch (job.name) {
        case JOB_NAMES.releaseHolds:
          return releaseHolds(job.data);
        case JOB_NAMES.sweepHolds:
          return releaseHolds();
        default:
          throw new Error(`Unknown job "${job.name}" on queue "${QUEUE_NAMES.holds}"`);
      }
    },
    { connection: createRedis() },
  );

  // Waiting room (SCRUM-35): every interval, admit the next batch of every event's queue.
  const { WAITING_ROOM_BATCH_SIZE, WAITING_ROOM_INTERVAL_MS } = getEnv();
  const waitingRoomQueue = createQueue(QUEUE_NAMES.waitingRoom, redis);
  await waitingRoomQueue.upsertJobScheduler(
    JOB_NAMES.admitQueue,
    { every: WAITING_ROOM_INTERVAL_MS },
    // A missed tick is simply covered by the next one, so don't retry or keep history.
    { name: JOB_NAMES.admitQueue, opts: { attempts: 1, removeOnComplete: true } },
  );

  const admitQueue = createAdmitQueueProcessor({
    admit: (options) => admitFromAllQueues(redis, options),
    batchSize: WAITING_ROOM_BATCH_SIZE,
    passTtlMs: ACCESS_PASS_TTL_MS,
    onAdmitted: (batch) => {
      console.log(`Admitted ${batch.admitted.length} fan(s) to event ${batch.eventId}`);
      broadcastQueue(emitter, batch);
    },
  });

  const waitingRoomWorker = new Worker(
    QUEUE_NAMES.waitingRoom,
    async (job) => {
      switch (job.name) {
        case JOB_NAMES.admitQueue:
          return admitQueue();
        default:
          throw new Error(`Unknown job "${job.name}" on queue "${QUEUE_NAMES.waitingRoom}"`);
      }
    },
    { connection: createRedis() },
  );

  for (const worker of [systemWorker, holdsWorker, waitingRoomWorker]) {
    worker.on('failed', (job, err) => {
      console.error(`Job ${job?.name}#${job?.id} failed:`, err.message);
    });
  }

  console.log(`> Worker ready — consuming queues: ${Object.values(QUEUE_NAMES).join(', ')}`);

  const shutdown = async (signal: string) => {
    console.log(`${signal} received — draining worker`);
    await Promise.all([systemWorker.close(), holdsWorker.close(), waitingRoomWorker.close()]); // waits for in-flight jobs
    await Promise.all([systemQueue.close(), holdsQueue.close(), waitingRoomQueue.close()]);
    await Promise.allSettled([redis.quit(), disconnectPrisma()]);
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Worker failed to start', err);
  process.exit(1);
});
