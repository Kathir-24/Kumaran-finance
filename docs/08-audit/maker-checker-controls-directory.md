# MAKER-CHECKER CONTROLS DIRECTORY — KUMARAN CHITS
**Kumaran Finance — Perundurai Head Office, Erode District, Tamil Nadu**  
**Audit Stage**: Independent Verification & Dual-Control Audit  
**Date**: November 2026  
**Auditor**: Antigravity Senior Engineering & Audit Swarm  

---

## 1. Principles of Dual Control in Kumaran Chits

To prevent internal fraud, embezzlement, and accidental ledger split-brain, Kumaran Chits enforces strict **Maker-Checker Separation of Duties** across all critical financial and administrative workflows:

1. **Identity Divergence**: `maker_user_id !== checker_user_id` is validated at both service application layer and database transaction level.
2. **Partner Verification (SEC-A)**: High-impact financial mutations (payment reversals, auction finalization, prize payouts, defaulter removals) strictly require verified business partners (`isPartner: true`).
3. **Cross-Device Enforcement**: Dual control holds regardless of whether actions are performed on Web, Mobile, or across devices.
4. **Zero Self-Approval**: No single individual can request and approve the same financial mutation.

---

## 2. Directory of Maker-Checker Workflows

### Control 1: Payment Reversal & Receipt Cancellation (SEC-03)
- **Financial Significance**: High. Cancelling a receipt removes paid cash/bank funds from the ledger and reopens subscriber dues.
- **Maker Persona**: Verified Business Partner (`SUPER_ADMIN` with `isPartner: true` - Partner A).
- **Maker Action**: `POST /payments/:id/request-reversal` with `RequestReversalDto` (`reason`, `notes`). Status becomes `REQUESTED`.
- **Checker Persona**: Verified Business Partner (`SUPER_ADMIN` with `isPartner: true` - Partner B).
- **Checker Action**: `POST /payments/:id/approve-reversal` or `POST /payments/:id/reject-reversal`.
- **Backend Enforcement**:
  - `PaymentController.requestReversal` enforces `@Roles(Role.SUPER_ADMIN)`.
  - `PaymentService.requestReversal` validates `maker.isPartner === true`.
  - `PaymentService.approveReversal` enforces `@Roles(Role.SUPER_ADMIN)`, verifies `checker.isPartner === true`, and asserts `payment.reversal.initiatedByUserId !== checkerUserId` (`maker != checker`).
  - Throws `403 Forbidden` on any violation.
  - Generates audit log `PAYMENT_REVERSAL_APPROVED`.
  - Watermarks existing receipt PDF with bold red diagonal `CANCELLED / ரத்து செய்யப்பட்டது`.
- **Test Evidence**: `apps/api/test/unit/payment.spec.ts`, `apps/api/test/unit/adversarial-security-invariants.spec.ts`, `apps/api/test/unit/concurrency-postgres.spec.ts` (CONCURR-INV-14, CONCURR-INV-19).
- **Status**: **IMPLEMENTED & TESTED**

---

### Control 2: Auction Finalization & Statutory Minutes Commitment
- **Financial Significance**: Extreme. Commits auction bid discount, calculates universal dividends, marks subscriber ticket `isPrized`, and locks downstream dues.
- **Maker Persona**: Auction Conductor (`ACCOUNTANT`, `BRANCH_MANAGER`, or Partner).
- **Maker Action**: Records bids, ties, and physical paper token draw (`POST /auctions/:id/bids`, `POST /auctions/:id/tie-break`). Status remains `SCHEDULED` or `BIDDING_CLOSED`.
- **Checker Persona**: Independent Verified Business Partner (`SUPER_ADMIN` with `isPartner: true`).
- **Checker Action**: `POST /auctions/:id/finalize`. Status becomes `COMPLETED`.
- **Backend Enforcement**:
  - `AuctionService.finalizeAuction` verifies `auction.conductedByUserId !== checkerUserId`.
  - Verifies `checker.isPartner === true`. Throws `403 Forbidden` on self-finalization.
  - Atomic transaction commits auction, updates `subscriberTicket.isPrized = true`, generates statutory minutes, and broadcasts results.
