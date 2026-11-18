-- ==============================================================================
-- Migration: 20261118124500_case_insensitive_payout_ref_index
-- Purpose: Upgrade uq_auction_winner_non_cash_payment_ref on AuctionWinner to
--          enforce case-insensitive, whitespace-trimmed uniqueness via
--          UPPER(BTRIM("paymentReference")) across all DISBURSED non-cash modes
--          (Cheque, NEFT, RTGS, IMPS), preventing case-variant UTR duplicates
--          (e.g. "utr-123" vs "UTR-123") at the PostgreSQL 17 engine level.
-- Remediation: CR-DISB-05 (Module 6 Round-3 Audit).
-- ==============================================================================

-- Step 1: Safely deduplicate any pre-existing case/whitespace duplicate non-cash references
WITH ranked_ci_duplicates AS (
  SELECT
    id,
    "paymentReference",
    ROW_NUMBER() OVER (
      PARTITION BY UPPER(BTRIM("paymentReference"))
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
    AND UPPER(BTRIM("paymentReference")) NOT IN (
      'COMPANY_POOL_MONTH_1',
      'FINAL_SETTLEMENT_MONTH_N',
      'FINAL_SETTLEMENT_PREPARED',
      'FINAL_SETTLEMENT_APPROVED'
    )
)
UPDATE "AuctionWinner" aw
SET "paymentReference" = BTRIM(aw."paymentReference") || '-LEGACY-' || SUBSTRING(aw.id, 1, 8)
FROM ranked_ci_duplicates rd
WHERE aw.id = rd.id
  AND rd.rn > 1;

-- Step 2: Replace partial unique index with case-insensitive trimmed expression index
DROP INDEX IF EXISTS "uq_auction_winner_non_cash_payment_ref";
CREATE UNIQUE INDEX "uq_auction_winner_non_cash_payment_ref"
ON "AuctionWinner" (UPPER(BTRIM("paymentReference")))
WHERE "isHistoricalEntry" = false
  AND "disbursementStatus" = 'DISBURSED'
  AND "disbursementMode" IN (
    'ACCOUNT_PAYEE_CHEQUE'::"DisbursementMode",
    'BANK_TRANSFER_NEFT'::"DisbursementMode",
    'BANK_TRANSFER_RTGS'::"DisbursementMode",
    'BANK_TRANSFER_IMPS'::"DisbursementMode"
  )
  AND "paymentReference" IS NOT NULL
  AND UPPER(BTRIM("paymentReference")) NOT IN (
    'COMPANY_POOL_MONTH_1',
    'FINAL_SETTLEMENT_MONTH_N',
    'FINAL_SETTLEMENT_PREPARED',
    'FINAL_SETTLEMENT_APPROVED'
  );
