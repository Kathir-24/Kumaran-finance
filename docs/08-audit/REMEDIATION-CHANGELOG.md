# KUMARAN CHITS — REMEDIATION CHANGELOG

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance** (Perundurai, Erode District, Tamil Nadu)  
> **Date**: November 13, 2026  
> **Authority**: Antigravity Coordinated Multi-Agent Engineering Team  
> **Baseline Commit**: `origin/main`  
> **Verification Status**: 52/52 Test Suites Passed (834/834 Tests, 0 Failures)

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
| **KFC-NOT-001** | DevOps / Jobs | **LOW** | `apps/api/src/jobs/services/notification.service.ts` | Formalized WhatsApp out-of-scope status per confirmed business rule Q34. |

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
- Post-remediation test suites: 52
- **Post-remediation tests passing: 834**
- **Failures: 0**
- Test suites verified:
  - `apps/api/test/unit/auction.spec.ts` (30/30 passed)
  - `apps/api/test/unit/disbursement.spec.ts` (22/22 passed)
  - `apps/api/test/unit/installment.spec.ts` (17/17 passed)
  - `apps/api/test/unit/adversarial-security-invariants.spec.ts` (20/20 passed)
  - `apps/api/test/unit/pdf.spec.ts` (43/43 passed)
  - `apps/api/test/unit/concurrency-postgres.spec.ts` (25/25 passed)
  - `apps/api/test/unit/financial-boundary-fuzz.spec.ts` (30/30 passed)
  - `apps/api/test/unit/state-transition-retry.spec.ts` (20/20 passed)
  - `apps/api/test/unit/chaos-network-disconnect.spec.ts` (7/7 passed)
  - All remaining 43 suites passed.