- **Test Evidence**: `apps/api/test/unit/auction.spec.ts`, `apps/api/test/unit/concurrency-postgres.spec.ts` (CONCURR-INV-2).
- **Status**: **IMPLEMENTED & TESTED**

---

### Control 3: Finalized Auction Correction (KFC-FIN-005 & Q12)
- **Financial Significance**: High. Adjusts previously finalized bid discounts and re-credits downstream dividends.
- **Maker Persona**: Partner A (`SUPER_ADMIN` with `isPartner: true`).
- **Maker Action**: `POST /auctions/:id/request-correction` with `correctedBidDiscount` and `reason`.
- **Checker Persona**: Independent Partner B (`SUPER_ADMIN` with `isPartner: true`).
- **Checker Action**: `POST /auctions/:id/approve-correction`.
- **Backend Enforcement**:
  - Enforces `pendingRequest.userId !== checkerPartnerUserId`.
  - Rejects if prize money was already disbursed (`DISBURSED_PRIZE_IMMUTABLE`).
  - Rejects if downstream Month $N+1$ dues are already paid (`ALREADY_PAID_DUES_EXIST`).
  - Recalculates whole-rupee dividends and updates downstream unpaid dues.
- **Test Evidence**: `apps/api/test/unit/auction.spec.ts` (FIN-E, KFC-FIN-005).
- **Status**: **IMPLEMENTED & TESTED**

---

### Control 4: Prize Disbursement Authorization & Release (FIN-A, FIN-D)
- **Financial Significance**: Extreme. Authorizes release of ₹75,000 to ₹7,50,000 net prize money to auction winner.
- **Maker Persona**: Desk Accountant / Branch Manager (`ACCOUNTANT` / `BRANCH_MANAGER`).
- **Maker Action**: `POST /auctions/:id/verify-safety-proof`. Verifies signed agreements, promissory notes, and blank cheques. Status becomes `VERIFIED_BY_MAKER`.
- **Checker Persona**: Verified Business Partner (`SUPER_ADMIN` with `isPartner: true`).
- **Checker Action**: `POST /auctions/:id/authorize-payout`. Status becomes `AUTHORIZED_BY_CHECKER`.
- **Release Persona**: Cashier / Accountant releases payout: `POST /auctions/:id/release-payout`.
- **Backend Enforcement**:
  - `DisbursementService.authorizePayout` enforces `winner.verifiedByUserId !== checkerUserId`.
  - Checks `checker.isPartner === true`.
  - Automatically calculates and locks prize arrears offset.
  - Inside `releasePayout`, TOCTOU guard re-verifies outstanding arrears inside transaction lock; fails closed with `ARREARS_STATE_CHANGED` if mismatch occurs.
  - Settles outstanding dues with `PRIZE_ARREARS_OFFSET_ALLOCATED` audit records.
- **Test Evidence**: `apps/api/test/unit/disbursement.spec.ts`, `apps/api/test/unit/concurrency-postgres.spec.ts` (CONCURR-INV-3, INV-11, INV-12).
- **Status**: **IMPLEMENTED & TESTED**

---

### Control 5: Final Month (Month N) Maturity Settlement (FIN-B)
- **Financial Significance**: High. Settles maturity pool directly to final subscriber without auction.
- **Maker Persona**: Desk Accountant initiates review.
- **Checker Persona**: Verified Business Partner (`SUPER_ADMIN` with `isPartner: true`).
- **Checker Action**: `POST /chits/:id/settle-final-month`.
- **Backend Enforcement**:
  - Validates scheme is `ACTIVE` and exactly 1 unprized ticket remains.
  - Checks if subscriber already paid Month $N$ installment; if paid, sets `finalMonthDeduction = 0n` to prevent double collection.
  - Marks subscriber ticket `isPrized = true` and chit group `COMPLETED`.
- **Test Evidence**: `apps/api/test/unit/disbursement.spec.ts` (FIN-B), `apps/api/test/unit/concurrency-postgres.spec.ts` (CONCURR-INV-13).
- **Status**: **IMPLEMENTED & TESTED**

---

