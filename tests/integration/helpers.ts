import { getPrisma } from '@/lib/db';

/** Isolation: wipe domain tables so each test starts from a known state. */
export async function resetDatabase() {
  await getPrisma().$executeRawUnsafe(
    'TRUNCATE TABLE "Ticket", "Order", "SeatReservation", "Session", "Account", "Verification", "User", "PriceTier", "Seat", "Section", "Event", "Venue" RESTART IDENTITY CASCADE',
  );
}
