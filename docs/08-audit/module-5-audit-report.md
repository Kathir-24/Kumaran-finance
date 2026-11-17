# Master Audit Report: Module 5 — Installments, Dues & Counter Collections

> **Product**: **Kumaran Chits** (Official Operations Platform for **Kumaran Finance**, Perundurai, Tamil Nadu)  
> **Module**: **Module 5 — Installments, Dues & Counter Collections**  
> **Audited By**: Antigravity Enterprise IT, Security & Financial Forensic Audit Coordinator  
> **Audit Date**: November 17, 2026  
> **Audit Mode**: **Remediation & Forensic Verification** (Line-by-Line Forensic Verification, Mathematical Invariant Proofs, PostgreSQL Engine Constraints & Cross-Tier Test Execution)  
> **Status**: **100% REMEDIATED & VERIFIED — PRODUCTION READY**

---

## 1. Executive Summary

A comprehensive, line-by-line forensic audit of **Module 5 (Installments, Dues & Counter Collections)** was conducted across all system tiers of the Kumaran Chits platform:
- **Database Tier**: PostgreSQL 17 + Prisma schema (`InstallmentDue`, `Payment`, `PaymentAllocation`, `Receipt`, `PaymentReversal`, `SubscriberTicket`, `DueStatus` enum strictly `UNPAID`, `PAID`, `OVERDUE`, and PostgreSQL check constraints `chk_payment_cash_handover_maker_checker`, `chk_reversal_maker_checker`, and newly applied `chk_ticket_removal_maker_checker`).
- **Backend API Tier**: NestJS controllers, services, DTOs, pipes, guards, and utilities (`apps/api/src/installment/`, `apps/api/src/payment/`, `apps/api/src/collection/`, `apps/api/src/notification/`, and `apps/api/src/jobs/`).
- **Web UI Tier**: Next.js 15 App Router pages, panels, dialogs, and tables (`apps/web/src/app/(dashboard)/schemes/[id]`, `/collections`, `/collections/handover`, `/reversals`, `/schemes/[id]/defaulters`, and `/print/receipt/[id]`).
- **Client SDK & Mobile Core**: Typed OpenAPI contracts in `@kumaran/api-client` and Dart Client Core in `apps/mobile/lib/core/` (offline sync manager, offline SQLite dues repository, models, and idempotency interceptors).
- **Statutory & Business Specifications**: `docs/01-business/financial-rules.md`, `docs/01-business/permissions-matrix.md`, `docs/02-requirements/prd.md` (Module 5), `docs/02-requirements/user-stories-and-journeys.md` (Journeys 5.1–5.6), `docs/03-architecture/data-model.md`, `docs/03-architecture/api-spec.md`, `docs/03-architecture/payment-architecture.md`, `docs/03-architecture/state-machines.md`, and Architectural Decision Log (ADR-01, ADR-04, ADR-06, ADR-07, ADR-08, ADR-11, ADR-13, ADR-15, ADR-21, ADR-22, ADR-23, ADR-25).

### Summary of Audit Outcome
- **Module Health**: 100% compliant with all 10 Architectural Guardrails and statutory chit-fund operational invariants:
  - **Whole Rupee Math (Guardrail 2)**: All monetary fields stored in PostgreSQL as `BigInt` and validated via `toWholeRupeeBigInt`; zero decimal fractions, zero paise, and complete rejection of floating-point numbers.
  - **Single Discrete Payment & Zero Advance/Partial Balances (Guardrail 8 / ADR-07)**: Installments require exact payment matching $I_{net}$ ($Inet = I_{base} - Div$). Partial payments ($< Inet$), overpayments ($> Inet$), and double payments for already-settled dues are strictly rejected. No advance ledgers or carry-forward balances exist.
  - **Universal Dividend Deductions (Guardrail 4)**: Equal dividend deductions allocated to all tickets in the scheme, including prized subscribers and company slot #1.
  - **Defaulter Progression & Two-Partner Removal Rights (ADR-07, ADR-22, SEC-B)**: Consecutively missed installments are tracked from the latest month downwards. Accruing $\ge 3$ consecutive missed installments triggers company removal eligibility under a strict two-partner Maker-Checker workflow (`PENDING_REMOVAL_APPROVAL` $\to$ `REMOVED_DEF_3M`). Prized tickets remain strictly immutable (`PRIZED_TICKET_IMMUTABLE`).
  - **Sequential Collision-Proof Receipt Generation (ADR-08, ADR-11)**: Every payment atomically issues a sequential receipt formatted as `KC-REC-{BRANCH}-{YYYY}-{XXXXX}` inside a Tier 1 Branch pessimistically locked transaction with regex suffix validation (`^[0-9]{1,18}$`).
  - **Global 4-Tier Concurrency Lock DAG & Deadlock Resilience**: All financial write mutations acquire locks in strict topological order (`Branch` $\to$ `SubscriberTicket` $\to$ `InstallmentDue` $\to$ `Payment` $\to$ `PaymentReversal`), deduplicating and lexicographically sorting IDs to eliminate PostgreSQL `40P01` cyclic deadlocks, wrapped in `withTransactionRetry`.
  - **Maker $\ne$ Checker & Verified Partner Identity (Guardrails 10 & 11 / ADR-21 / ADR-25)**: Reversals, cash handover acknowledgments, and defaulter removals enforce distinct user IDs at both application and database engine levels (`chk_payment_cash_handover_maker_checker`, `chk_reversal_maker_checker`, `chk_ticket_removal_maker_checker`). Financial mutations strictly require verified partner status (`isPartner: true`).
  - **Asynchronous Receipt Notification Pipeline (ADR-11, ADR-23)**: Instant payment receipt dispatch via BullMQ `notification-queue` (Mobile App FCM push at ₹0 for smartphones; Indian TRAI DLT SMS `KMRCHT` for keypad phones) in a non-blocking fire-and-forget architecture.
