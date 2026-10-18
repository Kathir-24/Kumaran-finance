-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isTotpEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mpinHash" TEXT,
ADD COLUMN     "refreshTokenHash" TEXT,
ADD COLUMN     "totpSecret" TEXT;
