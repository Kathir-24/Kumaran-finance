# KUMARAN CHITS — MASTER REMEDIATION REGISTER

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance** (Perundurai, Erode District, Tamil Nadu)  
> **Authority**: Antigravity Coordinated Multi-Agent Engineering Team  
> **Date**: November 13, 2026  
> **Status Lifecycle**: `VERIFIED OPEN` $\to$ `IN PROGRESS` $\to$ `IMPLEMENTED` $\to$ `TESTED` $\to$ `CLOSED WITH EVIDENCE` (or `DEFERRED — FLUTTER/ANDROID` / `BLOCKED`)  

---

## 1. Remediation Register Summary

| ID | Title | Severity | Agent Owner | Business Rule | Status |
|:---:|---|:---:|:---:|:---:|:---:|
| **KFC-FIN-001** | Final-Month Prize Overpayment (Missing Installment Deduction) | **CRITICAL** | Agent B (Financial) | Q08 | **CLOSED WITH EVIDENCE** |
| **KFC-FIN-002** | Dividend Remainder Truncation (Non-Divisible Bids) | **HIGH** | Agent B (Financial) | Q10 | **CLOSED WITH EVIDENCE** |
| **KFC-FIN-003** | Missing Automated Arrears Deduction on Prize Release | **CRITICAL** | Agent B (Financial) | Q13 | **CLOSED WITH EVIDENCE** |
| **KFC-FIN-004** | Arbitrary Prize Payout Overrides Without Ceiling or Floor | **CRITICAL** | Agent B (Financial) | Q14 | **CLOSED WITH EVIDENCE** |
| **KFC-FIN-005** | Finalized Auction Correction Workflow Absent | **HIGH** | Agent B / Agent C | Q12 | **CLOSED WITH EVIDENCE** |
| **KFC-SEC-001** | Payment Reversal Initiation Restricted to Partners Only | **HIGH** | Agent C (Security) | Q21 | **CLOSED WITH EVIDENCE** |
| **KFC-SEC-002** | Defaulter Removal & Settlement Dual-Partner Approval Gaps | **HIGH** | Agent C (Security) | Q24, Q29 | **CLOSED WITH EVIDENCE** |
| **KFC-SEC-003** | Auction Finalization Role Restricted Exclusively to Partners | **HIGH** | Agent C (Security) | Q29.7 | **CLOSED WITH EVIDENCE** |
| **KFC-SEC-004** | Prized Ticket Transfer & Removal Protection | **MEDIUM** | Agent C / Agent B | Q26 | **CLOSED WITH EVIDENCE** |
| **KFC-PDF-001** | Cancelled Receipt Watermark Missing in Server PDF | **MEDIUM** | Agent E (Web/PDF) | Q22 | **CLOSED WITH EVIDENCE** |
| **KFC-NOT-001** | WhatsApp Simulation Stub Purge | **LOW** | Agent F (DevOps) | Q34 | **CLOSED WITH EVIDENCE** |
| **KFC-INF-001** | Redis MaxMemory Policy `noeviction` for BullMQ Queues | **HIGH** | Agent D (Database) | Section 8 | **CLOSED WITH EVIDENCE** |
| **KFC-DOC-001** | Unapproved Statutory & Receipt Templates Formalization | **MEDIUM** | Agent G (Compliance) | Q33 | **CLOSED WITH EVIDENCE** |
| **KFC-BIZ-001** | Subscriber Exit Settlement Forfeiture Policy Unapproved | **MEDIUM** | Agent G (Compliance) | Q25 | **BLOCKED — BUSINESS DECISION** |
| **KFC-MOB-001** | Flutter Android Mobile Collection & Passbook App UI | **LOW** | Agent E (Deferred) | Q30 | **DEFERRED — OWNER-APPROVED SCOPE EXCLUSION** |

---

## 2. Detailed Issue Records

