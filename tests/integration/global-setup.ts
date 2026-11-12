import { execSync } from 'node:child_process';

/**
 * Runs once before the integration suite: bring the TEST database schema up to date.
 * Env (.env.test, or CI-provided vars) is already loaded by vitest.config.ts.
 */
export default function setup() {
  if (!process.env.DATABASE_URL?.includes('test')) {
    throw new Error(
      `Refusing to run integration tests: DATABASE_URL does not look like a test database (${process.env.DATABASE_URL}).`,
    );
  }
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
}