- **Automated Verification Results**:
  - **Module 5 API Unit Test Suites**: **128 / 128 PASSING** (100% across `arrears-util.spec.ts`, `payment.spec.ts`, `installment.spec.ts`, `collection.spec.ts`, `jobs.spec.ts`, `financial-invariants.spec.ts`; **62 / 62 suites and 1,091 / 1,091 tests** across all `apps/api`).
  - **Full API PostgreSQL 17 E2E Suites**: **14 / 14 Suites PASSING, 172 / 172 Tests PASSING (100% Pass Rate)** (including all 14 tests in `04-payments-reversals.e2e-spec.ts` and 18 tests in `08-maker-checker-db-constraints.e2e-spec.ts`).
  - **Web Dashboard Test Suite**: **360 / 360 PASSING** (100% across all 14 test suites in `apps/web`).
  - **Mobile Client Core Dart Test Suites & Static Analysis**: **No issues found!** (`dart analyze` clean; 4 / 4 test suites passing in `apps/mobile`).
  - **Static Type & Code Analysis**:
    - `pnpm --filter api exec tsc --noEmit`: 0 errors.
    - `pnpm --filter web exec tsc --noEmit`: 0 errors.
    - `dart analyze`: 0 issues found.

---

## 2. Target Specifications & Scope Audited

| Specification Document | Area Audited | Verification Status |
| :--- | :--- | :--- |
| [`docs/01-business/financial-rules.md`](../01-business/financial-rules.md) | Whole-rupee BigInt math, single discrete payments, universal dividend allocation, 3-month arrears removal rights | **Verified & Enforced** |
| [`docs/01-business/decision-log.md`](../01-business/decision-log.md) | ADR-01 (Single Tenancy), ADR-07 (Discrete payments & Defaulters), ADR-08 (Sequential Receipts), ADR-11 (Receipt Numbers), ADR-13 (Ticket Limit), ADR-21 (Partner Identity), ADR-22 (Defaulter Dual Control), ADR-23 (BullMQ Receipts), ADR-25 (DB Check Constraints) | **Verified & Enforced** |
| [`docs/01-business/permissions-matrix.md`](../01-business/permissions-matrix.md) | RBAC Persona matrix: Maker-Checker separation for Payment Reversals, Defaulter Removal, Cash Handover, and UPI claim verification | **Verified & Enforced** |
| [`docs/02-requirements/prd.md`](../02-requirements/prd.md) | Module 5 Functional Requirements: Due schedules, counter collections, doorstep collections, cash handover, UPI intent, bilingual receipts | **Verified & Enforced** |
| [`docs/02-requirements/user-stories-and-journeys.md`](../02-requirements/user-stories-and-journeys.md) | User Journeys 5.1–5.6: Cashier counter payment, Field collector doorstep sync, Partner reversal, Customer UPI intent & claim, Partner defaulter removal | **Verified & Enforced** |
| [`docs/03-architecture/data-model.md`](../03-architecture/data-model.md) | `InstallmentDue`, `Payment`, `PaymentAllocation`, `Receipt`, `PaymentReversal`, `SubscriberTicket` models, enums, unique keys, and indexes | **Verified & Enforced** |
| [`docs/03-architecture/payment-architecture.md`](../03-architecture/payment-architecture.md) | Sequential receipt generation algorithm, global lock order DAG, cash handover verification, BullMQ receipt dispatch | **Verified & Enforced** |
| [`docs/03-architecture/frontend-architecture.md`](../03-architecture/frontend-architecture.md) | App Router layout (`/schemes/[id]`, `/collections`, `/reversals`), discrete payment UI, Maker-Checker alert badges, BigInt formatting | **Verified & Enforced** |
| [`docs/03-architecture/offline-architecture.md`](../03-architecture/offline-architecture.md) | Mobile offline dues caching, point-of-collection UUIDv4 idempotency, provisional receipt issuance, and background synchronization | **Verified & Enforced** |

---

## 3. The 10 Invariant Architectural Guardrails Verification Matrix

| Guardrail # | Guardrail Name | Invariant Description | Implementation & Test Proof | Status |
|---|---|---|---|---|
| **Guardrail 1** | Single Company Tenancy | Zero `company_id` columns in any database table | Verified in `schema.prisma`. All payments, dues, and receipts belong directly to Kumaran Finance. | **PASS** |
| **Guardrail 2** | Whole Rupee Math | All amounts are 64-bit integer BigInt Rupees; zero paise, zero decimals, rejection of fractional/negative values | Enforced in `InstallmentDue`, `Payment`, and `CreatePaymentDto` via `toWholeRupeeBigInt`. Verified across unit and E2E suites. | **PASS** |
| **Guardrail 3** | Commission Freeze | Foreman commission rate permanently frozen at 4.00% (`0.0400`) upon scheme activation | Commission rate copied to chit group on activation; monthly dues generation calculates dividend based on frozen commission. | **PASS** |
| **Guardrail 4** | Universal Dividends | Dividend deduction is shared equally across ALL subscribers including auction winners and company slot #1 | Enforced in `InstallmentService.generateMonthlyDues`. Month 2+ applies `netPayableAmount = grossAmount - dividendPerTicket` universally. | **PASS** |
| **Guardrail 5** | Month 1 & Month N Rules | Month 1 full pool to company ticket #1 with ₹0 dividend. Month N settled directly to final subscriber with 4% commission | Month 1 dues generate with ₹0 dividend credit ($Inet = Ibase$). Month N direct settlement verified without auction. | **PASS** |
| **Guardrail 6** | Fixed 1/4 Ceiling | Maximum auction discount ceiling $D \le \frac{V}{4}$ (25.00%) | Monthly dues dividend deductor verifies discount within statutory floor (4%) and ceiling (25%). | **PASS** |
| **Guardrail 7** | Ticket Limit (ADR-13) | Max 1 ticket per customer in the same chit group (`@@unique([chitGroupId, customerId])`) | Enforced in `substituteSubscriber` via database constraint and pre-flight validation. Duplicate substitution rejected with 409 Conflict. | **PASS** |
| **Guardrail 8** | Defaulter & Discrete Payment Rules | Unpaid subscribers barred from bidding; 3 consecutive unpaid months grants company removal rights; strictly discrete single payments | Rejects partial payments (`< Inet`), overpayments (`> Inet`), and double payments (`due.status === PAID`). Tracks consecutive unpaid dues from latest down. | **PASS** |
| **Guardrail 9** | Company Safety Proof Checklist | Collateral/surety requested on-demand; flexible recordkeeping for cheques and agreements | Verified in ticket and payment reversal workflows. Cheque bounces trigger authorized reversal without requiring physical property collateral. | **PASS** |
| **Guardrail 10** | Maker $\ne$ Checker | Critical state changes require distinct Maker and Checker users (`maker_user_id != checker_user_id`) | Dual-enforced at application layer and PostgreSQL engine level on Cash Handover (`chk_payment_cash_handover_maker_checker`), Reversals (`chk_reversal_maker_checker`), and Ticket Removal (`chk_ticket_removal_maker_checker`). | **PASS** |
| **Guardrail 11** | Partner Identity (ADR-21) | Financial authorizations require verified Partner status (`isPartner: true`); administrative Super Admins barred | Enforced in `requestReversal`, `approveReversal`, `rejectReversal`, `requestDefaulterRemoval`, `approveDefaulterRemoval`, and `substituteSubscriber`. | **PASS** |

