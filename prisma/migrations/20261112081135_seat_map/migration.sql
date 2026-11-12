-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Seat" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "row" TEXT NOT NULL,
    "number" INTEGER NOT NULL,

    CONSTRAINT "Seat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceTier" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'SGD',

    CONSTRAINT "PriceTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Section_venueId_code_key" ON "Section"("venueId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Seat_sectionId_row_number_key" ON "Seat"("sectionId", "row", "number");

-- CreateIndex
CREATE INDEX "PriceTier_sectionId_idx" ON "PriceTier"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceTier_eventId_sectionId_key" ON "PriceTier"("eventId", "sectionId");

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceTier" ADD CONSTRAINT "PriceTier_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceTier" ADD CONSTRAINT "PriceTier_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Integrity rules Prisma's schema language cannot express.
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_number_positive" CHECK ("number" > 0);
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_row_format" CHECK ("row" ~ '^[A-Z]{1,3}$');
ALTER TABLE "PriceTier" ADD CONSTRAINT "PriceTier_priceCents_nonnegative" CHECK ("priceCents" >= 0);
ALTER TABLE "PriceTier" ADD CONSTRAINT "PriceTier_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$');
