/**
 * Background worker process — consumes BullMQ queues.
 * Runs as a separate process/container from the web server so slow jobs never
 * block HTTP requests, and so it can be scaled independently.
 */
import { loadEnv } from '@/lib/load-env';
import { Emitter } from '@socket.io/redis-emitter';
import { Worker } from 'bullmq';
import { disconnectPrisma } from '@/lib/db';
import type { ServerToClientEvents } from '@/lib/realtime';
import { createRedis } from '@/lib/redis';
import { HEARTBEAT_INTERVAL_MS, createHeartbeatProcessor } from '@/server/jobs/heartbeat';
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

  systemWorker.on('failed', (job, err) => {
    console.error(`Job ${job?.name}#${job?.id} failed:`, err.message);
  });

  console.log(`> Worker ready — consuming queues: ${Object.values(QUEUE_NAMES).join(', ')}`);

  const shutdown = async (signal: string) => {
    console.log(`${signal} received — draining worker`);
    await systemWorker.close(); // waits for in-flight jobs
    await systemQueue.close();
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
