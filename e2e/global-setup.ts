import { execSync } from 'node:child_process';

/** Prepare the test database: apply migrations and load seed data for the UI. */
export default function globalSetup() {
  if (!process.env.DATABASE_URL?.includes('test')) {
    throw new Error('Refusing to run E2E: DATABASE_URL does not look like a test database.');
  }
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
  execSync('npx tsx prisma/seed.ts', { stdio: 'inherit', env: process.env });
}
