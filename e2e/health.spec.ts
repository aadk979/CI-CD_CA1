import { expect, test } from '@playwright/test';

test('GET /api/health reports dependencies and is never cached', async ({ request }) => {
  const res = await request.get('/api/health');

  expect(res.status()).toBe(200);
  expect(res.headers()['cache-control']).toContain('no-store');

  const body = await res.json();
  expect(body.checks.database).toBe('ok');
  expect(body.checks.redis).toBe('ok');
  expect(['ok', 'degraded']).toContain(body.status);
  expect(typeof body.version).toBe('string');
});
