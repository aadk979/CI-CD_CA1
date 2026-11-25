import nextEnv from '@next/env';
import { defineConfig } from 'vitest/config';

// Load .env.test (and .env) the same way Next.js does in test mode.
(process.env as Record<string, string>).NODE_ENV = 'test';
nextEnv.loadEnvConfig(process.cwd());

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['tests/integration/global-setup.ts'],
          // Tests share one real database + Redis, so run files one at a time.
          fileParallelism: false,
          testTimeout: 15_000,
          hookTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text', 'html', 'json-summary', 'lcov'],
      // Everything under src/, plus the root server/worker entrypoints.
      // all-files reporting: untested files show up as 0% instead of being hidden.
      include: ['src/**/*.{ts,tsx}', 'server.ts', 'worker.ts'],
      exclude: ['src/generated/**', '**/*.d.ts'],
      // Report everything, but only gate the server-side logic. UI/pages/actions have
      // no unit/integration tests (Playwright E2E covers them), so they show as low coverage.
      thresholds: {
        'src/lib/**/*.ts': { statements: 80, branches: 80, functions: 80, lines: 80 },
        'src/server/**/*.ts': { statements: 80, branches: 80, functions: 80, lines: 80 },
      },
    },
  },
});
