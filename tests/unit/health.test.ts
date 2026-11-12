import { describe, expect, it } from 'vitest';
import { getHealth, healthHttpStatus, type HealthChecks } from '@/lib/health';

const ok = () => Promise.resolve('ok');
const fail = () => Promise.reject(new Error('unreachable'));

function checks(overrides: Partial<HealthChecks> = {}): HealthChecks {
  return {
    database: ok,
    redis: ok,
    workerHeartbeat: () => Promise.resolve('2026-11-12T00:00:00.000Z'),
    ...overrides,
  };
}

describe('getHealth', () => {
  it('reports ok when every dependency is healthy', async () => {
    const report = await getHealth(checks(), 'abc123');
    expect(report).toEqual({
      status: 'ok',
      version: 'abc123',
      checks: { database: 'ok', redis: 'ok', worker: 'ok' },
      workerLastSeen: '2026-11-12T00:00:00.000Z',
    });
    expect(healthHttpStatus(report)).toBe(200);
  });

  it('reports degraded (still HTTP 200) when the worker has no recent heartbeat', async () => {
    const report = await getHealth(checks({ workerHeartbeat: () => Promise.resolve(null) }));
    expect(report.status).toBe('degraded');
    expect(report.checks.worker).toBe('error');
    expect(healthHttpStatus(report)).toBe(200);
  });

  it('treats a failing heartbeat lookup as a silent worker', async () => {
    const report = await getHealth(checks({ workerHeartbeat: fail }));
    expect(report.status).toBe('degraded');
    expect(report.workerLastSeen).toBeNull();
  });

  it.each([
    ['database', { database: fail }],
    ['redis', { redis: fail }],
  ])('reports down (HTTP 503) when %s is unreachable', async (name, override) => {
    const report = await getHealth(checks(override));
    expect(report.status).toBe('down');
    expect(report.checks[name as 'database' | 'redis']).toBe('error');
    expect(healthHttpStatus(report)).toBe(503);
  });

  it('defaults version to APP_VERSION or "dev"', async () => {
    const report = await getHealth(checks());
    expect(report.version).toBe(process.env.APP_VERSION ?? 'dev');
  });
});
