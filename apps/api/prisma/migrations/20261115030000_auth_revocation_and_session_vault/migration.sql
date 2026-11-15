-- AlterTable User: Add tokenRevokedBefore and mustChangePassword
ALTER TABLE "User" ADD COLUMN "tokenRevokedBefore" TIMESTAMP(3),
ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable Customer: Add tokenRevokedBefore
ALTER TABLE "Customer" ADD COLUMN "tokenRevokedBefore" TIMESTAMP(3);

-- CreateTable Session: Multi-device session family vault (RFC 6819)
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "customerId" TEXT,
    "clientType" TEXT NOT NULL,
    "refreshTokenHash" TEXT,
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_userId_clientType_key" ON "Session"("userId", "clientType");

-- CreateIndex
CREATE UNIQUE INDEX "Session_customerId_clientType_key" ON "Session"("customerId", "clientType");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
