import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { disconnectPrisma } from '@/lib/db';
import { getHealth } from '@/lib/health';
import { getRedis } from '@/lib/redis';
import { createHealthChecks } from '@/server/health-checks';
import { HEARTBEAT_KEY } from '@/server/jobs/heartbeat';

describe('health checks against real Postgres + Redis', () => {
  const redis = getRedis();

  beforeEach(async () => {
    await redis.del(HEARTBEAT_KEY);
  });

  afterAll(async () => {
    await disconnectPrisma();
    await redis.quit();
  });

  it('is degraded when dependencies are up but no worker heartbeat exists', async () => {
    const report = await getHealth(createHealthChecks());
    expect(report.checks).toEqual({ database: 'ok', redis: 'ok', worker: 'error' });
    expect(report.status).toBe('degraded');
  });

  it('is ok once a worker heartbeat is recorded', async () => {
    await redis.set(HEARTBEAT_KEY, '2026-11-12T08:00:00.000Z', 'EX', 30);
    const report = await getHealth(createHealthChecks());
    expect(report.status).toBe('ok');
    expect(report.workerLastSeen).toBe('2026-11-12T08:00:00.000Z');
  });
});
