import { getPrisma } from '@/lib/db';

/** Isolation: wipe domain tables so each test starts from a known state. */
export async function resetDatabase() {
  await getPrisma().$executeRawUnsafe('TRUNCATE TABLE "Event", "Venue" RESTART IDENTITY CASCADE');
}
