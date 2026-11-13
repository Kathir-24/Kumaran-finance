-- AlterTable
ALTER TABLE "User" ADD COLUMN "isPartner" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SubscriberTicket" ADD COLUMN "removalRequestedAt" TIMESTAMP(3),
ADD COLUMN "removalRequestedByUserId" TEXT,
ADD COLUMN "removalReason" TEXT;