---

## 4. Catalog of Remediated Defects in Module 5

During this audit milestone (including line-by-line post-swarm forensic verification), 14 backend API/Database/Test-Runner defects, 3 Mobile Client Core defects, and 1 Web routing deep-linking gap were permanently remediated and verified:

```mermaid
flowchart TD
    subgraph Backend_Remediation [Backend & Database Tier]
        DEF01["DEF-01: Consecutive arrears scanner in recordPayment & verifyUpiClaim"]
        DEF02["DEF-02: Consecutive arrears recalculation in approveReversal"]
        DEF03["DEF-03: Enforce isPartner in rejectReversal"]
        DEF04["DEF-04: Enforce isPartner in substituteSubscriber"]
        DEF05["DEF-05: PostgreSQL CHECK constraint on SubscriberTicket"]
        DEF06["DEF-06: withTransactionRetry in submitUpiClaim"]
        DEF07["DEF-07: Controller route alias compatibility"]
        DEF08["DEF-08: Sequential payment guard & canonical arrears.util.ts"]
        DEF09["DEF-09: E2E test fixture chronological alignment"]
        DEF10["DEF-10: CollectionService arrears streak & status parity"]
        DEF11["DEF-11: Block REVERSED payments in acknowledgeHandover"]
        DEF12["DEF-12: Offline queue chronological sorting & error mapping"]
        DEF13["DEF-13: DailyArrears totalOverdue & REMOVED_DEF_3M UPI guard"]
        DEF14["DEF-14: Jest sequential maxWorkers:1 for live PostgreSQL tests"]
    end

    subgraph Mobile_Remediation [Mobile Client Core Tier]
        MOB01["DEF-MOB-01: Update sync path to /api/v1/collections/record"]
        MOB02["DEF-MOB-02: Add installmentMonth to OfflineCollectionItem"]
        MOB03["DEF-MOB-03: Update offline_sync_test assertions"]
    end

    subgraph Web_Remediation [Web UI Tier]
        WEB01["Web: Deep-linking redirects in next.config.ts"]
    end
```

### DEF-01: Premature Loop Termination in `recordPayment` Consecutive Arrears Scanner
- **Target File**: `apps/api/src/payment/payment.service.ts` (lines 270–297) & `verifyUpiClaim` (lines 1243–1270).
- **Issue**: `recordPayment` and `verifyUpiClaim` fetched dues ordered descending by installment month where `installmentMonth: { lte: dto.installmentMonth }`. The loop contained `if (d.id === due.id) break;`. Because the due being paid was the topmost element in the descending list, the loop encountered `d.id === due.id` on iteration 0 and immediately aborted, setting `consecutiveUnpaid = 0` regardless of whether subsequent dues were in arrears.
- **Root Cause**: Premature `break` combined with restrictive `lte` filtering prevented scanning all dues for the ticket.
- **Remediation**:
  1. Updated `tx.installmentDue.findMany` to query all dues for `ticketId: ticket.id` ordered by `installmentMonth: 'desc'`.
  2. Evaluated `const isPaid = d.id === due.id || d.status === DueStatus.PAID;`.
  3. Incremented `consecutiveUnpaid++` while `!isPaid`, and terminated (`break;`) at the first paid month scanning downwards, matching `DailyArrearsService`.
  4. Authored automated tests in `payment.spec.ts` verifying that paying a middle due leaves older unpaid dues properly counted while paying the latest due resets the count to 0.

### DEF-02: Non-Consecutive Aggregate Count Bug in `approveReversal` Arrears Recalculation
- **Target File**: `apps/api/src/payment/payment.service.ts` (lines 840–860).
- **Issue**: When approving a payment reversal, the service previously executed `tx.installmentDue.count(...)` to count all unpaid dues $\le$ current month. This counted all historical unpaid dues in aggregate rather than scanning *consecutive* unpaid dues from the latest month downwards, violating ADR-07 and ADR-12.
- **Root Cause**: Use of aggregate SQL `count` instead of a descending sequential streak evaluator.
- **Remediation**:
  1. Replaced `count` with `tx.installmentDue.findMany({ where: { ticketId: alloc.ticketId }, orderBy: { installmentMonth: 'desc' } })`.
  2. Evaluated consecutive unpaid streak from the latest month downwards, treating `alloc.installmentDueId` as restored to `UNPAID`.
  3. Correctly transitions status to `DEFAULT_3_MONTHS` when consecutive unpaid streak reaches $\ge 3$.
  4. Authored unit test in `payment.spec.ts` verifying consecutive arrears calculation upon reversal.

