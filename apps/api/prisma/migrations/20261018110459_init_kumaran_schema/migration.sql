-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'BRANCH_MANAGER', 'ACCOUNTANT', 'COLLECTION_AGENT', 'CUSTOMER', 'AUDITOR');

-- CreateEnum
CREATE TYPE "ChitStatus" AS ENUM ('DRAFT', 'REGISTERED', 'ACTIVE', 'COMPLETED', 'CLOSED');

-- CreateEnum
CREATE TYPE "InitializationMode" AS ENUM ('NEW_GROUP', 'ONGOING_GROUP');

-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'MINUTES_FILED');

-- CreateEnum
CREATE TYPE "DisbursementMode" AS ENUM ('ACCOUNT_PAYEE_CHEQUE', 'BANK_TRANSFER_NEFT', 'BANK_TRANSFER_RTGS', 'BANK_TRANSFER_IMPS', 'CASH');

-- CreateEnum
CREATE TYPE "DueStatus" AS ENUM ('UNPAID', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'SUCCESS', 'FAILED', 'REVERSED');

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameTamil" TEXT,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "branchId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "roles" "Role"[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "customerCode" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "fullNameTamil" TEXT,
    "phone" TEXT NOT NULL,
    "altPhone" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "panNumber" TEXT,
    "aadhaarLast4" TEXT,
    "isKycVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nominee" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "aadhaarLast4" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Nominee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerDocument" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChitGroup" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "groupCode" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "groupNameTamil" TEXT,
    "chitValue" BIGINT NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "totalTickets" INTEGER NOT NULL,
    "baseInstallment" BIGINT NOT NULL,
    "foremanCommissionRate" DECIMAL(5,2) NOT NULL DEFAULT 4.00,
    "maxDiscountCeiling" BIGINT NOT NULL,
    "initMode" "InitializationMode" NOT NULL DEFAULT 'NEW_GROUP',
    "onboardedAtMonth" INTEGER NOT NULL DEFAULT 1,
    "status" "ChitStatus" NOT NULL DEFAULT 'DRAFT',
    "sanctionOrderNumber" TEXT,
    "sanctionDate" TIMESTAMP(3),
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChitGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriberTicket" (
    "id" TEXT NOT NULL,
    "chitGroupId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "ticketNumber" INTEGER NOT NULL,
    "isPrized" BOOLEAN NOT NULL DEFAULT false,
    "prizedAuctionId" TEXT,
    "openingBalance" BIGINT NOT NULL DEFAULT 0,
    "consecutiveUnpaidMonths" INTEGER NOT NULL DEFAULT 0,
    "joiningDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "removedAt" TIMESTAMP(3),
    "removedByUserId" TEXT,

    CONSTRAINT "SubscriberTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auction" (
    "id" TEXT NOT NULL,
    "chitGroupId" TEXT NOT NULL,
    "installmentMonth" INTEGER NOT NULL,
    "auctionDate" TIMESTAMP(3) NOT NULL,
    "status" "AuctionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "isHistoricalEntry" BOOLEAN NOT NULL DEFAULT false,
    "bidDiscount" BIGINT,
    "foremanCommissionRate" DECIMAL(5,2),
    "foremanCommissionAmount" BIGINT,
    "totalDividend" BIGINT,
    "dividendPerTicket" BIGINT,
    "prizeMoney" BIGINT,
    "conductedByUserId" TEXT,
    "finalizedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionWinner" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "wasTieBreakWinner" BOOLEAN NOT NULL DEFAULT false,
    "isSecurityRequired" BOOLEAN NOT NULL DEFAULT false,
    "securityType" TEXT,
    "blankChequeDetails" TEXT,
    "agreementSigned" BOOLEAN NOT NULL DEFAULT false,
    "nomineeSigned" BOOLEAN NOT NULL DEFAULT false,
    "securityDocS3Key" TEXT,
    "verifiedByUserId" TEXT,
    "disbursementStatus" TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "disbursementMode" "DisbursementMode",
    "disbursedAmount" BIGINT,
    "authorizedByUserId" TEXT,
    "disbursedAt" TIMESTAMP(3),
    "paymentReference" TEXT,

    CONSTRAINT "AuctionWinner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionTieBidder" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "bidDiscount" BIGINT NOT NULL,
    "tokenNumber" INTEGER,
    "isWinner" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AuctionTieBidder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionMinutes" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "subscribersPresent" INTEGER NOT NULL,
    "minutesText" TEXT NOT NULL,
    "signedByForeman" BOOLEAN NOT NULL DEFAULT false,
    "filedAtRegistrar" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuctionMinutes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallmentDue" (
    "id" TEXT NOT NULL,
    "chitGroupId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "installmentMonth" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "grossAmount" BIGINT NOT NULL,
    "dividendDeduction" BIGINT NOT NULL DEFAULT 0,
    "netPayableAmount" BIGINT NOT NULL,
    "paidAmount" BIGINT NOT NULL DEFAULT 0,
    "status" "DueStatus" NOT NULL DEFAULT 'UNPAID',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallmentDue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "idempotencyKey" TEXT,
    "transactionRef" TEXT,
    "chequeStatus" TEXT,
    "cashHandoverStatus" TEXT,
    "cashHandoverAcknowledgedByUserId" TEXT,
    "cashHandoverAcknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "installmentDueId" TEXT NOT NULL,
    "amountAllocated" BIGINT NOT NULL,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isBilingual" BOOLEAN NOT NULL DEFAULT true,
    "pdfS3Key" TEXT,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReversal" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "initiatedByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT NOT NULL,
    "reversedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReversal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Branch_code_key" ON "Branch"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_customerCode_key" ON "Customer"("customerCode");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "ChitGroup_groupCode_key" ON "ChitGroup"("groupCode");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriberTicket_chitGroupId_ticketNumber_key" ON "SubscriberTicket"("chitGroupId", "ticketNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriberTicket_chitGroupId_customerId_key" ON "SubscriberTicket"("chitGroupId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Auction_chitGroupId_installmentMonth_key" ON "Auction"("chitGroupId", "installmentMonth");

-- CreateIndex
CREATE UNIQUE INDEX "AuctionWinner_auctionId_key" ON "AuctionWinner"("auctionId");

-- CreateIndex
CREATE UNIQUE INDEX "AuctionWinner_ticketId_key" ON "AuctionWinner"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "AuctionMinutes_auctionId_key" ON "AuctionMinutes"("auctionId");

-- CreateIndex
CREATE UNIQUE INDEX "InstallmentDue_ticketId_installmentMonth_key" ON "InstallmentDue"("ticketId", "installmentMonth");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_paymentId_key" ON "Receipt"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_receiptNumber_key" ON "Receipt"("receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReversal_paymentId_key" ON "PaymentReversal"("paymentId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nominee" ADD CONSTRAINT "Nominee_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerDocument" ADD CONSTRAINT "CustomerDocument_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChitGroup" ADD CONSTRAINT "ChitGroup_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriberTicket" ADD CONSTRAINT "SubscriberTicket_chitGroupId_fkey" FOREIGN KEY ("chitGroupId") REFERENCES "ChitGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriberTicket" ADD CONSTRAINT "SubscriberTicket_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_chitGroupId_fkey" FOREIGN KEY ("chitGroupId") REFERENCES "ChitGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionWinner" ADD CONSTRAINT "AuctionWinner_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionWinner" ADD CONSTRAINT "AuctionWinner_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SubscriberTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionTieBidder" ADD CONSTRAINT "AuctionTieBidder_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionTieBidder" ADD CONSTRAINT "AuctionTieBidder_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SubscriberTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionMinutes" ADD CONSTRAINT "AuctionMinutes_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentDue" ADD CONSTRAINT "InstallmentDue_chitGroupId_fkey" FOREIGN KEY ("chitGroupId") REFERENCES "ChitGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentDue" ADD CONSTRAINT "InstallmentDue_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SubscriberTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SubscriberTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_installmentDueId_fkey" FOREIGN KEY ("installmentDueId") REFERENCES "InstallmentDue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReversal" ADD CONSTRAINT "PaymentReversal_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
