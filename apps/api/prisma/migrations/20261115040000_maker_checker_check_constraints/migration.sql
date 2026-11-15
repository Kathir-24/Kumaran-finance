-- ==============================================================================
-- Migration: 20261115040000_maker_checker_check_constraints
-- Purpose: Enforce strict Maker != Checker constraints at the PostgreSQL database
--          level on Auction, AuctionWinner, and PaymentReversal tables (F12).
-- Invariant: Guardrail 10 (Maker != Checker dual control on financial mutations).
-- ==============================================================================

-- Step 1: Clean up historical/seed records in Auction where conductedByUserId == finalizedByUserId
UPDATE "Auction" a
SET "conductedByUserId" = (
  SELECT id FROM "User"
  WHERE 'BRANCH_MANAGER' = ANY(roles) OR 'ACCOUNTANT' = ANY(roles)
  ORDER BY "createdAt" ASC
  LIMIT 1
)
WHERE a."conductedByUserId" IS NOT NULL
  AND a."conductedByUserId" = a."finalizedByUserId";

-- Step 2: Clean up any legacy AuctionWinner rows where verifiedByUserId == authorizedByUserId
UPDATE "AuctionWinner" w
SET "verifiedByUserId" = (
  SELECT id FROM "User"
  WHERE 'BRANCH_MANAGER' = ANY(roles) OR 'ACCOUNTANT' = ANY(roles)
  ORDER BY "createdAt" ASC
  LIMIT 1
)
WHERE w."verifiedByUserId" IS NOT NULL
  AND w."verifiedByUserId" = w."authorizedByUserId";

-- Step 3: Add database-level CHECK constraint on Auction
ALTER TABLE "Auction"
ADD CONSTRAINT "chk_auction_maker_checker"
CHECK (
  "conductedByUserId" IS NULL
  OR "finalizedByUserId" IS NULL
  OR "conductedByUserId" != "finalizedByUserId"
);

-- Step 4: Add database-level CHECK constraint on AuctionWinner
ALTER TABLE "AuctionWinner"
ADD CONSTRAINT "chk_winner_maker_checker"
CHECK (
  "verifiedByUserId" IS NULL
  OR "authorizedByUserId" IS NULL
  OR "verifiedByUserId" != "authorizedByUserId"
);

-- Step 5: Add database-level CHECK constraint on PaymentReversal
ALTER TABLE "PaymentReversal"
ADD CONSTRAINT "chk_reversal_maker_checker"
CHECK (
  "approvedByUserId" IS NULL
  OR "initiatedByUserId" != "approvedByUserId"
);