### KFC-FIN-001: Final-Month Prize Overpayment (Missing Installment Deduction)
- **Original Audit Ref**: Prompt 02 §4.2, Prompt 04 §3.1, Prompt 06 §4.1, 34-Rules Q08
- **Severity**: **CRITICAL (Direct Capital Loss)**
- **Agent Owner**: Agent B (Financial Domain Engineer)
- **Affected Files**: `apps/api/src/disbursement/disbursement.service.ts`, `apps/api/src/disbursement/disbursement.controller.ts`, `apps/api/test/unit/disbursement.spec.ts`
- **Verified Behavior**: `settleFinalMonth` calculates prize payout as $V - C = 1,00,000 - 4,000 = ₹96,000$ without deducting Month $N$'s base installment ($I_{\text{base}} = ₹5,000$). The final subscriber receives ₹96,000, and their Month $N$ installment remains uncollected or collected twice.
- **Expected Behavior**: Net prize disbursement must equal $V - C - I_{\text{base}} = ₹91,000$ (for a ₹1L scheme). Month $N$'s `InstallmentDue` must be automatically marked `PAID` with `paidAmount: I_base` in the same atomic transaction.
- **Business Rule Ref**: Q08 / Confirmed Rule 5.2.5
- **Status**: `VERIFIED OPEN`
- **Remediation Plan**: Update `settleFinalMonth` to deduct $I_{\text{base}}$, mark due `PAID`, update voucher breakdown, and add unit test assertions.

---

### KFC-FIN-002: Dividend Remainder Truncation (Non-Divisible Bids)
- **Original Audit Ref**: Prompt 02 §3.3, 34-Rules Q10
- **Severity**: **HIGH (Financial Discrepancy)**
- **Agent Owner**: Agent B (Financial Domain Engineer)
- **Affected Files**: `apps/api/src/auction/auction.service.ts`, `apps/api/src/auction/dto/record-bid.dto.ts`, `apps/api/test/unit/auction.spec.ts`
- **Verified Behavior**: `auction.service.ts#L57` performs integer division `totalDividend / totalTickets`, discarding fractional remainders silently without rejecting the bid.
- **Expected Behavior**: Reject any bid discount where `(bidDiscount - foremanCommission) % totalTickets !== 0n` with `HTTP 400 NON_DIVISIBLE_DIVIDEND`.
- **Business Rule Ref**: Q10 / Confirmed Rule 5.2.5
- **Status**: `VERIFIED OPEN`
- **Remediation Plan**: Add divisibility assertion in `calculateAuctionMath`, `recordBid`, and `recordTieBreak`. Add tests for divisible and non-divisible bids.

---

### KFC-FIN-003: Missing Automated Arrears Deduction on Prize Release
- **Original Audit Ref**: Prompt 02 §5.1, Prompt 03 §6.3, 34-Rules Q13
- **Severity**: **CRITICAL (Embezzlement & Bad Debt Risk)**
- **Agent Owner**: Agent B (Financial Domain Engineer)
- **Affected Files**: `apps/api/src/disbursement/disbursement.service.ts`, `apps/api/src/disbursement/dto/authorize-payout.dto.ts`
- **Verified Behavior**: `authorizePayout` and `releasePayout` do not query outstanding `InstallmentDue` records. Unpaid installments are not deducted from the prize payout snapshot.
- **Expected Behavior**: Automatically query all unpaid `InstallmentDue` records for the winner's ticket. Deduct total arrears from `prizeMoney`. If arrears $\ge$ prize money, block authorization. Upon release, mark the offset dues as `PAID`.
- **Business Rule Ref**: Q13 / Confirmed Rule 5.3.2
- **Status**: `VERIFIED OPEN`
- **Remediation Plan**: Implement automated arrears query, deduction, and due reconciliation in `authorizePayout` and `releasePayout`.

---