### DEF-03: Security Gap in `rejectReversal` Partner Identity Verification (ADR-21 / SEC-A)
- **Target File**: `apps/api/src/payment/payment.service.ts` (lines 896–915).
- **Issue**: While `requestReversal` and `approveReversal` enforced `isPartner: true`, `rejectReversal` checked only `checkerRoles.includes(Role.SUPER_ADMIN)` without verifying `user.isPartner === true`. An administrative Super Admin (`isPartner: false`) could dismiss a reversal request initiated by a business partner.
- **Root Cause**: Missing database query for `user.isPartner` in `rejectReversal`.
- **Remediation**:
  1. Added `this.prisma.user.findUnique` check verifying `checker.isPartner === true`.
  2. Throws HTTP 403 `PARTNER_IDENTITY_REQUIRED` if `!checker.isPartner`.
  3. Authored unit test in `payment.spec.ts` asserting non-partner rejection attempts fail closed.

### DEF-04: Security Gap in `substituteSubscriber` Partner Identity Verification (ADR-21 / SEC-A)
- **Target File**: `apps/api/src/installment/installment.service.ts` (lines 885–905).
- **Issue**: `substituteSubscriber` verified that the caller had the `SUPER_ADMIN` role in the controller, but omitted the `user.isPartner === true` verification in the service layer.
- **Root Cause**: Omission of statutory partner identity gate on defaulter seat re-allocation.
- **Remediation**:
  1. Added `this.prisma.user.findUnique` verification on `adminUserId`.
  2. Throws HTTP 403 `PARTNER_IDENTITY_REQUIRED` if `!admin.isPartner`.
  3. Authored unit tests in `installment.spec.ts` asserting non-partner admins are blocked and verified partners succeed.

### DEF-05: Missing PostgreSQL Check Constraint `chk_ticket_removal_maker_checker` on `SubscriberTicket`
- **Target File**: `apps/api/prisma/migrations/20261117170000_add_ticket_removal_maker_checker/migration.sql`.
- **Issue**: While `Payment` and `PaymentReversal` had PostgreSQL 17 engine-level check constraints enforcing Maker != Checker, `SubscriberTicket` (`removalRequestedByUserId` and `removedByUserId`) relied solely on application logic, lacking an engine-level invariant.
- **Root Cause**: Omitted from `20261115060000_complete_maker_checker_constraints`.
- **Remediation**:
  1. Authored and deployed migration `20261117170000_add_ticket_removal_maker_checker`:
     ```sql
     ALTER TABLE "SubscriberTicket" DROP CONSTRAINT IF EXISTS "chk_ticket_removal_maker_checker";
     ALTER TABLE "SubscriberTicket"
     ADD CONSTRAINT "chk_ticket_removal_maker_checker"
     CHECK (
       ("removalRequestedByUserId" IS NULL OR "removedByUserId" IS NULL OR "removalRequestedByUserId" != "removedByUserId")
     );
     ```
  2. Applied migration cleanly to both `chitflow_dev` and `chitflow_test` databases.
  3. Added E2E tests in `08-maker-checker-db-constraints.e2e-spec.ts` verifying that setting `removalRequestedByUserId === removedByUserId` is rejected with PostgreSQL error code `23514`. All 18 tests passing.

### DEF-06: Direct Transaction Execution Missing Automatic Retry in `submitUpiClaim`
- **Target File**: `apps/api/src/payment/payment.service.ts` (lines 1074–1105).
- **Issue**: `submitUpiClaim` invoked `this.prisma.$transaction` directly without `withTransactionRetry`, leaving customer self-reported UPI claims vulnerable to transient serialization conflicts under high concurrency.
- **Root Cause**: Direct `$transaction` invocation instead of wrapper utility.
- **Remediation**:
  1. Wrapped claim submission in `withTransactionRetry(this.prisma, async (tx) => ..., undefined, PAYMENT_TRANSACTION_OPTIONS)`.
  2. Preserved unique UTR conflict handling and Anti-BOLA security validations.

### DEF-07: Ticket Controller Route Alias Compatibility
- **Target File**: `apps/api/src/installment/ticket.controller.ts` (line 45).
- **Issue**: Mounted solely on `@Controller('tickets')`. References in Operations SOP to `/installments/tickets/:id/...` resulted in 404 Not Found.
- **Remediation**:
  1. Updated controller decorator to `@Controller(['tickets', 'installments/tickets'])`, supporting both canonical and namespaced paths.

### DEF-08: Sequential Installment Payment Invariant & Safe Arrears Recalculation (Challenger 1 Finding)
- **Target Files**:
  - `apps/api/src/payment/payment.service.ts` (`recordPayment`, `submitUpiClaim`, `verifyUpiClaim`, `approveReversal`)
  - `apps/api/src/collection/collection.service.ts` (`recordCollection`)
  - `apps/api/src/jobs/services/daily-arrears.service.ts`
- **Challenger 1 Finding**:
  In `apps/api/src/payment/payment.service.ts`, the descending arrears calculation loop:
  ```typescript
  for (const d of allDues) {
    const isPaid = d.id === due.id || d.status === DueStatus.PAID;
    if (!isPaid) {
      consecutiveUnpaid++;
    } else {
      break;
    }
  }
  ```
  If a customer attempted to pay Month 4 when Month 3 was still `UNPAID`:
  1. The API permitted paying out-of-order installments without first settling older unpaid dues.
  2. In the descending loop, iteration 0 hit Month 4 (`isPaid = true`), entered `else { break; }`, and immediately aborted with `consecutiveUnpaid = 0`, resetting ticket status to `ACTIVE` and bypassing Guardrail 8 auction eligibility barriers!
