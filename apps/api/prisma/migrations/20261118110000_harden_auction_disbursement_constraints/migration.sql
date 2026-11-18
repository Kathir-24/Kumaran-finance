-- ==============================================================================
-- Migration: 20261118110000_harden_auction_disbursement_constraints
-- Purpose:
--   1. Harden chk_auction_maker_checker to enforce dual control across BOTH
--      'COMPLETED' and 'MINUTES_FILED' auction states (closes MINUTES_FILED gap).
--   2. Add chk_auction_non_negative_amounts on Auction and
--      chk_auction_minutes_attendees on AuctionMinutes.
--   3. Harden chk_winner_maker_checker to enforce Maker presence on
--      VERIFIED_BY_MAKER and Maker != Checker + non-null identities on BOTH
--      AUTHORIZED_BY_CHECKER and DISBURSED states (with Month 1 & historical exemptions).
--   4. Add chk_winner_positive_disbursed_amount on AuctionWinner.
--   5. Add partial unique index uq_auction_winner_non_cash_payment_ref on
--      AuctionWinner(paymentReference) to prevent duplicate bank UTR / cheque
--      references across DISBURSED non-cash prize payouts at the DB engine level.
-- Invariants: Guardrails 2, 5, 10 (AGENTS.md) & ADR-14/ADR-19/ADR-25.
-- ==============================================================================

-- Step 1: Harden chk_auction_maker_checker (covers COMPLETED and MINUTES_FILED)
ALTER TABLE "Auction" DROP CONSTRAINT IF EXISTS "chk_auction_maker_checker";
ALTER TABLE "Auction"
ADD CONSTRAINT "chk_auction_maker_checker"
CHECK (
  ("conductedByUserId" IS NULL OR "finalizedByUserId" IS NULL OR "conductedByUserId" <> "finalizedByUserId")
  AND (
    status NOT IN ('COMPLETED'::"AuctionStatus", 'MINUTES_FILED'::"AuctionStatus")
    OR "isHistoricalEntry" = true
    OR (
      ("installmentMonth" = 1 AND "finalizedByUserId" IS NOT NULL)
      OR ("installmentMonth" > 1 AND "conductedByUserId" IS NOT NULL AND "finalizedByUserId" IS NOT NULL)
    )
  )
);

-- Step 2: Non-negative financial snapshots on Auction
ALTER TABLE "Auction" DROP CONSTRAINT IF EXISTS "chk_auction_non_negative_amounts";
ALTER TABLE "Auction"
ADD CONSTRAINT "chk_auction_non_negative_amounts"
CHECK (
  ("bidDiscount" IS NULL OR "bidDiscount" >= 0)
  AND ("foremanCommissionAmount" IS NULL OR "foremanCommissionAmount" >= 0)
  AND ("totalDividend" IS NULL OR "totalDividend" >= 0)
  AND ("dividendPerTicket" IS NULL OR "dividendPerTicket" >= 0)
  AND ("prizeMoney" IS NULL OR "prizeMoney" >= 0)
);

-- Step 3: Minimum 1 subscriber present on AuctionMinutes
ALTER TABLE "AuctionMinutes" DROP CONSTRAINT IF EXISTS "chk_auction_minutes_attendees";
ALTER TABLE "AuctionMinutes"
ADD CONSTRAINT "chk_auction_minutes_attendees"
CHECK ("subscribersPresent" >= 1);

-- Step 4: Harden chk_winner_maker_checker (covers VERIFIED_BY_MAKER, AUTHORIZED_BY_CHECKER, DISBURSED)
ALTER TABLE "AuctionWinner" DROP CONSTRAINT IF EXISTS "chk_winner_maker_checker";
ALTER TABLE "AuctionWinner"
ADD CONSTRAINT "chk_winner_maker_checker"
CHECK (
  ("verifiedByUserId" IS NULL OR "authorizedByUserId" IS NULL OR "verifiedByUserId" <> "authorizedByUserId")
  AND (
    "isHistoricalEntry" = true
    OR (
      ("disbursementStatus" <> 'VERIFIED_BY_MAKER' OR "verifiedByUserId" IS NOT NULL)
      AND (
        "disbursementStatus" NOT IN ('AUTHORIZED_BY_CHECKER', 'DISBURSED')
        OR ("paymentReference" IS NOT NULL AND "paymentReference" = 'COMPANY_POOL_MONTH_1' AND "authorizedByUserId" IS NOT NULL)
        OR ("verifiedByUserId" IS NOT NULL AND "authorizedByUserId" IS NOT NULL)
      )
    )
  )
);

-- Step 5: Strictly positive disbursedAmount when populated on AuctionWinner
ALTER TABLE "AuctionWinner" DROP CONSTRAINT IF EXISTS "chk_winner_positive_disbursed_amount";
ALTER TABLE "AuctionWinner"
ADD CONSTRAINT "chk_winner_positive_disbursed_amount"
CHECK ("disbursedAmount" IS NULL OR "disbursedAmount" > 0);

-- Step 6: Safely deduplicate any pre-existing duplicate non-cash paymentReference rows (e.g. legacy test artifacts)
WITH ranked_duplicates AS (
  SELECT
    id,
    "paymentReference",
    ROW_NUMBER() OVER (
      PARTITION BY "paymentReference"
      ORDER BY "disbursedAt" DESC NULLS LAST, id ASC
    ) AS rn
  FROM "AuctionWinner"
  WHERE "isHistoricalEntry" = false
    AND "disbursementStatus" = 'DISBURSED'
    AND "disbursementMode" IN (
      'ACCOUNT_PAYEE_CHEQUE'::"DisbursementMode",
      'BANK_TRANSFER_NEFT'::"DisbursementMode",
      'BANK_TRANSFER_RTGS'::"DisbursementMode",
      'BANK_TRANSFER_IMPS'::"DisbursementMode"
    )
    AND "paymentReference" IS NOT NULL
    AND "paymentReference" NOT IN (
      'COMPANY_POOL_MONTH_1',
      'FINAL_SETTLEMENT_MONTH_N',
      'FINAL_SETTLEMENT_PREPARED',
      'FINAL_SETTLEMENT_APPROVED'
    )
)
UPDATE "AuctionWinner" aw
SET "paymentReference" = aw."paymentReference" || '-LEGACY-' || SUBSTRING(aw.id, 1, 8)
FROM ranked_duplicates rd
WHERE aw.id = rd.id
  AND rd.rn > 1;

-- Step 7: Partial unique index preventing duplicate bank UTR / cheque references on DISBURSED non-cash payouts
DROP INDEX IF EXISTS "uq_auction_winner_non_cash_payment_ref";
CREATE UNIQUE INDEX "uq_auction_winner_non_cash_payment_ref"
ON "AuctionWinner" ("paymentReference")
WHERE "isHistoricalEntry" = false
  AND "disbursementStatus" = 'DISBURSED'
  AND "disbursementMode" IN (
    'ACCOUNT_PAYEE_CHEQUE'::"DisbursementMode",
    'BANK_TRANSFER_NEFT'::"DisbursementMode",
    'BANK_TRANSFER_RTGS'::"DisbursementMode",
    'BANK_TRANSFER_IMPS'::"DisbursementMode"
  )
  AND "paymentReference" IS NOT NULL
  AND "paymentReference" NOT IN (
    'COMPANY_POOL_MONTH_1',
    'FINAL_SETTLEMENT_MONTH_N',
    'FINAL_SETTLEMENT_PREPARED',
    'FINAL_SETTLEMENT_APPROVED'
  );
