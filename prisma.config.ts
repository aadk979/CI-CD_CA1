import { loadEnv } from './src/lib/load-env';
import { defineConfig } from 'prisma/config';

// Load .env / .env.local / .env.test the same way Next.js does.
loadEnv();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // `prisma generate` doesn't need a database, so an empty URL is fine at build time.
    url: process.env.DATABASE_URL ?? '',
  },
});
