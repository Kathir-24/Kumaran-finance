# Kumaran Chits — Master Known Issues Tracker (KC-01 to KC-13)

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance** (Perundurai, Erode District, Tamil Nadu)  
> **Scope**: Official Known Issues Technical Register & Permanent Resolution Log  
> **Status**: **ALL 13 ISSUES CLOSED WITH EVIDENCE (100% PASS)**  
> **Verification Date**: November 15, 2026  

---

## 1. Master Issue Inventory

| Issue ID | Domain / Area | Severity | Root Cause Summary | Permanent Architectural Solution | Status |
|:---:|---|:---:|---|---|:---:|
| **KC-01** | Statutory Reporting | **HIGH** | Form XXI Ledger double-counted unallocated payments across multi-payment months. | Aggregates distinct allocation sums per ticket and installment due in [statutory-report.service.ts](file:///U:/Kumaran-finance/apps/api/src/report/statutory-report.service.ts). | **CLOSED WITH EVIDENCE** |
| **KC-02** | Legal Compliance | **CRITICAL** | Auction finalization defaulted attendees to 1 (`subscribersPresent \|\| 1`) and signed to `true`. | Enforced mandatory explicit attendance ($\ge 1$) in [auction.service.ts](file:///U:/Kumaran-finance/apps/api/src/auction/auction.service.ts), DTO, and Web form. Zero silent fallbacks. | **CLOSED WITH EVIDENCE** |
| **KC-03** | Audit Trail | **MEDIUM** | Chit group activation lacked an immutable `AuditLog` entry in the transaction. | Added atomic `tx.auditLog.create` (`CHIT_GROUP_ACTIVATED`) with `userId: checkerUserId` inside `withTransactionRetry` in [chit.service.ts](file:///U:/Kumaran-finance/apps/api/src/chit/chit.service.ts). | **CLOSED WITH EVIDENCE** |
| **KC-04** | Audit Trail | **MEDIUM** | Monthly dues generation lacked an audit trail and actor attribution. | Added atomic `tx.auditLog.create` (`INSTALLMENT_DUES_GENERATED`) with `userId: actorUserId \|\| null` and `isIdempotentNoop` detection in [installment.service.ts](file:///U:/Kumaran-finance/apps/api/src/installment/installment.service.ts). | **CLOSED WITH EVIDENCE** |
| **KC-05** | Security / RBAC | **CRITICAL** | Non-partner Super Admin (`isPartner: false`) could execute financial authorizations. | Enforced `SEC-A` guardian requiring `user.isPartner === true` on reversals, payouts, and finalizations. | **CLOSED WITH EVIDENCE** |
| **KC-06** | Data Integrity | **MEDIUM** | Missing application-level pre-check for max 1 ticket per customer in same group (ADR-13). | Added domain validation pre-check returning HTTP 409 Conflict before database unique constraint. | **CLOSED WITH EVIDENCE** |
| **KC-07** | Timezone & Concurrency | **HIGH** | UTC date extraction truncated IST collections; handover lacked row locks. | Fixed [getIstDayRange](file:///U:/Kumaran-finance/apps/api/src/collection/collection.service.ts) to format ISO timestamps via `Asia/Kolkata` timezone; added `ORDER BY id FOR UPDATE` in `acknowledgeHandover`. | **CLOSED WITH EVIDENCE** |
| **KC-08** | Financial State | **HIGH** | Payment reversal did not decrement consecutive unpaid arrears or re-evaluate defaulter flag. | Reversal completion handler recalculates ticket arrears count and restores active status. | **CLOSED WITH EVIDENCE** |
| **KC-09** | Financial Provenance | **CRITICAL** | Prize arrears offsets had no payment allocation, causing reports to substitute due date as payment date. | Queries `AuditLog` (`PRIZE_ARREARS_OFFSET_ALLOCATED`) to extract exact `timestamp` and voucher reference (`OFFSET-{paymentReference}`). Direct adjustments fall back to `DIRECT_ADJUSTMENT` with `paymentDate: null`. | **CLOSED WITH EVIDENCE** |
| **KC-10** | Data Reconciliation | **LOW** | Preliminary report misattributed payments `8256296e` & `db653182` to tickets #8 & #15 instead of #2 & #3. | Ground-truth SQL joins on `chitflow_dev` proved payments belong to Ticket #2 (Ramasamy K) and Ticket #3 (Priya S). | **CLOSED WITH EVIDENCE** |
| **KC-11** | Audit Reconciliation | **LOW** | Conflicting AuditLog UUIDs reported across preliminary checkpoint documents. | Extracted and verified exact on-disk UUIDs for Checkpoint 2F actions from `chitflow_dev`. | **CLOSED WITH EVIDENCE** |
| **KC-12** | E2E Browser Testing | **HIGH** | Test 1 in `09-reports-registers.e2e.spec.ts` failed due to outdated compiled Docker web bundle. | Rebuilt `docker-web` cleanly; recreated `chitflow-web` without touching DB volumes. All 5/5 Playwright tests passed in 10.6s. | **CLOSED WITH EVIDENCE** |
| **KC-13** | Statutory PDF Geometry | **MEDIUM** | Unverified PDF page dimensions, Tamil typography, and print specifications. | Validated PDFKit buffers at 72 pt/in: Receipt (A5 Portrait), Voucher (A5 Landscape), Minutes (A4 Portrait), Passbook (A4 Landscape). Embedded `NotoSansTamil` TrueType fonts verified. | **CLOSED WITH EVIDENCE** |

---

## 2. Technical Details & Verification Evidence

### KC-01: Form XXI Continuous Ledger Summary Summation
- **Affected File**: `apps/api/src/report/statutory-report.service.ts`
- **Root Cause**: The schedule summation loop accumulated payments across unallocated rows when multiple partial allocations existed in the same month.
- **Permanent Solution**: Enforced ticket-scoped grouping and distinct allocation lookups per installment due ID.
- **Verification**: Verified in `apps/api/test/unit/report.spec.ts` (`should return continuous 20-month schedule with paid amounts and arrears`).

### KC-02: Statutory Attendance & Foreman Signature Fabrication
- **Affected Files**: `apps/api/src/auction/auction.service.ts`, `apps/api/src/auction/dto/finalize-auction.dto.ts`, `apps/web/src/components/auctions/auction-finalize-card.tsx`
- **Root Cause**: Silent defaults (`dto?.subscribersPresent || 1` and `?? true`) allowed auction minutes to claim physical attendance and signature without explicit human input.
- **Permanent Solution**: Removed all defaults. Throws `BadRequestException` if `subscribersPresent` is missing, $\le 0$, or non-integer. Web form starts empty (`''`), placeholder `"e.g. 14"`, and `signedByForeman: false`.
- **Verification**: Verified in `apps/api/test/unit/auction.spec.ts:536` (`should throw BadRequestException if subscribersPresent is missing or <= 0`) and web form validation tests.

### KC-03: Chit Group Activation Audit Trail
- **Affected File**: `apps/api/src/chit/chit.service.ts`
- **Root Cause**: Activating a chit group updated status and froze commission without recording an audit event.
- **Permanent Solution**: Added `tx.auditLog.create` (`CHIT_GROUP_ACTIVATED`) with `userId: checkerUserId` inside `withTransactionRetry`.
- **Verification**: Verified in `apps/api/test/unit/chit.spec.ts:58`.

### KC-04: Monthly Dues Generation Audit Trail & Attribution
- **Affected Files**: `apps/api/src/installment/installment.controller.ts`, `apps/api/src/installment/installment.service.ts`
- **Root Cause**: Generation of monthly dues lacked an audit trail and actor attribution (`userId`).
- **Permanent Solution**: Passed `user.id` to service; added atomic `AuditLog` creation (`INSTALLMENT_DUES_GENERATED`) with `isIdempotentNoop` detection.
- **Verification**: Verified in `apps/api/test/unit/installment.spec.ts:74`.

### KC-05: Maker-Checker Partner Distinction (SEC-A)
- **Affected Files**: Security guards and financial controllers.
- **Root Cause**: Super Admins without partner status (`isPartner: false`) could authorize financial mutations.
- **Permanent Solution**: Enforced `SEC-A` guardian requiring `user.isPartner === true` on all financial mutations.
- **Verification**: Verified in `apps/api/test/unit/adversarial-security-invariants.spec.ts` (all 3 financial pairs reject non-partner Super Admin with HTTP 403 Forbidden).

### KC-06: ADR-13 Single Ticket Limit Constraint
- **Affected File**: `apps/api/src/chit/chit.service.ts`
- **Root Cause**: Only database constraint caught duplicate assignment, returning raw P2002 error without application-level response.
- **Permanent Solution**: Added application-level pre-check returning `ConflictException('Customer already holds a ticket in this chit group')`.
- **Verification**: Verified in `apps/api/test/unit/adversarial-security-invariants.spec.ts:241`.

### KC-07: Handover IST Timezone Boundaries & Concurrency
- **Affected Files**: `apps/api/src/collection/collection.service.ts`, `apps/api/test/unit/collection.spec.ts`
- **Root Cause**: String inputs with UTC timestamps past 18:30Z (`2026-11-14T19:00:00Z`) were incorrectly sliced before 'T', extracting the UTC date (`2026-11-14`) instead of the IST date (`2026-11-15`). Concurrency lacked row-level locking.
- **Permanent Solution**: Implemented `getIstDayRange` formatting ISO timestamps via `Asia/Kolkata` timezone and added pessimistic row locking (`ORDER BY id FOR UPDATE`) within `withTransactionRetry`.
- **Verification**: Verified with 7 dedicated boundary unit tests in `apps/api/test/unit/collection.spec.ts:720-760`.

### KC-08: Consecutive Unpaid Arrears Recalculation on Reversal
- **Affected File**: `apps/api/src/payment/payment.service.ts`
- **Root Cause**: Payment reversal did not decrement consecutive unpaid arrears on the subscriber ticket.
- **Permanent Solution**: Updated reversal handler to re-count unpaid dues and update the ticket's consecutive unpaid arrears count and active status.
- **Verification**: Verified in `apps/api/test/unit/payment.spec.ts`.

### KC-09: Prize Arrears Offset Provenance & Timestamp Accuracy
- **Affected Files**: `apps/api/src/report/statutory-report.service.ts`, `apps/api/test/unit/report.spec.ts`
- **Root Cause**: Dues settled via prize offset had no payment allocation, causing reports to fall back to `dueDate` as payment date.
- **Permanent Solution**: Queries `AuditLog` (`PRIZE_ARREARS_OFFSET_ALLOCATED`) to extract exact `timestamp` and voucher reference (`OFFSET-{voucherRef}`). Unproven dues fall back strictly to `DIRECT_ADJUSTMENT` with `paymentDate: null`.
- **Verification**: Verified in `apps/api/test/unit/report.spec.ts:520-650` across single offset, multiple offsets, missing voucher references, and unproven adjustments.

### KC-10: Synthetic Payment Attribution Ground Truth
- **Root Cause**: Preliminary report misattributed payments `8256296e` & `db653182` to tickets #8 & #15 instead of #2 & #3.
- **Permanent Solution**: Ground-truth SQL joins on `chitflow_dev` proved payments belong to Ticket #2 (Ramasamy K) and Ticket #3 (Priya S).
- **Verification**: Read-only SQL joins on PostgreSQL 17.

### KC-11: Checkpoint 2F Audit Log UUID Reconciliation
- **Root Cause**: Conflicting AuditLog UUIDs reported across preliminary documents.
- **Permanent Solution**: Verified exact on-disk UUIDs in `chitflow_dev` for all Checkpoint 2F actions.
- **Verification**: Read-only SQL query on `AuditLog` table.

### KC-12: Reports/Registers Browser E2E Test Suite
- **Affected Files**: Docker web container and Playwright suite `e2e/09-reports-registers.e2e.spec.ts`.
- **Root Cause**: Container `chitflow-web` had an outdated compiled bundle where `/reports/audit-logs` link was unconditionally present.
- **Permanent Solution**: Rebuilt `docker-web` image cleanly; recreated container safely without touching database volumes.
- **Verification**: Executed `playwright test e2e/09-reports-registers.e2e.spec.ts`: **5/5 tests passed in 10.6s**.

### KC-13: Statutory PDF Geometry, Tamil Unicode Typography & Print Standards
- **Affected Files**: `apps/api/src/pdf/` templates and generator.
- **Root Cause**: Page dimensions and Tamil Unicode rendering unverified against statutory specifications.
- **Permanent Solution**: Inspected PDFKit document buffers at 72 pt/in: Receipt (A5 Portrait), Voucher (A5 Landscape), Minutes (A4 Portrait), Passbook (A4 Landscape). Embedded `NotoSansTamil` TrueType fonts verified.
- **Verification**: `scripts/test-pdf-geometry.ts` execution and binary PDF header inspection.

---

## 3. Phased Security Findings Tracking (F01–F16)

Following the comprehensive Authentication & Authorization Review on November 15, 2026, 16 findings were registered:

| Phase | Findings | Scope | Current Status | Primary Evidence |
|---|---|---|---|---|
| **Phase 1** | **F01, F02, F03, F04, F10, F16** | Account takeover, credential lifecycle, session vault, revocation cutoffs, TOTP replacement, Edge onboarding | **CLOSED WITH EVIDENCE** (Commit `364399a5`) | `phase1-security-remediation.spec.ts` (39/39), `auth-token-lifecycle.spec.ts` (25/25), `07-postgres-redis-lifecycle.e2e-spec.ts` (6/6) |
| **Phase 2** | **F05, F06, F07, F08, F09, F12** | Month N final settlement two-stage workflow, storage guardians branch scoping & default-deny, customer purview & PAN redaction, subscriber phone masking, payment isolation, database CHECK constraints | **CLOSED WITH EVIDENCE** (Commit `364399a5`) | `phase2-security-remediation.spec.ts` (36/36), `08-maker-checker-db-constraints.e2e-spec.ts` (15/15) |
| **Phase 3** | **F11, F13, F14, F15** | Bull Board Super Admin session auth, atomic Redis OTP attempts Lua script, mobile Dio single-flight refresh, SSE approvals heartbeat | **SCHEDULED (PHASE 3)** | Implementation scheduled for Phase 3 |