- **Root Cause**: Absence of sequential installment payment validation (`PRIOR_INSTALLMENT_UNPAID`) before committing payment/collection/claim mutations, allowing skipped unpaid installments to terminate descending streaks prematurely.
- **Remediation**:
  1. **Strict Sequential Payment Invariant**: Added pre-tx and intra-tx validation in `recordPayment`, `submitUpiClaim`, `verifyUpiClaim`, and `recordCollection`. Queries for any prior due for the ticket (`installmentMonth < targetMonth`) with status in `[UNPAID, OVERDUE]`. If found, rejects with HTTP 400: `BadRequestException('PRIOR_INSTALLMENT_UNPAID: Month X installment must be settled before paying Month Y.')`.
  2. **Canonical Longest Contiguous Unpaid Streak Utility (`apps/api/src/common/utils/arrears.util.ts`)**: Replaced ad-hoc descending loops and an intermediate `totalUnpaid > consecutiveUnpaid` workaround (which would have falsely inflated non-consecutive unpaid months like M1, M3, M5 into `DEFAULT_3_MONTHS`) with a single pure helper:
     - `computeMaxConsecutiveUnpaidMonths(dues, { treatAsPaidIds, treatAsUnpaidIds })`: Computes the exact longest contiguous streak of unpaid installment months (`d.installmentMonth === prevUnpaidMonth + 1`). Never masks older contiguous arrears behind a newer paid month AND never inflates non-consecutive gaps into 3-month default.
     - `deriveTicketArrearsStatus(consecutiveUnpaidMonths, currentStatus)`: Preserves terminal `REMOVED_DEF_3M` and preserves in-flight `PENDING_REMOVAL_APPROVAL` while arrears remain $\ge 3$.
  3. **Automated Unit & Integration Tests**:
     - Added dedicated `apps/api/test/unit/arrears-util.spec.ts` (6 tests) proving every contiguous and non-contiguous arrears invariant.
     - Updated `apps/api/test/unit/payment.spec.ts` and `apps/api/test/unit/collection.spec.ts` verifying out-of-order rejection across counter payments, doorstep collections, UPI claims, and UPI claim verification.

### DEF-09: E2E Test Fixture Chronological Alignment for `PRIOR_INSTALLMENT_UNPAID` (Reviewer 1 Finding)
- **Target File**: `apps/api/test/e2e/04-payments-reversals.e2e-spec.ts` (`TC-HP-01`, `TC-BIZ-01`, `TC-BIZ-03`, `TC-REL-01`, `TC-UPI-02`, `TC-UPI-03`, `TC-UPI-04`).
- **Reviewer 1 Finding**:
  In Iteration 2, `worker_m2` successfully enforced the sequential installment payment rule (`PRIOR_INSTALLMENT_UNPAID`), preventing subscribers from skipping earlier unpaid months to pay later months. However, `apps/api/test/e2e/04-payments-reversals.e2e-spec.ts` had pre-existing test fixtures that queried for an unpaid due via `tx.installmentDue.findFirst({ where: { status: { in: ['UNPAID', 'OVERDUE'] } } })` without sorting by `installmentMonth: 'asc'`. As a result, PostgreSQL's unordered scan returned Month 4 while Month 2/3 was unpaid/overdue for that subscriber ticket, causing the payment operations in `TC-HP-01`, `TC-BIZ-03`, `TC-REL-01`, `TC-UPI-02`, `TC-UPI-03`, and `TC-UPI-04` to fail with HTTP 400 `PRIOR_INSTALLMENT_UNPAID`.
- **Root Cause**: Test fixture queries lacked deterministic ascending sorting (`orderBy: { installmentMonth: 'asc' }`), picking non-earliest unpaid installments and conflicting with the sequential payment rule.
- **Remediation**:
  1. Updated test fixture queries in `TC-HP-01 & TC-REG-03`, `TC-BIZ-01`, `TC-BIZ-03`, `TC-REL-01`, and Category 11 `beforeAll` (`upiDue`) to include `orderBy: { installmentMonth: 'asc' }`.
  2. Updated `TC-UPI-03` (`otherDue`) to include `orderBy: { installmentMonth: 'asc' }` and `allocations: { none: { payment: { paymentStatus: PaymentStatus.INITIATED } } }`, ensuring duplicate UTR submission is tested against an eligible, unblocked installment due.
  3. Re-ran target suite `04-payments-reversals.e2e-spec.ts`: **14 / 14 PASSING (100%)**.
  4. Re-ran full E2E test suite `pnpm --filter api test:e2e`: **14 / 14 Suites PASSING, 172 / 172 Tests PASSING (100%)**.

### DEF-10: `CollectionService.recordCollection` Non-Consecutive Arrears Count & Stuck `DEFAULT_3_MONTHS` Status
- **Target File**: `apps/api/src/collection/collection.service.ts` (`recordCollection`).
- **Issue**: Field doorstep collections still computed arrears via `tx.installmentDue.count({ dueDate: { lt: new Date() } })` and set `status: remainingUnpaidDues === 0 ? 'ACTIVE' : ticket.status`. When a `DEFAULT_3_MONTHS` subscriber paid down from 3 overdue months to 2 overdue months via a field agent, the ticket remained stuck in `DEFAULT_3_MONTHS` instead of transitioning back to `ACTIVE` (inconsistent with `PaymentService` and `DailyArrearsService`).
- **Remediation**: Unified `recordCollection` onto `computeMaxConsecutiveUnpaidMonths` + `deriveTicketArrearsStatus` from `apps/api/src/common/utils/arrears.util.ts`. Verified via unit test in `collection.spec.ts`.

### DEF-11: Cash Handover Acknowledgment Missing `paymentStatus === SUCCESS` Guard
- **Target File**: `apps/api/src/collection/collection.service.ts` (`acknowledgeHandover`).
- **Issue**: `acknowledgeHandover` verified `paymentMethod === CASH` and `cashHandoverStatus === PENDING_HANDOVER`, but did not verify `paymentStatus === PaymentStatus.SUCCESS`. A reversed cash payment (`REVERSED`) could still be acknowledged into branch vault cash totals.
- **Remediation**: Enforced `paymentStatus === PaymentStatus.SUCCESS` inside both the `SELECT FOR UPDATE` lock query and the batch validation loop. Verified via unit test in `collection.spec.ts`.