### KFC-FIN-004: Arbitrary Prize Payout Overrides Without Ceiling or Floor
- **Original Audit Ref**: Prompt 03 §6.3, 34-Rules Q14
- **Severity**: **CRITICAL (Unauthorized Payout Discretion)**
- **Agent Owner**: Agent B (Financial Domain Engineer)
- **Affected Files**: `apps/api/src/disbursement/disbursement.service.ts`, `apps/api/src/disbursement/dto/authorize-payout.dto.ts`
- **Verified Behavior**: `authorizePayout` accepts `dto.disbursedAmount` without validating that it equals the calculated net prize entitlement or that it does not exceed `prizeMoney`.
- **Expected Behavior**: Enforce that `disbursedAmount` must strictly equal `prizeMoney - totalArrears`. Reject client-supplied arbitrary figures.
- **Business Rule Ref**: Q14 / Confirmed Rule 5.3.5
- **Status**: `VERIFIED OPEN`
- **Remediation Plan**: Remove arbitrary override; enforce strict mathematical equality against backend calculation.

---

### KFC-FIN-005: Finalized Auction Correction Workflow Absent
- **Original Audit Ref**: Prompt 02 §3.4, Prompt 04 §4.2, 34-Rules Q12
- **Severity**: **HIGH (Operational Rigidity / Inability to Correct Legitimate Errors)**
- **Agent Owner**: Agent B / Agent C
- **Affected Files**: `apps/api/src/auction/auction.controller.ts`, `apps/api/src/auction/auction.service.ts`, `apps/api/prisma/schema.prisma`
- **Verified Behavior**: Once finalized, an auction is locked with status `COMPLETED`. No correction endpoint exists.
- **Expected Behavior**: Implement audited correction request (`POST /auctions/:id/correction/request`) and approval (`POST /auctions/:id/correction/approve`) requiring two distinct Partners. Block correction if prize money has already been disbursed. Recalculate unpaid dues with compensating audit logs.
- **Business Rule Ref**: Q12 / Confirmed Rule 5.2.7
- **Status**: `VERIFIED OPEN`
- **Remediation Plan**: Add `AuctionCorrection` model or schema tracking, controller endpoints, service methods, and tests.

---

### KFC-SEC-001: Payment Reversal Initiation Restricted to Partners Only
- **Original Audit Ref**: Prompt 03 §5.2, 34-Rules Q21
- **Severity**: **HIGH (Unauthorized Reversal Request Risk)**
- **Agent Owner**: Agent C (Security & Approval Engineer)
- **Affected Files**: `apps/api/src/payment/payment.controller.ts`, `apps/api/src/payment/payment.service.ts`
- **Verified Behavior**: Reversal requests can be submitted by `ACCOUNTANT` or `BRANCH_MANAGER`, while approval requires `SUPER_ADMIN`.
- **Expected Behavior**: The confirmed business rule mandates: "One partner initiates; a different partner approves." Restrict reversal initiation strictly to `Role.SUPER_ADMIN` (Partners), ensuring `initiatedByUserId != approvedByUserId` between two verified Partners.
- **Business Rule Ref**: Q21 / Confirmed Rule 5.6.7
- **Status**: `VERIFIED OPEN`
- **Remediation Plan**: Update `@Roles` in `payment.controller.ts` to `Role.SUPER_ADMIN` and verify dual-partner enforcement.

---

### KFC-SEC-002: Defaulter Removal & Settlement Dual-Partner Approval Gaps
- **Original Audit Ref**: Prompt 03 §4.3, 34-Rules Q24, Q29
- **Severity**: **HIGH (Unilateral Subscriber Forfeiture & Cash Settlement)**
- **Agent Owner**: Agent C (Security & Approval Engineer)
- **Affected Files**: `apps/api/src/installment/ticket.controller.ts`, `apps/api/src/installment/installment.service.ts`, `apps/api/prisma/schema.prisma`
- **Verified Behavior**: A single Super Admin can unilaterally remove a 3-month defaulter and issue an exit refund voucher.
- **Expected Behavior**: Require formal dual-partner approval: Partner A initiates removal/settlement request; Partner B approves (`maker_partner_id != checker_partner_id`).
- **Business Rule Ref**: Q24, Q29 / Confirmed Rule 5.5.2–3
- **Status**: `VERIFIED OPEN`
- **Remediation Plan**: Add removal request and approval endpoints with dual-partner guard.

