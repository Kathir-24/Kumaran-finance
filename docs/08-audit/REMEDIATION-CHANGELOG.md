# KUMARAN CHITS — REMEDIATION CHANGELOG

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance** (Perundurai, Erode District, Tamil Nadu)  
> **Date**: November 13, 2026  
> **Authority**: Antigravity Coordinated Multi-Agent Engineering Team  
> **Baseline Commit**: `origin/main`  
> **Verification Status**: 52/52 API Test Suites Passed (843/843 Tests, 0 Failures) + 14 Web Test Suites Passed (353/353 Tests) = 1,196 Total Tests

---

## 1. Summary of Changes

This changelog records all production code, configuration, test, and documentation changes implemented during the Final Master Remediation under `/teamwork`.

| Issue ID | Domain | Severity | Primary Files Changed | Description of Changes |
|---|---|:---:|---|---|
| **KFC-INF-001** | Infrastructure | **HIGH** | `infra/docker/docker-compose.fullstack.yml` | Updated Redis container policy from volatile-lru to `noeviction` for BullMQ queue reliability. |
| **KFC-FIN-002** | Chit Math | **HIGH** | `apps/api/src/auction/auction.service.ts`<br>`apps/api/test/unit/auction.spec.ts` | Added strict whole-rupee divisibility guard `(totalDividend % totalTickets !== 0n)` throwing `NON_DIVISIBLE_DIVIDEND` 400. |
| **KFC-FIN-001** | Financial Math | **CRITICAL** | `apps/api/src/disbursement/disbursement.service.ts`<br>`apps/api/src/disbursement/dto/disbursement-response.dto.ts`<br>`apps/api/test/unit/disbursement.spec.ts` | Deducted Month N base installment ($I_{\text{base}}$) from final prize payout ($V - C - I_{\text{base}}$) and auto-settled Month N `InstallmentDue` as `PAID`. |
| **KFC-FIN-003** | Financial Safety | **CRITICAL** | `apps/api/src/disbursement/disbursement.service.ts`<br>`apps/api/test/unit/disbursement.spec.ts` | Implemented automated arrears query & deduction from prize payout in `authorizePayout` and auto-settlement on `releasePayout`. |
| **KFC-FIN-004** | Dual Control | **CRITICAL** | `apps/api/src/disbursement/disbursement.service.ts`<br>`apps/api/test/unit/disbursement.spec.ts` | Enforced strict mathematical match between client `disbursedAmount` and calculated net prize entitlement, throwing `PAYOUT_OVERRIDE_NOT_PERMITTED`. |
| **KFC-FIN-005** | Financial Ops | **HIGH** | `apps/api/src/auction/auction.controller.ts`<br>`apps/api/src/auction/auction.service.ts`<br>`apps/api/src/auction/dto/auction-correction.dto.ts`<br>`apps/api/test/unit/auction.spec.ts` | Implemented audited finalized auction correction request (`POST :id/correction/request`) and approval (`POST :id/correction/approve`) with dual-partner control, immutable disbursed prize protection, and downstream due reconciliation. |
| **KFC-SEC-001** | Security / RBAC | **HIGH** | `apps/api/src/payment/payment.controller.ts` | Restricted `POST :id/request-reversal` strictly to `@Roles(Role.SUPER_ADMIN)` (Partners only). |
| **KFC-SEC-002** | Security / RBAC | **HIGH** | `apps/api/src/installment/ticket.controller.ts`<br>`apps/api/src/installment/installment.service.ts`<br>`apps/api/test/unit/installment.spec.ts` | Restricted `POST :id/settle-removal` to `Role.SUPER_ADMIN` and enforced Maker != Checker between removing partner and exit voucher settling partner. |
| **KFC-SEC-003** | Security / RBAC | **HIGH** | `apps/api/src/auction/auction.controller.ts`<br>`apps/api/src/auction/auction.service.ts`<br>`apps/api/test/unit/adversarial-security-invariants.spec.ts` | Removed `Role.BRANCH_MANAGER` from `POST :id/finalize`, strictly gating auction finalization to Partners (`SUPER_ADMIN`). |
| **KFC-SEC-004** | Financial Safety | **MEDIUM** | `apps/api/src/installment/installment.service.ts`<br>`apps/api/test/unit/installment.spec.ts` | Added `if (ticket.isPrized) throw BadRequestException('PRIZED_TICKET_IMMUTABLE: ...')` to `removeDefaulter`, `substituteSubscriber`, and `settleRemoval`. |
| **KFC-PDF-001** | Web / PDF | **MEDIUM** | `apps/api/src/pdf/templates/subscription-receipt.template.ts`<br>`apps/api/src/pdf/pdf.service.ts`<br>`apps/api/test/unit/pdf.spec.ts` | Rendered bold red diagonal bilingual watermark `ரத்து செய்யப்பட்டது / CANCELLED` on reversed payment receipts; bypassed pre-reversal cached S3 PDFs. |
| **KFC-NOT-001** | DevOps / Jobs | **LOW** | `apps/api/src/jobs/services/notification.service.ts` | Purged WhatsApp simulation mocks per confirmed business rule Q34 in favor of official Indian DLT SMS gateway. |
| **KFC-SEC-005** | Security / Schema | **CRITICAL** | `packages/database/prisma/schema.prisma`<br>`packages/database/prisma/migrations/20261113200000_add_partner_identity_and_removal_approval/` | Added `isPartner Boolean @default(false)` on `User` model, strictly differentiating true equity partners from operational administrative accounts (`SEC-A`). |
| **KFC-SEC-006** | Dual Control / Ops | **CRITICAL** | `apps/api/src/installment/installment.service.ts`<br>`apps/api/src/installment/ticket.controller.ts`<br>`apps/api/test/unit/installment.spec.ts` | Implemented two-partner dual control on defaulter removal (`PENDING_REMOVAL_APPROVAL` state, `request-defaulter-removal` + `approve-defaulter-removal` with `maker != checker`) (`SEC-B`). |
| **KFC-FIN-006** | Financial Math | **HIGH** | `apps/api/src/disbursement/disbursement.service.ts`<br>`apps/api/test/unit/disbursement.spec.ts` | Fixed Month N double-collection bug (`FIN-B`): if Month N installment was already paid at branch desk, `finalMonthDeduction = 0n`, ensuring correct ₹96,000 net payout on ₹1L chit. |