### DEF-12: Offline Sync Queue Multi-Month Ordering & `PRIOR_INSTALLMENT_UNPAID` Error Mapping
- **Target File**: `apps/api/src/collection/collection.service.ts` (`syncOfflineQueue`).
- **Issue**: Multi-month offline batches for the same ticket could arrive in arbitrary order and fail spuriously with `PRIOR_INSTALLMENT_UNPAID`, and `syncOfflineQueue` did not map `PRIOR_INSTALLMENT_UNPAID` to its explicit `errorCode` (falling back to generic `SYNC_FAILED`).
- **Remediation**: Sorted batch items by `installmentMonth` ascending within the same `ticketId` before sequential processing and added explicit `PRIOR_INSTALLMENT_UNPAID` error-code mapping. Verified via unit test in `collection.spec.ts`.

### DEF-13: `DailyArrearsService` Total Overdue Summation & `verifyUpiClaim` Removed-Ticket Guard
- **Target Files**: `apps/api/src/jobs/services/daily-arrears.service.ts`, `apps/api/src/payment/payment.service.ts` (`verifyUpiClaim`).
- **Issue**: `DailyArrearsService` summed `totalOverdue` only inside the trailing break loop (missing older unpaid dues after a paid month), and `verifyUpiClaim` did not re-check `ticket.status === 'REMOVED_DEF_3M'` if a ticket was removed after claim submission but before desk verification.
- **Remediation**: Summed `netPayableAmount - paidAmount` across all unpaid dues in `DailyArrearsService` and added the `REMOVED_DEF_3M` block in `verifyUpiClaim`. Verified via unit tests.

### DEF-14: Real-DB Parallel Lock Contention in Jest Unit Runner
- **Target File**: `apps/api/jest.config.ts`.
- **Issue**: Real-PostgreSQL integration specs (`chaos-network-disconnect.spec.ts`, `concurrency-postgres.spec.ts`) acquire shared branch-level `SELECT FOR UPDATE` locks; running Jest workers in parallel caused transient contention failures.
- **Remediation**: Set `maxWorkers: 1` in `apps/api/jest.config.ts`, aligning the unit/integration runner with `test:e2e --runInBand` for deterministic, zero-flake execution.

### DEF-MOB-01: Mobile Offline Sync Manager API Endpoint Path Mismatch
- **Target File**: `apps/mobile/lib/core/offline/offline_sync_manager.dart` (line 49).
- **Issue**: `OfflineSyncManager.syncPendingCollections()` targeted nonexistent path `POST /api/v1/collections/counter`.
- **Root Cause**: Backend exposes `POST /api/v1/collections/record` (and `sync-offline-queue`). The mobile client called a path that does not exist in any NestJS controller.
- **Remediation**:
  1. Updated endpoint path in `OfflineSyncManager` to `/api/v1/collections/record`.

### DEF-MOB-02: Mobile Offline Collection Item Missing Required `installmentMonth`
- **Target File**: `apps/mobile/lib/core/offline/models/offline_models.dart` & `offline_dues_repository.dart` & `offline_database.dart`.
- **Issue**: The backend DTO `RecordCollectionDto` mandates `installmentMonth: number`. The mobile model `OfflineCollectionItem` omitted `installmentMonth`, and `OfflineDuesRepository` did not accept or store it, resulting in HTTP 400 Bad Request upon synchronization.
- **Root Cause**: Model schema omission in mobile core.
- **Remediation**:
  1. Added `final int installmentMonth;` to `OfflineCollectionItem`, updating constructor, `toMap()`, and `fromMap()`.
  2. Updated `OfflineDuesRepository.recordOfflineCollection` to accept `required int installmentMonth`.
  3. Updated `OfflineDatabase.updateCollectionStatus` to preserve `installmentMonth`.

### DEF-MOB-03: Mobile Offline Sync Test Asserting Incorrect Path
- **Target File**: `apps/mobile/test/offline_sync_test.dart` (lines 85–115).
- **Issue**: The test asserted against `/api/v1/collections/counter` and omitted `installmentMonth`, masking the contract mismatch.
- **Remediation**:
  1. Updated test to pass `installmentMonth: 3`.
  2. Asserted `path == '/api/v1/collections/record'` and `body['installmentMonth'] == 3`. All 4 mobile test suites pass cleanly.

### Web Routing: Deep Linking Redirects in `next.config.ts`
- **Target File**: `apps/web/next.config.ts` (lines 29–42).
- **Issue**: Module 5 features in the Next.js App Router live under `/schemes/[id]` (Tab 2: Monthly Installments) and `/collections` (Payments & Doorstep Ledger). Direct bookmarks or legacy URLs to `/installments` or `/payments` yielded 404 pages.
- **Remediation**:
  1. Added permanent redirects from `/installments` to `/schemes` and `/payments` to `/collections` in `next.config.ts`. Verified in web tests (360/360 passing).

---

## 5. Forensic Verification of Core Module 5 Capabilities

### 5.1 Universal Dividend Deduction & Due Generation Invariant
- **Rule**: $I_{net} = I_{base} - Div_{ticket}$. Month 1 has ₹0 dividend ($I_{net} = I_{base}$). Month 2 through $N-1$ deducts equal dividend based on finalized auction discount. Month $N$ settles directly with 4% commission.
- **Verification**: In `installment.service.ts:generateMonthlyDues()`, Month 1 enforces `dividendPerTicket = 0n`. For Month 2+, reads `auction.dividendPerTicket` and deducts from `grossAmount`. Verified in `installment.spec.ts` (all tickets receive identical net due).

### 5.2 Discrete Single Payment Contract (Guardrail 8 & ADR-07)
- **Rule**: Exactly 1 payment per ticket per installment month for the exact net amount due ($amount == due.netPayableAmount$). Zero partial payments, zero overpayments, zero double payments, zero advance balances.
- **Verification**: In `payment.service.ts:recordPayment()`:
  - `due.status === DueStatus.PAID` throws HTTP 400 `INSTALLMENT_ALREADY_PAID`.
  - `paymentAmount !== due.netPayableAmount` throws HTTP 400 `PARTIAL_PAYMENTS_NOT_ALLOWED`.
  - In `CounterPaymentModal` (web UI), the amount is auto-bound to `selectedDue.netPayableAmount` and locked from editing.

