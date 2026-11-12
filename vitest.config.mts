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
      // Server-side logic. UI routes/components are exercised by Playwright E2E instead.
      include: ['src/lib/**/*.ts', 'src/server/**/*.ts'],
      exclude: ['src/generated/**'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
