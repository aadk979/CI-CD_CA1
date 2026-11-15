-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('HELD', 'SOLD');

-- CreateTable
CREATE TABLE "SeatReservation" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "seatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'HELD',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeatReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeatReservation_userId_eventId_idx" ON "SeatReservation"("userId", "eventId");

-- CreateIndex
CREATE INDEX "SeatReservation_status_expiresAt_idx" ON "SeatReservation"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SeatReservation_eventId_seatId_key" ON "SeatReservation"("eventId", "seatId");

-- AddForeignKey
ALTER TABLE "SeatReservation" ADD CONSTRAINT "SeatReservation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatReservation" ADD CONSTRAINT "SeatReservation_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "Seat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatReservation" ADD CONSTRAINT "SeatReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A hold must say when it lapses; a sale never lapses.
ALTER TABLE "SeatReservation" ADD CONSTRAINT "SeatReservation_expiry_matches_status"
  CHECK (("status" = 'HELD' AND "expiresAt" IS NOT NULL) OR ("status" = 'SOLD' AND "expiresAt" IS NULL));