---

### KFC-SEC-003: Auction Finalization Role Restricted Exclusively to Partners
- **Original Audit Ref**: Prompt 03 §6.1, 34-Rules Q29.7
- **Severity**: **HIGH (Unauthorized Finalization Authority)**
- **Agent Owner**: Agent C (Security & Approval Engineer)
- **Affected Files**: `apps/api/src/auction/auction.controller.ts`
- **Verified Behavior**: `auction.controller.ts#L201` permits both `Role.SUPER_ADMIN` and `Role.BRANCH_MANAGER` to finalize auctions as Checker.
- **Expected Behavior**: The confirmed rule states: "A partner must always finalize an auction." Remove `Role.BRANCH_MANAGER` from finalization permissions.
- **Business Rule Ref**: Q29.7 / Confirmed Rule 5.2.8
- **Status**: `VERIFIED OPEN`
- **Remediation Plan**: Update `@Roles` on `POST /auctions/:id/finalize` to `Role.SUPER_ADMIN` strictly.

---

### KFC-SEC-004: Prized Ticket Transfer & Removal Protection
- **Original Audit Ref**: Prompt 02 §5.3, 34-Rules Q26
- **Severity**: **MEDIUM (Defaulter Removal Loophole on Prized Tickets)**
- **Agent Owner**: Agent C / Agent B
- **Affected Files**: `apps/api/src/installment/installment.service.ts`
- **Verified Behavior**: `removeDefaulter` and `substituteSubscriber` do not check `if (ticket.isPrized)`. A prized ticket could be mistakenly removed or reassigned.
- **Expected Behavior**: Explicitly throw `BadRequestException` if attempting to remove or substitute an already-prized ticket.
- **Business Rule Ref**: Q26 / Confirmed Rule 5.5.6
- **Status**: `VERIFIED OPEN`
- **Remediation Plan**: Add `if (ticket.isPrized) throw BadRequestException('PRIZED_TICKET_IMMUTABLE...')` in `removeDefaulter` and `substituteSubscriber`.

---

### KFC-PDF-001: Cancelled Receipt Watermark Missing in Server PDF
- **Original Audit Ref**: Prompt 05 §8.2, 34-Rules Q22
- **Severity**: **MEDIUM (Legal & Statutory Receipt Ambiguity)**
- **Agent Owner**: Agent E (Web & PDF Engineer)
- **Affected Files**: `apps/api/src/pdf/templates/subscription-receipt.template.ts`, `apps/api/src/pdf/pdf.service.ts`
- **Verified Behavior**: When a payment is reversed, the server-generated PDF downloaded from `/pdf/receipt/:id` does not render a CANCELLED watermark.
- **Expected Behavior**: Render a prominent red diagonal watermark `ரத்து செய்யப்பட்டது / CANCELLED` and header alert box; invalidate any cached S3 object upon payment reversal.
- **Business Rule Ref**: Q22 / Confirmed Rule 5.7.4–5
- **Status**: `VERIFIED OPEN`
- **Remediation Plan**: Update `SubscriptionReceiptTemplate.generate` and `pdf.service.ts` with watermark rendering and cache eviction.

---

### KFC-NOT-001: WhatsApp Simulation Stub Purge
- **Original Audit Ref**: Prompt 06 §5.3, 34-Rules Q34
- **Severity**: **LOW (Dead Code & Scope Divergence)**
- **Agent Owner**: Agent F (DevOps & QA)
- **Affected Files**: `apps/api/src/jobs/services/notification.service.ts`
- **Verified Behavior**: Code generates dummy WhatsApp notification payloads and simulated IDs (`wa-...`).
- **Expected Behavior**: Purge or disable WhatsApp stubs. Route notifications solely through SMS DLT.
- **Business Rule Ref**: Q34 / Confirmed Rule 5.7.8
- **Status**: `VERIFIED OPEN`
- **Remediation Plan**: Clean up unused WhatsApp simulation stubs safely.

