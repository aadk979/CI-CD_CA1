-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('FAN', 'ORGANISER');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'FAN';
