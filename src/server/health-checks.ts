import { getPrisma } from '@/lib/db';
import type { HealthChecks } from '@/lib/health';
import { getRedis } from '@/lib/redis';
import { HEARTBEAT_KEY } from './jobs/heartbeat';

/** Real dependency probes used by GET /api/health. */
export function createHealthChecks(): HealthChecks {
  return {
    database: () => getPrisma().$queryRaw`SELECT 1`,
    redis: () => getRedis().ping(),
    workerHeartbeat: () => getRedis().get(HEARTBEAT_KEY),
  };
}