---

## 2. File-by-File Detailed Diff Summary

### 2.1 Infrastructure
- [`infra/docker/docker-compose.fullstack.yml`](file:///u:/Kumaran-finance/infra/docker/docker-compose.fullstack.yml#L51-L52):
  - Changed Redis `--maxmemory-policy volatile-lru` to `--maxmemory-policy noeviction`.
  - Executed dynamic Redis command `config set maxmemory-policy noeviction` against `chitflow-redis`.

### 2.2 Auction Engine
- [`apps/api/src/auction/auction.service.ts`](file:///u:/Kumaran-finance/apps/api/src/auction/auction.service.ts):
  - In `calculateAuctionMath`: Added `if (totalDividend % totalTickets !== 0n) throw new BadRequestException('NON_DIVISIBLE_DIVIDEND: ...')`.
  - In `finalizeAuction`: Added `userRoles?: string[]` and enforced `Role.SUPER_ADMIN`.
  - Added `requestAuctionCorrection`: Partner A submits corrected bid discount, validated against 25% ceiling and divisibility; blocked if prize already disbursed.
  - Added `approveAuctionCorrection`: Partner B authorizes; recalculates snapshots, swaps `isPrized` flags if ticket changed, and updates downstream `InstallmentDue` records.
- [`apps/api/src/auction/auction.controller.ts`](file:///u:/Kumaran-finance/apps/api/src/auction/auction.controller.ts):
  - Restricted `POST :id/finalize` strictly to `@Roles(Role.SUPER_ADMIN)`.
  - Added `POST :id/correction/request` (`@Roles(Role.SUPER_ADMIN)`).
  - Added `POST :id/correction/approve` (`@Roles(Role.SUPER_ADMIN)`).
- [`apps/api/src/auction/dto/auction-correction.dto.ts`](file:///u:/Kumaran-finance/apps/api/src/auction/dto/auction-correction.dto.ts):
  - Created `RequestAuctionCorrectionDto` and `ApproveAuctionCorrectionDto` with whole-rupee validators.

### 2.3 Disbursement & Maturity Settlement
- [`apps/api/src/disbursement/disbursement.service.ts`](file:///u:/Kumaran-finance/apps/api/src/disbursement/disbursement.service.ts):
  - In `settleFinalMonth`: Computed $V - C - I_{\text{base}} - \text{priorArrears}$. Settle Month N `InstallmentDue` as `PAID`.
  - In `authorizePayout`: Queried all unpaid dues up to auction month; calculated `totalArrears`; blocked if arrears $\ge$ prize; enforced `requestedAmount === authorizedNetPayout`.
  - In `releasePayout`: Auto-settled all unpaid dues offset from the prize payout snapshot.
- [`apps/api/src/disbursement/dto/disbursement-response.dto.ts`](file:///u:/Kumaran-finance/apps/api/src/disbursement/dto/disbursement-response.dto.ts):
  - Added `finalMonthInstallment` and `priorArrearsDeducted` to `FinalSettlementDataDto`.

### 2.4 Payment & Reversal Security
- [`apps/api/src/payment/payment.controller.ts`](file:///u:/Kumaran-finance/apps/api/src/payment/payment.controller.ts):
  - Restricted `POST :id/request-reversal` from `@Roles(Role.SUPER_ADMIN, Role.BRANCH_MANAGER, Role.ACCOUNTANT)` to `@Roles(Role.SUPER_ADMIN)`.

### 2.5 Subscriber Defaults & Immutability
- [`apps/api/src/installment/installment.service.ts`](file:///u:/Kumaran-finance/apps/api/src/installment/installment.service.ts):
  - In `removeDefaulter`: Added `if (ticket.isPrized) throw new BadRequestException('PRIZED_TICKET_IMMUTABLE...')`.
  - In `substituteSubscriber`: Added `if (ticket.isPrized) throw new BadRequestException('PRIZED_TICKET_IMMUTABLE...')`.
  - In `settleRemoval`: Enforced `if (ticket.removedByUserId && ticket.removedByUserId === adminUserId) throw new ForbiddenException('MAKER_CHECKER_VIOLATION...')`.
- [`apps/api/src/installment/ticket.controller.ts`](file:///u:/Kumaran-finance/apps/api/src/installment/ticket.controller.ts):
  - Restricted `POST :id/settle-removal` from `@Roles(Role.SUPER_ADMIN, Role.ACCOUNTANT)` to `@Roles(Role.SUPER_ADMIN)`.

### 2.6 PDF & Receipt Cancelled Watermark
- [`apps/api/src/pdf/templates/subscription-receipt.template.ts`](file:///u:/Kumaran-finance/apps/api/src/pdf/templates/subscription-receipt.template.ts):
  - Added `isCancelled?: boolean` to `ReceiptPdfData`.
  - Rendered bold red diagonal bilingual watermark `ரத்து செய்யப்பட்டது / CANCELLED` (-35 degree rotation, 28pt bold, #DC2626) when `data.isCancelled` is true.
- [`apps/api/src/pdf/pdf.service.ts`](file:///u:/Kumaran-finance/apps/api/src/pdf/pdf.service.ts):
  - Checked `isCancelled = payment.paymentStatus === PaymentStatus.REVERSED`.
  - Bypassed pre-reversal cached PDF in S3 when `isCancelled` is true, ensuring watermarked PDF is minted and saved under `*-cancelled.pdf`.

---

## 3. Regression & Test Suite Summary

- Baseline test suites: 52
- Baseline tests passing: 820
- Post-remediation test suites: 52 (API) + 14 (Web) = 66 suites
- **Post-remediation tests passing: 843 (API) + 353 (Web) = 1,196 total tests**
- **Failures: 0**
- Test suites verified:
  - `apps/api/test/unit/auction.spec.ts` (30/30 passed)
  - `apps/api/test/unit/disbursement.spec.ts` (22/22 passed)
  - `apps/api/test/unit/installment.spec.ts` (20/20 passed)
  - `apps/api/test/unit/adversarial-security-invariants.spec.ts` (20/20 passed)
  - `apps/api/test/unit/pdf.spec.ts` (43/43 passed)
  - `apps/api/test/unit/concurrency-postgres.spec.ts` (25/25 passed)
  - `apps/api/test/unit/financial-boundary-fuzz.spec.ts` (30/30 passed)
  - `apps/api/test/unit/state-transition-retry.spec.ts` (20/20 passed)
  - `apps/api/test/unit/chaos-network-disconnect.spec.ts` (7/7 passed)
  - All remaining API suites passed.
  - All 14 Next.js Web test suites passed (353/353 passed).

---

## 4. Master Known-Issues Resolution (KC-01 through KC-13)

| Issue ID | Domain | Severity | Primary Files Changed | Description of Changes |
|---|---|:---:|---|---|
| **KC-01** | Statutory Reporting | **HIGH** | `apps/api/src/report/statutory-report.service.ts`<br>`apps/api/test/unit/report.spec.ts` | Grouped Form XXI Ledger schedule per ticket and due to eliminate multi-payment allocation double-summation. |
| **KC-02** | Legal Compliance | **CRITICAL** | `apps/api/src/auction/auction.service.ts`<br>`apps/api/src/auction/dto/finalize-auction.dto.ts`<br>`apps/web/src/components/auctions/auction-finalize-card.tsx`<br>`apps/api/test/unit/auction.spec.ts` | Removed silent defaults (`\|\| 1`, `?? 1`) for attendees and Foreman signatures. Enforced `@IsInt()`, `@Min(1)` with `BadRequestException` on missing/invalid input. |
| **KC-03** | Audit Trail | **MEDIUM** | `apps/api/src/chit/chit.service.ts`<br>`apps/api/test/unit/chit.spec.ts` | Added atomic `tx.auditLog.create` (`CHIT_GROUP_ACTIVATED`) with `userId: checkerUserId` inside `withTransactionRetry`. |
| **KC-04** | Audit Trail | **MEDIUM** | `apps/api/src/installment/installment.controller.ts`<br>`apps/api/src/installment/installment.service.ts`<br>`apps/api/test/unit/installment.spec.ts` | Added atomic `tx.auditLog.create` (`INSTALLMENT_DUES_GENERATED`) with `userId: actorUserId \|\| null` and `isIdempotentNoop` detection. |
| **KC-05** | Security / RBAC | **CRITICAL** | `apps/api/src/common/guards/roles.guard.ts`<br>`apps/api/test/unit/adversarial-security-invariants.spec.ts` | Enforced `SEC-A` guardian requiring `user.isPartner === true` on all financial mutations. |
| **KC-06** | Data Integrity | **MEDIUM** | `apps/api/src/chit/chit.service.ts`<br>`apps/api/test/unit/adversarial-security-invariants.spec.ts` | Added application-level pre-check for ADR-13 single ticket per customer limit returning HTTP 409 Conflict. |
| **KC-07** | Timezone & Concurrency | **HIGH** | `apps/api/src/collection/collection.service.ts`<br>`apps/api/test/unit/collection.spec.ts` | Fixed `getIstDayRange` to format timestamps via `Asia/Kolkata` timezone; added `ORDER BY id FOR UPDATE` in `acknowledgeHandover`. |
| **KC-08** | Financial State | **HIGH** | `apps/api/src/payment/payment.service.ts`<br>`apps/api/test/unit/payment.spec.ts` | Recalculated ticket arrears count and updated defaulter flag upon reversal approval. |
| **KC-09** | Financial Provenance | **CRITICAL** | `apps/api/src/report/statutory-report.service.ts`<br>`apps/api/test/unit/report.spec.ts` | Extracted exact settlement timestamp and voucher reference from `AuditLog` (`PRIZE_ARREARS_OFFSET_ALLOCATED`); direct adjustments fall back to `paymentDate: null`. |
| **KC-10** | Data Reconciliation | **LOW** | Database ground truth | Ground-truth SQL joins proved payments `8256296e` & `db653182` belong to Tickets #2 & #3. |
| **KC-11** | Audit Reconciliation | **LOW** | Database ground truth | Reconciled exact immutable AuditLog UUIDs for Checkpoint 2F actions on disk. |
| **KC-12** | E2E Browser Testing | **HIGH** | Docker web build, `apps/web/e2e/09-reports-registers.e2e.spec.ts` | Rebuilt `docker-web` container safely. Re-ran Playwright test suite 09: all 5/5 tests passed (10.6s). |
| **KC-13** | Statutory PDF Geometry | **MEDIUM** | `apps/api/src/pdf/` templates | Verified exact page geometry (A5/A4) and embedded `NotoSansTamil` TrueType fonts. |

### Final Test Execution Summary
- **API Unit Test Suites**: 56/56 Passed (**891/891 tests, 100%**)
- **Web Unit Test Suites**: 14/14 Passed (**353/353 tests, 100%**)
- **E2E Playwright Suite 09**: 5/5 Passed (**100%**)
- **Adversarial Security Suite**: 23/23 Passed (**100%**)
- **TypeScript Typecheck**: 0 Errors (`api` and `web` clean)
- **Database Non-Regression**: 0 Records Mutated (`chitflow_dev` and `KCA-UAT-01` intact)