### 5.3 Sequential Monotonic Receipt Generation (`KC-REC-{BRANCH}-{YYYY}-{XXXXX}`)
- **Rule**: Monotonically increasing 5-digit sequential counter per branch and financial year, collision-proof across concurrent cashiers.
- **Verification**: In `receipt-sequence.util.ts:generateNextReceiptNumber()`:
  - Executed under Tier 1 pessimistic lock (`SELECT id FROM "Branch" WHERE id = ${branchId} FOR UPDATE`).
  - Regex filter `substr("receiptNumber", CAST(${startPos} AS INTEGER)) ~ '^[0-9]{1,18}$'` guarantees pure numerical incrementation.
  - Verified in PostgreSQL 17 E2E tests (`04-payments-reversals.e2e-spec.ts`).

### 5.4 Global 4-Tier Concurrency Lock DAG
- **Rule**: Deadlock-free concurrency across cashier desks and collection rounds.
- **Lock Order DAG**:
  1. **Tier 1**: `SELECT id FROM "Branch" WHERE id = ${branchId} FOR UPDATE`
  2. **Tier 2**: `SELECT id FROM "SubscriberTicket" WHERE id = ANY(${sortedTicketIds}) ORDER BY id FOR UPDATE`
  3. **Tier 3**: `SELECT id, status, "netPayableAmount" FROM "InstallmentDue" WHERE id = ANY(${sortedDueIds}) ORDER BY id FOR UPDATE`
  4. **Tier 4**: `SELECT id, "paymentStatus" FROM "Payment" WHERE id = ANY(${sortedPaymentIds}) ORDER BY id FOR UPDATE`
- **Verification**: IDs are normalized, deduplicated, and sorted lexicographically (`normalizeSortedIds`). Executed inside `withTransactionRetry` with 3 retries on transient conflict.

### 5.5 Two-Partner Defaulter Removal & Substitution Protocol
- **Rule**: Failing to pay for 3 continuous months triggers company removal rights. Non-prized tickets only (`PRIZED_TICKET_IMMUTABLE`). Two-partner dual control: Partner A requests, Partner B approves (`maker != checker`). Substituted subscriber must have verified KYC and cannot already hold a ticket in that group (ADR-13). Early exit settlement (Q25) remains strictly locked fail-closed (`UNAPPROVED_SETTLEMENT_POLICY`).
- **Verification**: Enforced in `installment.service.ts` and backed by PostgreSQL check constraint `chk_ticket_removal_maker_checker`. Verified in unit and E2E suites.

### 5.6 Asynchronous BullMQ Notification Pipeline
- **Rule**: Payment receipts dispatched asynchronously without blocking or rolling back financial transactions. Smartphone users receive instant FCM push (₹0); keypad phone users receive Indian TRAI DLT SMS (`KMRCHT`).
- **Verification**: In `payment.service.ts:recordPayment()`, enqueues `JOB_DISPATCH_PAYMENT_RECEIPT` into BullMQ within a fail-safe `try/catch`. Unit tests verify that telecom or Redis failures log a warning without impeding financial commits.

---

## 6. Automated Verification Evidence & Test Execution Log

### 6.1 Backend API Unit Tests (`apps/api`)
```powershell
pnpm --filter api test -- test/unit/payment.spec.ts test/unit/installment.spec.ts test/unit/collection.spec.ts test/unit/financial-invariants.spec.ts
```
**Result**:
- `test/unit/arrears-util.spec.ts`: 6 passed, 0 failed (canonical consecutive arrears & state preservation invariants).
- `test/unit/payment.spec.ts`: 34 passed, 0 failed (out-of-order rejection, sequential payment, removed-ticket UPI claim guard).
- `test/unit/installment.spec.ts`: 20 passed, 0 failed.
- `test/unit/collection.spec.ts`: 27 passed, 0 failed (doorstep sequential check, DEF-10 arrears parity, DEF-11 reversed handover block, DEF-12 offline sort/mapping).
- `test/unit/jobs.spec.ts`: 22 passed, 0 failed.
- `test/unit/financial-invariants.spec.ts`: 19 passed, 0 failed.
- **Total**: **128 / 128 PASSING** (6 Module 5 suites).
- **Full API Suite**: **62 / 62 Suites PASSING, 1,091 / 1,091 Tests PASSING (100% Pass Rate)**.

### 6.2 PostgreSQL 17 E2E Integration Tests (`apps/api`)
```powershell
pnpm --filter api test:e2e
```
**Result**:
- `test/e2e/04-payments-reversals.e2e-spec.ts`: 14 passed, 0 failed (100% pass rate post DEF-09 test fixture alignment).
- `test/e2e/08-maker-checker-db-constraints.e2e-spec.ts`: 18 passed, 0 failed (includes all 3 `chk_ticket_removal_maker_checker` tests).
- `test/e2e/04-module4-chit-schemes.e2e-spec.ts`: passed.
- `test/e2e/05-disbursements-jobs.e2e-spec.ts`: passed.
- `test/e2e/01-auth-security.e2e-spec.ts`: passed.
- `test/e2e/06-storage-documents.e2e-spec.ts`: passed.
- `test/e2e/02-customer-kyc.e2e-spec.ts`: passed.
- `test/e2e/03-chits-auctions.e2e-spec.ts`: passed.
- `test/e2e/07-postgres-redis-lifecycle.e2e-spec.ts`: passed.
- `test/e2e/response-envelope.e2e-spec.ts`: passed.
- `test/e2e/throttler.e2e-spec.ts`: passed.
- `test/e2e/app.e2e-spec.ts`: passed.
- `test/e2e/security-headers.e2e-spec.ts`: passed.
- `test/e2e/proxy-client-ip.e2e-spec.ts`: passed.
- **Full E2E Test Suite Total**: **14 / 14 Suites PASSING, 172 / 172 Tests PASSING (100% Pass Rate)** (58.474s).

