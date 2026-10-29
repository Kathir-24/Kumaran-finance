-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "refreshTokenHash" TEXT;
