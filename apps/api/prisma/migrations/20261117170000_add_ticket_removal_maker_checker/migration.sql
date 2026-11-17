-- ==============================================================================
-- Migration: 20261117170000_add_ticket_removal_maker_checker
-- Purpose: Enforce Maker != Checker dual control at PostgreSQL engine level
--          on SubscriberTicket table for 3-month defaulter removal approvals.
-- Invariant: Guardrail 10 (Strict dual-control on all financial mutations).
-- ==============================================================================

ALTER TABLE "SubscriberTicket" DROP CONSTRAINT IF EXISTS "chk_ticket_removal_maker_checker";
ALTER TABLE "SubscriberTicket"
ADD CONSTRAINT "chk_ticket_removal_maker_checker"
CHECK (
  ("removalRequestedByUserId" IS NULL OR "removedByUserId" IS NULL OR "removalRequestedByUserId" != "removedByUserId")
);
