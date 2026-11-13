import { loadEnv } from './src/lib/load-env';
import { defineConfig, devices } from '@playwright/test';

// E2E runs against the production build using the test database (.env.test).
(process.env as Record<string, string>).NODE_ENV = 'test';
loadEnv();

const PORT = Number(process.env.PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: 1,
  reporter: isCI
    ? [['list'], ['html', { open: 'never' }], ['github']]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node dist/server.mjs',
      url: `${baseURL}/api/health`,
      reuseExistingServer: !isCI,
      timeout: 60_000,
      env: {
        DATABASE_URL: process.env.DATABASE_URL!,
        REDIS_URL: process.env.REDIS_URL!,
        PORT: String(PORT),
        BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET!,
        BETTER_AUTH_URL: baseURL,
      },
    },
    {
      // The worker has no HTTP port; wait for its readiness log line instead.
      command: 'node dist/worker.mjs',
      wait: { stdout: /Worker ready/ },
      reuseExistingServer: !isCI,
      timeout: 30_000,
      env: {
        DATABASE_URL: process.env.DATABASE_URL!,
        REDIS_URL: process.env.REDIS_URL!,
      },
    },
  ],
});