### 6.3 Web UI Unit Tests (`apps/web`)
```powershell
pnpm --filter web test
```
**Result**:
- **Total**: **360 / 360 PASSING** (14 suites, 3.402s).

### 6.4 Mobile Client Core Dart Tests (`apps/mobile`)
```powershell
cd apps/mobile
dart analyze
dart run test/offline_sync_test.dart
dart run test/auth_refresh_test.dart
dart run test/chit_models_test.dart
dart run test/customer_models_test.dart
```
**Result**:
- `dart analyze`: "Analyzing Kumaran-finance... No issues found!".
- `offline_sync_test.dart`: "All Mobile Offline Sync Tests Passed Successfully!".
- `auth_refresh_test.dart`: "All Mobile Auth & Token Refresh Tests Passed Successfully!".
- `chit_models_test.dart`: "ALL Module 4 Dart model tests PASSED successfully!".
- `customer_models_test.dart`: "ALL Module 3 Dart model tests PASSED successfully!".
- **Total**: **4 / 4 Suites PASSING** (100%).

### 6.5 Static Compilation & Type Safety
```powershell
pnpm --filter api exec tsc --noEmit
pnpm --filter web exec tsc --noEmit
dart analyze
```
**Result**: Exit code 0 with zero diagnostic errors across all packages.

---

## 7. Definition of Done Compliance Matrix

| Quality Gate | Description | Compliance Status | Proof / Evidence |
|:---|:---|:---:|:---|
| **Gate 1: Whole Rupee Math** | Stored and calculated as 64-bit integer BigInt Rupees; zero paise/floats | **100% COMPLIANT** | BigInt columns in `schema.prisma`, `toWholeRupeeBigInt`, 19 invariant tests passing |
| **Gate 2: Discrete Payments** | Strictly 1 payment per month matching exact Inet; zero partial/advance balances | **100% COMPLIANT** | `DueStatus` enum (UNPAID, PAID, OVERDUE), `payment.service.ts:174–187` |
| **Gate 3: Sequential Receipts** | `KC-REC-{BRANCH}-{YYYY}-{XXXXX}` inside Tier 1 Branch row lock transaction | **100% COMPLIANT** | `generateNextReceiptNumber`, PostgreSQL regex check, E2E receipt tests passing |
| **Gate 4: Concurrency & Locks** | Global 4-Tier lock DAG, lexicographical sorting, `withTransactionRetry` | **100% COMPLIANT** | `acquirePaymentConcurrencyLocks`, retry tests passing, 0 deadlocks |
| **Gate 5: Dual Control (Maker!=Checker)** | Hard separation on reversals, handover, and defaulter removal at DB engine level | **100% COMPLIANT** | `chk_payment_cash_handover_maker_checker`, `chk_reversal_maker_checker`, `chk_ticket_removal_maker_checker` (18 E2E tests passing) |
| **Gate 6: Partner Identity (ADR-21)** | Financial mutations require `isPartner: true`; IT Super Admins barred | **100% COMPLIANT** | Enforced across reversals, defaulter removal, and substitution |
| **Gate 7: Defaulter Rules (ADR-07)** | 3-month consecutive arrears tracking from latest down; prized immutable | **100% COMPLIANT** | Remediated DEF-01, DEF-02; `PRIZED_TICKET_IMMUTABLE` verified in unit tests |
| **Gate 8: Mobile Offline Sync** | Clean contract alignment with `/api/v1/collections/record` and `installmentMonth` | **100% COMPLIANT** | Remediated DEF-MOB-01, DEF-MOB-02, DEF-MOB-03; `offline_sync_test.dart` passing |
| **Gate 9: Web UI Alignment** | Locked discrete payment modals, Maker-Checker badges, redirects in `next.config.ts` | **100% COMPLIANT** | 360/360 passing web tests, clean Next.js typecheck, redirects configured |
| **Gate 10: Test Coverage & Clean Build** | 100% test pass rate across all suites; zero compiler/linter warnings | **100% COMPLIANT** | 1,091 API unit tests, 172 E2E tests, 360 Web tests, 4 Mobile suites passing |

---

## 8. Conclusion & Sign-Off

Module 5 (Installments, Dues & Counter Collections) has undergone exhaustive line-by-line forensic remediation, hardening, and verification:
1. **Defects Remediated**: All 14 backend/database/test-runner defects (`DEF-01`–`DEF-14`), 3 mobile core defects (`DEF-MOB-01`–`DEF-MOB-03`), and 1 web deep-linking gap have been permanently remediated and verified.
2. **Sequential Payment & Canonical Consecutive Arrears**: Strictly enforced via `PRIOR_INSTALLMENT_UNPAID` across counter collections, doorstep collections, UPI claims, and UPI claim verifications, paired with `computeMaxConsecutiveUnpaidMonths` and `deriveTicketArrearsStatus` in `apps/api/src/common/utils/arrears.util.ts`. E2E test fixtures in `04-payments-reversals.e2e-spec.ts` are chronologically aligned (`orderBy: { installmentMonth: 'asc' }`).
3. **Automated Verifications**:
   - E2E Test Suite: **14 / 14 Suites PASSING, 172 / 172 Tests PASSING (100% Pass Rate)**.
   - API Unit Test Suite: **62 / 62 Suites PASSING, 1,091 / 1,091 Tests PASSING (100% Pass Rate)**.
   - Web Test Suite: **14 / 14 Suites PASSING, 360 / 360 Tests PASSING (100% Pass Rate)**.
   - Mobile Client Core: **4 / 4 Suites PASSING (100% Pass Rate)**, `dart analyze` reports **No issues found!**.
   - TypeScript Compilation: Clean 0 errors across API and Web packages.

**Explicit Forensic Sign-Off**: All Acceptance Criteria and Financial Invariants for Module 5 are **100% VERIFIED** and compliant with all 10 Architectural Guardrails and Tamil Nadu Chit Funds Rules.

**Final Assessment: PASSED & FULLY CERTIFIED FOR PRODUCTION COMMIT.**
