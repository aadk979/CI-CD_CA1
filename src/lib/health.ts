export type CheckStatus = 'ok' | 'error';

export interface HealthChecks {
  database: () => Promise<unknown>;
  redis: () => Promise<unknown>;
  /** Resolves to the ISO timestamp of the last worker heartbeat, or null if none is recent. */
  workerHeartbeat: () => Promise<string | null>;
}

export interface HealthReport {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  checks: {
    database: CheckStatus;
    redis: CheckStatus;
    worker: CheckStatus;
  };
  workerLastSeen: string | null;
}

async function probe<T>(fn: () => Promise<T>): Promise<{ ok: boolean; value?: T }> {
  try {
    return { ok: true, value: await fn() };
  } catch {
    return { ok: false };
  }
}

/**
 * Aggregate dependency checks into one report.
 *  - down:     database or Redis unreachable → app cannot serve requests (HTTP 503)
 *  - degraded: background worker silent → pages work, queued jobs are stalled
 *  - ok:       everything healthy
 */
export async function getHealth(
  checks: HealthChecks,
  version = process.env.APP_VERSION ?? 'dev',
): Promise<HealthReport> {
  const [database, redis, worker] = await Promise.all([
    probe(checks.database),
    probe(checks.redis),
    probe(checks.workerHeartbeat),
  ]);

  const workerLastSeen = worker.ok ? (worker.value ?? null) : null;
  const workerOk = workerLastSeen !== null;

  let status: HealthReport['status'] = 'ok';
  if (!database.ok || !redis.ok) status = 'down';
  else if (!workerOk) status = 'degraded';

  return {
    status,
    version,
    checks: {
      database: database.ok ? 'ok' : 'error',
      redis: redis.ok ? 'ok' : 'error',
      worker: workerOk ? 'ok' : 'error',
    },
    workerLastSeen,
  };
}

export function healthHttpStatus(report: HealthReport): number {
  return report.status === 'down' ? 503 : 200;
}
