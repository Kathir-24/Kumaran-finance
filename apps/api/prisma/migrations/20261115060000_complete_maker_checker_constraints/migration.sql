-- ==============================================================================
-- Migration: 20261115060000_complete_maker_checker_constraints
-- Purpose: Complete and harden Maker != Checker check constraints at the
--          PostgreSQL engine level across Payment, Auction, AuctionWinner,
--          and PaymentReversal tables (F12 remediation).
-- Invariant: Guardrail 10 (Strict dual-control on all financial mutations).
-- ==============================================================================

-- Step 1: Add isHistoricalEntry to AuctionWinner if not present
ALTER TABLE "AuctionWinner" ADD COLUMN IF NOT EXISTS "isHistoricalEntry" BOOLEAN NOT NULL DEFAULT false;

-- Step 2: Backfill isHistoricalEntry from parent Auction records
UPDATE "AuctionWinner" w
SET "isHistoricalEntry" = true
FROM "Auction" a
WHERE w."auctionId" = a.id AND a."isHistoricalEntry" = true;

-- Step 3: Backfill verifiedByUserId for completed final settlements from actual auction maker
UPDATE "AuctionWinner" w
SET "verifiedByUserId" = a."conductedByUserId"
FROM "Auction" a
WHERE w."auctionId" = a.id
  AND w."verifiedByUserId" IS NULL
  AND a."conductedByUserId" IS NOT NULL
  AND a."conductedByUserId" != w."authorizedByUserId";

-- Step 4: Ensure Month 1 statutory company pool has conductedByUserId = NULL
UPDATE "Auction"
SET "conductedByUserId" = NULL
WHERE "installmentMonth" = 1;

-- Step 5: Add database-level CHECK constraint on Payment for physical cash handover
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "chk_payment_cash_handover_maker_checker";
ALTER TABLE "Payment"
ADD CONSTRAINT "chk_payment_cash_handover_maker_checker"
CHECK (
  ("cashHandoverAcknowledgedByUserId" IS NULL OR "recordedByUserId" != "cashHandoverAcknowledgedByUserId")
);

-- Step 6: Replace chk_auction_maker_checker with state-aware constraint
ALTER TABLE "Auction" DROP CONSTRAINT IF EXISTS "chk_auction_maker_checker";
ALTER TABLE "Auction"
ADD CONSTRAINT "chk_auction_maker_checker"
CHECK (
  ("conductedByUserId" IS NULL OR "finalizedByUserId" IS NULL OR "conductedByUserId" != "finalizedByUserId")
  AND (
    status != 'COMPLETED'
    OR "isHistoricalEntry" = true
    OR (
      ("installmentMonth" = 1 AND "finalizedByUserId" IS NOT NULL)
      OR ("installmentMonth" > 1 AND "conductedByUserId" IS NOT NULL AND "finalizedByUserId" IS NOT NULL)
    )
  )
);

-- Step 7: Replace chk_winner_maker_checker with state-aware constraint
ALTER TABLE "AuctionWinner" DROP CONSTRAINT IF EXISTS "chk_winner_maker_checker";
ALTER TABLE "AuctionWinner"
ADD CONSTRAINT "chk_winner_maker_checker"
CHECK (
  ("verifiedByUserId" IS NULL OR "authorizedByUserId" IS NULL OR "verifiedByUserId" != "authorizedByUserId")
  AND (
    "disbursementStatus" != 'DISBURSED'
    OR "isHistoricalEntry" = true
    OR ("paymentReference" IS NOT NULL AND "paymentReference" = 'COMPANY_POOL_MONTH_1' AND "authorizedByUserId" IS NOT NULL)
    OR ("verifiedByUserId" IS NOT NULL AND "authorizedByUserId" IS NOT NULL)
  )
);

-- Step 8: Replace chk_reversal_maker_checker with state-aware constraint
ALTER TABLE "PaymentReversal" DROP CONSTRAINT IF EXISTS "chk_reversal_maker_checker";
ALTER TABLE "PaymentReversal"
ADD CONSTRAINT "chk_reversal_maker_checker"
CHECK (
  ("approvedByUserId" IS NULL OR "initiatedByUserId" != "approvedByUserId")
  AND (status != 'APPROVED' OR "approvedByUserId" IS NOT NULL)
);
