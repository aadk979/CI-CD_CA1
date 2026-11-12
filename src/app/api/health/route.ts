import { connection } from 'next/server';
import { getHealth, healthHttpStatus } from '@/lib/health';
import { createHealthChecks } from '@/server/health-checks';

/**
 * Liveness/readiness probe — used by the Docker HEALTHCHECK, the CD smoke test
 * and uptime monitoring. `version` lets the pipeline confirm which commit is live.
 */
export async function GET() {
  await connection(); // always evaluate at request time, never prerender
  const report = await getHealth(createHealthChecks());
  return Response.json(report, {
    status: healthHttpStatus(report),
    headers: { 'Cache-Control': 'no-store' },
  });
}