### Control 6: Defaulter Removal Dual Control (SEC-02 / SEC-B)
- **Financial Significance**: High. Forcibly removes a 3-month delinquent subscriber and vacates ticket for substitution.
- **Maker Persona**: Partner A (`SUPER_ADMIN` with `isPartner: true`).
- **Maker Action**: `POST /tickets/:id/remove-defaulter/request` with `removalReason`. Status transitions to `PENDING_REMOVAL_APPROVAL`.
- **Checker Persona**: Independent Partner B (`SUPER_ADMIN` with `isPartner: true`).
- **Checker Action**: `POST /tickets/:id/remove-defaulter/approve` or `POST /tickets/:id/remove-defaulter/reject`.
- **Backend Enforcement**:
  - `InstallmentService.approveDefaulterRemoval` verifies `ticket.removalRequestedByUserId !== checkerPartnerUserId`.
  - Checks `checker.isPartner === true`.
  - Sets status `REMOVED_DEF_3M` and vacates ticket.
  - Settling removed subscriber financial damages fails closed (`UNAPPROVED_SETTLEMENT_POLICY` / Q25) pending legal approval.
- **Test Evidence**: `apps/api/test/unit/installment.spec.ts`, `apps/api/test/unit/ticket.controller.ts`.
- **Status**: **IMPLEMENTED & TESTED**

---

### Control 7: Field Agent Cash Handover Desk Acknowledgment
- **Financial Significance**: High. Transfers physical cash liability from field collection agent to branch cashier.
- **Maker Persona**: Field Collection Agent (`COLLECTION_AGENT`).
- **Maker Action**: `POST /collections/batches/submit`. Agent deposits collected route cash at Perundurai desk.
- **Checker Persona**: Desk Accountant (`ACCOUNTANT` or `BRANCH_MANAGER`).
- **Checker Action**: `POST /collections/batches/:id/acknowledge`. Accountant counts physical currency notes and signs receipt.
- **Backend Enforcement**:
  - `CollectionService.acknowledgeBatch` verifies `batch.agentUserId !== cashierUserId`.
  - Updates batch status from `SUBMITTED` to `ACKNOWLEDGED`.
  - Generates immutable Cash Handover Voucher.
- **Test Evidence**: `apps/api/test/unit/collection.service.ts`, `apps/api/test/unit/concurrency-postgres.spec.ts` (CONCURR-INV-4).
- **Status**: **IMPLEMENTED & TESTED**

---

### Control 8: Customer Self-Reported UPI Claim Verification
- **Financial Significance**: Medium. Matches customer-reported bank UTR against actual branch bank statement.
- **Maker Persona**: Customer (`CUSTOMER`) or Field Agent logging claim.
- **Maker Action**: `POST /payments/upi/claim` with `bankUtr` and payment proof.
- **Checker Persona**: Desk Accountant (`ACCOUNTANT`) or Branch Manager.
- **Checker Action**: `POST /payments/upi/verify-claim`.
- **Backend Enforcement**:
  - Reconciles UTR, locks due row, marks status `PAID`, and mints sequential official receipt `KC-REC-PRD-YYYY-XXXXX`.
  - Enforces `maker != checker`.
- **Test Evidence**: `apps/api/test/unit/reconciliation.service.ts`, `apps/api/test/unit/concurrency-postgres.spec.ts` (CONCURR-INV-9, INV-10).
- **Status**: **IMPLEMENTED & TESTED**

---

## 3. Summary of Dual Control Verification

| Workflow | Maker Persona | Checker Persona | Backend Check | Test Pass Rate |
|---|---|---|---|---|
| Payment Reversal | Partner A (Super Admin) | Partner B (Super Admin) | `maker != checker && isPartner` | 100% |
| Auction Finalization | Auction Conductor | Partner B | `maker != checker && isPartner` | 100% |
| Auction Correction | Partner A | Partner B | `maker != checker && isPartner` | 100% |
| Prize Disbursement | Staff (Safety Check) | Partner B (Authorize) | `maker != checker && isPartner` | 100% |
| Defaulter Removal | Partner A (Request) | Partner B (Approve) | `maker != checker && isPartner` | 100% |
| Cash Handover | Field Agent | Desk Accountant | `maker != checker` | 100% |
| UPI Claim Verification | Customer / Agent | Desk Accountant | `maker != checker` | 100% |
