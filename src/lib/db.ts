import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { getEnv } from './env';

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: getEnv().DATABASE_URL });
  return new PrismaClient({ adapter });
}

// One client per process, reused across hot reloads in development
// (avoids exhausting database connections). Created lazily so that
// `next build` never needs a database.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  globalForPrisma.prisma ??= createPrismaClient();
  return globalForPrisma.prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await globalForPrisma.prisma?.$disconnect();
  globalForPrisma.prisma = undefined;
}
