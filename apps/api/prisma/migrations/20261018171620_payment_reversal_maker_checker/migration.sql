/*
  Warnings:

  - Added the required column `updatedAt` to the `PaymentReversal` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PaymentReversal" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'REQUESTED',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "approvedByUserId" DROP NOT NULL,
ALTER COLUMN "reversedAt" DROP NOT NULL,
ALTER COLUMN "reversedAt" DROP DEFAULT;