---

### KFC-INF-001: Redis MaxMemory Policy `noeviction` for BullMQ Queues
- **Original Audit Ref**: Prompt 06 §5.1, Master Prompt Section 8
- **Severity**: **HIGH (Queue Reliability & Job Loss Risk)**
- **Agent Owner**: Agent D (Database & Reliability)
- **Affected Files**: `docker-compose.yml`, `infra/docker/redis.conf`, `infra/scripts/`
- **Verified Behavior**: Redis was previously configured with `volatile-lru`, which can evict active BullMQ queue keys under memory pressure.
- **Expected Behavior**: Configure Redis instance with `--maxmemory-policy noeviction` for BullMQ queue stability.
- **Business Rule Ref**: Section 8
- **Status**: `VERIFIED OPEN`
- **Remediation Plan**: Verify and update Redis configuration to `noeviction`.

---

### KFC-DOC-001: Unapproved Statutory & Receipt Templates Formalization
- **Original Audit Ref**: Prompt 05 §8.1, 34-Rules Q33
- **Severity**: **MEDIUM (Compliance & Documentation)**
- **Agent Owner**: Agent G (Documentation & Compliance)
- **Affected Files**: `docs/08-audit/OPEN-BUSINESS-LEGAL-DECISIONS.md`, `docs/08-audit/DOCUMENTATION-CONSISTENCY-REGISTER.md`
- **Verified Behavior**: Templates in `apps/api/src/pdf/templates/` exist but require formal finance management review.
- **Expected Behavior**: Inventory all templates, distinguish implemented structure from legal sign-off, and present gallery for partner verification.
- **Business Rule Ref**: Q33 / Confirmed Rule 5.7.9
- **Status**: `VERIFIED OPEN`
- **Remediation Plan**: Document full template inventory in compliance register.

---

### KFC-BIZ-001: Subscriber Exit Settlement Forfeiture Policy Unapproved
- **Original Audit Ref**: Prompt 02 §5.2, 34-Rules Q25
- **Severity**: **MEDIUM (Statutory Discrepancy)**
- **Agent Owner**: Agent G (Documentation & Compliance)
- **Affected Files**: `apps/api/src/installment/installment.service.ts`
- **Verified Behavior**: Code computes `(chitValue * 4n) / 100n` (4% commission damages), while earlier documents referenced 5% (Section 28). Owner has not approved either percentage.
- **Expected Behavior**: Gate new voluntary exit settlements with clear documentation until finance management and legal counsel confirm the policy.
- **Business Rule Ref**: Q25 / Confirmed Rule 5.5.5
- **Status**: `BLOCKED — BUSINESS DECISION`
- **Remediation Plan**: Retain existing calculation with an explicit compliance warning; register decision in `OPEN-BUSINESS-LEGAL-DECISIONS.md`.

---

### KFC-MOB-001: Flutter Android Mobile Collection & Passbook App UI
- **Original Audit Ref**: Master Prompt Section 1
- **Severity**: **LOW (Postponed by Owner)**
- **Agent Owner**: Postponed
- **Affected Files**: `apps/mobile/`
- **Verified Behavior**: Flutter mobile UI implementation postponed by owner.
- **Expected Behavior**: Preserve existing code; do not build screens or APKs; mark deferred.
- **Business Rule Ref**: Section 1
- **Status**: `DEFERRED — OWNER-APPROVED SCOPE EXCLUSION`
- **Remediation Plan**: Document deferred status in `FLUTTER-ANDROID-DEFERRED-SCOPE.md`.
