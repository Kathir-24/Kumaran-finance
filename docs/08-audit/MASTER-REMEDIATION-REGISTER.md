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
| **KC-01 to KC-13** | Kumaran Chits Master Known Issues (Attendance, Offsets, Audit, Timezone, Concurrency, PDF) | **CRITICAL** | Core Engineering | Master Tracker | **CLOSED WITH EVIDENCE** |
| **F01–F16** | Security & Authorization Review (Session Vault, Token Revocation, DB Maker-Checker, Two-Stage Settlement, Scoping) | **CRITICAL to MEDIUM** | Security & Platform Architecture | ADR-09, ADR-21 | **PHASE 1 & 2 CLOSED (12/12), PHASE 3 SCHEDULED (4/4)** |

---

## 2. Detailed Issue Records

### KFC-FIN-001: Final-Month Prize Overpayment (Missing Installment Deduction)
- **Original Audit Ref**: Prompt 02 §4.2, Prompt 04 §3.1, Prompt 06 §4.1, 34-Rules Q08
- **Severity**: **CRITICAL (Direct Capital Loss)**
- **Agent Owner**: Agent B (Financial Domain Engineer)
- **Affected Files**: `apps/api/src/disbursement/disbursement.service.ts`, `apps/api/src/disbursement/disbursement.controller.ts`, `apps/api/test/unit/disbursement.spec.ts`
- **Verified Behavior**: `settleFinalMonth` now verifies whether Month $N$ installment due has already been paid at the branch desk. If paid, `finalMonthDeduction = 0n` (net payout ₹96,000 on ₹1L chit). If unpaid, `finalMonthDeduction = 5000n` (net payout ₹91,000) and Month $N$ due is marked `PAID`.
- **Expected Behavior**: Net prize disbursement must equal $V - C - I_{\text{base}} = ₹91,000$ (for a ₹1L scheme) or $₹96,000$ if already paid. Double collection is strictly prohibited.
- **Business Rule Ref**: Q08 / Confirmed Rule 5.2.5 / FIN-B
- **Status**: `CLOSED WITH EVIDENCE`
- **Remediation Evidence**: Verified in `apps/api/test/unit/disbursement.spec.ts` (`FIN-B: should NOT deduct final month installment again if subscriber already paid Month N due`). Test passed 100%.

---

### KFC-FIN-002: Dividend Remainder Truncation (Non-Divisible Bids)
- **Original Audit Ref**: Prompt 02 §3.3, 34-Rules Q10
- **Severity**: **HIGH (Financial Discrepancy)**
- **Agent Owner**: Agent B (Financial Domain Engineer)
- **Affected Files**: `apps/api/src/auction/auction.service.ts`, `apps/api/src/auction/dto/record-bid.dto.ts`, `apps/api/test/unit/auction.spec.ts`
- **Verified Behavior**: Strict divisibility assertion `(bidDiscount - foremanCommission) % totalTickets === 0n` enforced across all bids, tie-breaks, and correction paths.
- **Expected Behavior**: Reject any bid discount where `(bidDiscount - foremanCommission) % totalTickets !== 0n` with `HTTP 400 NON_DIVISIBLE_DIVIDEND`.
- **Business Rule Ref**: Q10 / Confirmed Rule 5.2.5 / FIN-C
- **Status**: `CLOSED WITH EVIDENCE`
- **Remediation Evidence**: Verified in `apps/api/test/unit/auction.spec.ts` (KFC-FIN-002: non-divisible bids rejected fail-closed). Test passed 100%.

---

### KFC-FIN-003: Missing Automated Arrears Deduction on Prize Release
- **Original Audit Ref**: Prompt 02 §5.1, Prompt 03 §6.3, 34-Rules Q13
- **Severity**: **CRITICAL (Embezzlement & Bad Debt Risk)**
- **Agent Owner**: Agent B (Financial Domain Engineer)
- **Affected Files**: `apps/api/src/disbursement/disbursement.service.ts`, `apps/api/src/disbursement/dto/authorize-payout.dto.ts`
- **Verified Behavior**: `authorizePayout` queries all unpaid `InstallmentDue` records up to auction month. Outstanding arrears are automatically deducted from the prize snapshot. Upon release, all offset dues are atomically updated to `status: PAID` and emitted as `PRIZE_ARREARS_OFFSET_ALLOCATED` audit records.
- **Expected Behavior**: Automatically query all unpaid `InstallmentDue` records for the winner's ticket. Deduct total arrears from `prizeMoney`. If arrears $\ge$ prize money, block authorization. Upon release, mark the offset dues as `PAID`.
- **Business Rule Ref**: Q13 / Confirmed Rule 5.3.2 / FIN-A
- **Status**: `CLOSED WITH EVIDENCE`
- **Remediation Evidence**: Verified in `apps/api/test/unit/disbursement.spec.ts` (`KFC-FIN-003: should automatically deduct unpaid installment arrears from prize money`). Test passed 100%.

---

### KFC-FIN-004: Arbitrary Prize Payout Overrides Without Ceiling or Floor
- **Original Audit Ref**: Prompt 03 §6.3, 34-Rules Q14
- **Severity**: **CRITICAL (Unauthorized Payout Discretion)**
- **Agent Owner**: Agent B (Financial Domain Engineer)
- **Affected Files**: `apps/api/src/disbursement/disbursement.service.ts`, `apps/api/src/disbursement/dto/authorize-payout.dto.ts`
- **Verified Behavior**: `disbursedAmount` override by caller is rejected if it differs from authorized net payout. Furthermore, TOCTOU guard re-verifies outstanding arrears inside transaction row lock during `releasePayout`; fails closed with `ARREARS_STATE_CHANGED` if dues changed.
- **Expected Behavior**: Enforce that `disbursedAmount` must strictly equal `prizeMoney - totalArrears`. Reject client-supplied arbitrary figures.
- **Business Rule Ref**: Q14 / Confirmed Rule 5.3.5 / FIN-D
- **Status**: `CLOSED WITH EVIDENCE`
- **Remediation Evidence**: Verified in `apps/api/test/unit/disbursement.spec.ts` (`FIN-D / TOCTOU: should reject payout release if outstanding arrears changed`). Test passed 100%.

---

### KFC-FIN-005: Finalized Auction Correction Workflow Absent
- **Original Audit Ref**: Prompt 02 §3.4, Prompt 04 §4.2, 34-Rules Q12
- **Severity**: **HIGH (Operational Rigidity / Inability to Correct Legitimate Errors)**
- **Agent Owner**: Agent B / Agent C
- **Affected Files**: `apps/api/src/auction/auction.controller.ts`, `apps/api/src/auction/auction.service.ts`, `apps/api/prisma/schema.prisma`
- **Verified Behavior**: Implemented dual-partner correction request (`POST /auctions/:id/request-correction`) and approval (`POST /auctions/:id/approve-correction`). Fails closed with `DISBURSED_PRIZE_IMMUTABLE` if prize disbursed, and `ALREADY_PAID_DUES_EXIST` if downstream Month $N+1$ dues are paid.
- **Expected Behavior**: Implement audited correction request and approval requiring two distinct Partners. Block correction if prize money has already been disbursed or if downstream dues are paid. Recalculate unpaid dues with compensating audit logs.
- **Business Rule Ref**: Q12 / Confirmed Rule 5.2.7 / FIN-E
- **Status**: `CLOSED WITH EVIDENCE`
- **Remediation Evidence**: Verified in `apps/api/test/unit/auction.spec.ts` (`FIN-E: should FAIL CLOSED on requestAuctionCorrection when downstream Month N+1 dues are already PAID`). Test passed 100%.

---

### KFC-SEC-001: Payment Reversal Initiation Restricted to Partners Only
- **Original Audit Ref**: Prompt 03 §5.2, 34-Rules Q21
- **Severity**: **HIGH (Unauthorized Reversal Request Risk)**
- **Agent Owner**: Agent C (Security & Approval Engineer)
- **Affected Files**: `apps/api/src/payment/payment.controller.ts`, `apps/api/src/payment/payment.service.ts`
- **Verified Behavior**: Reversal approval strictly requires verified Partner (`isPartner: true`) under `maker_user_id !== checker_user_id`. Cashier/Accountant may request reversal, but only an independent verified business partner can approve.
- **Expected Behavior**: The confirmed business rule mandates dual control: reversal approval requires an independent verified Partner.
- **Business Rule Ref**: Q21 / Confirmed Rule 5.6.7 / SEC-A
- **Status**: `CLOSED WITH EVIDENCE`
- **Remediation Evidence**: Verified in `apps/api/test/unit/payment.spec.ts` and `apps/api/test/unit/concurrency-postgres.spec.ts` (CONCURR-INV-14). Test passed 100%.

---

### KFC-SEC-002: Defaulter Removal & Settlement Dual-Partner Approval Gaps
- **Original Audit Ref**: Prompt 03 §4.3, 34-Rules Q24, Q29
- **Severity**: **HIGH (Unilateral Subscriber Forfeiture & Cash Settlement)**
- **Agent Owner**: Agent C (Security & Approval Engineer)
- **Affected Files**: `apps/api/src/installment/ticket.controller.ts`, `apps/api/src/installment/installment.service.ts`, `apps/api/prisma/schema.prisma`
- **Verified Behavior**: Two-partner dual control implemented: Partner A requests removal (`POST /tickets/:id/remove-defaulter/request`, status `PENDING_REMOVAL_APPROVAL`), Partner B approves (`POST /tickets/:id/remove-defaulter/approve`, status `REMOVED_DEF_3M`) with `ticket.removalRequestedByUserId !== checkerPartnerUserId`. Damage settlement fails closed with `UNAPPROVED_SETTLEMENT_POLICY` (Q25).
- **Expected Behavior**: Require formal dual-partner approval: Partner A initiates removal request; Partner B approves (`maker_partner_id != checker_partner_id`).
- **Business Rule Ref**: Q24, Q29 / Confirmed Rule 5.5.2–3 / SEC-B
- **Status**: `CLOSED WITH EVIDENCE`
- **Remediation Evidence**: Verified in `apps/api/test/unit/installment.spec.ts` (`SEC-B: Two-Partner Dual Control Defaulter Removal`). Test passed 100%.

---

### KFC-SEC-003: Auction Finalization Role Restricted Exclusively to Partners
- **Original Audit Ref**: Prompt 03 §6.1, 34-Rules Q29.7
- **Severity**: **HIGH (Unauthorized Finalization Authority)**
- **Agent Owner**: Agent C (Security & Approval Engineer)
- **Affected Files**: `apps/api/src/auction/auction.controller.ts`, `apps/api/src/auction/auction.service.ts`
- **Verified Behavior**: `finalizeAuction` strictly requires `Role.SUPER_ADMIN` with `isPartner: true`. Non-partner Super Admin and Branch Manager are blocked with `HTTP 403 Forbidden: PARTNER_IDENTITY_REQUIRED`.
- **Expected Behavior**: A verified business partner must always finalize an auction as Checker under `maker != checker`.
- **Business Rule Ref**: Q29.7 / Confirmed Rule 5.2.8 / SEC-A
- **Status**: `CLOSED WITH EVIDENCE`
- **Remediation Evidence**: Verified in `apps/api/test/unit/auction.spec.ts` (`SEC-A: should reject non-partner Super Admin on finalizeAuction`). Test passed 100%.

---

### KFC-SEC-004: Prized Ticket Transfer & Removal Protection
- **Original Audit Ref**: Prompt 02 §5.3, 34-Rules Q26
- **Severity**: **MEDIUM (Defaulter Removal Loophole on Prized Tickets)**
- **Agent Owner**: Agent C / Agent B
- **Affected Files**: `apps/api/src/installment/installment.service.ts`
- **Verified Behavior**: `removeDefaulter`, `requestDefaulterRemoval`, and `substituteSubscriber` explicitly validate `if (ticket.isPrized) throw new BadRequestException('PRIZED_TICKET_IMMUTABLE: Prized subscriber tickets can never be removed or substituted')`.
- **Expected Behavior**: Explicitly throw `BadRequestException` if attempting to remove or substitute an already-prized ticket.
- **Business Rule Ref**: Q26 / Confirmed Rule 5.5.6
- **Status**: `CLOSED WITH EVIDENCE`
- **Remediation Evidence**: Verified in `apps/api/test/unit/installment.spec.ts`. Test passed 100%.

---

### KFC-PDF-001: Cancelled Receipt Watermark Missing in Server PDF
- **Original Audit Ref**: Prompt 05 §8.2, 34-Rules Q22
- **Severity**: **MEDIUM (Legal & Statutory Receipt Ambiguity)**
- **Agent Owner**: Agent E (Web & PDF Engineer)
- **Affected Files**: `apps/api/src/pdf/templates/subscription-receipt.template.ts`, `apps/api/src/pdf/pdf.service.ts`
- **Verified Behavior**: Reversed receipts dynamically render a prominent red diagonal watermark `ரத்து செய்யப்பட்டது / CANCELLED` (`rg 0.85 0.1 0.1`) rotated across the center, with red header banner and cache-busting headers.
- **Expected Behavior**: Render a prominent red diagonal watermark `ரத்து செய்யப்பட்டது / CANCELLED` and header alert box; invalidate any cached S3 object upon payment reversal.
- **Business Rule Ref**: Q22 / Confirmed Rule 5.7.4–5
- **Status**: `CLOSED WITH EVIDENCE`
- **Remediation Evidence**: Verified in `apps/api/test/unit/pdf.spec.ts` (asserts RGB color operator, rotation, text, and cache bypass). Test passed 100%.

---

### KFC-NOT-001: WhatsApp Simulation Stub Purge
- **Original Audit Ref**: Prompt 06 §5.3, 34-Rules Q34
- **Severity**: **LOW (Dead Code & Scope Divergence)**
- **Agent Owner**: Agent F (DevOps & QA)
- **Affected Files**: `apps/api/src/jobs/services/notification.service.ts`
- **Verified Behavior**: Purged all fake WhatsApp loggers, mock IDs, and placeholder channels. Production delivery is strictly Indian TRAI DLT SMS via MSG91 flow API.
- **Expected Behavior**: Purge or disable WhatsApp stubs. Route notifications solely through SMS DLT.
- **Business Rule Ref**: Q34 / Confirmed Rule 5.7.8
- **Status**: `CLOSED WITH EVIDENCE`
- **Remediation Evidence**: Verified in `apps/api/test/unit/sms.spec.ts` (22/22 passed) and `apps/api/test/unit/jobs.spec.ts`.

---

### KFC-INF-001: Redis MaxMemory Policy `noeviction` for BullMQ Queues
- **Original Audit Ref**: Prompt 06 §5.1, Master Prompt Section 8
- **Severity**: **HIGH (Queue Reliability & Job Loss Risk)**
- **Agent Owner**: Agent D (Database & Reliability)
- **Affected Files**: `docker-compose.yml`, `infra/docker/redis.conf`, `infra/scripts/`
- **Verified Behavior**: Redis instance configured with `--maxmemory-policy noeviction` to ensure BullMQ queue keys are never silently evicted under memory pressure.
- **Expected Behavior**: Configure Redis instance with `--maxmemory-policy noeviction` for BullMQ queue stability.
- **Business Rule Ref**: Section 8
- **Status**: `CLOSED WITH EVIDENCE`
- **Remediation Evidence**: Verified in `apps/api/test/unit/cache-stampede.spec.ts` and `apps/api/test/unit/queue-resilience.spec.ts`.

---

### KFC-DOC-001: Unapproved Statutory & Receipt Templates Formalization
- **Original Audit Ref**: Prompt 05 §8.1, 34-Rules Q33
- **Severity**: **MEDIUM (Compliance & Documentation)**
- **Agent Owner**: Agent G (Documentation & Compliance)
- **Affected Files**: `docs/08-audit/OPEN-BUSINESS-LEGAL-DECISIONS.md`, `docs/08-audit/DOCUMENTATION-CONSISTENCY-REGISTER.md`
- **Verified Behavior**: All statutory and receipt templates formally indexed; implemented structures distinguished from legal sign-off.
- **Expected Behavior**: Inventory all templates, distinguish implemented structure from legal sign-off, and present gallery for partner verification.
- **Business Rule Ref**: Q33 / Confirmed Rule 5.7.9
- **Status**: `CLOSED WITH EVIDENCE`
- **Remediation Evidence**: Documented in `docs/08-audit/statutory-legal-compliance.md` and `docs/08-audit/maker-checker-controls-directory.md`.

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

---

## 3. Security & Authorization Remediation Register (F01–F16: November 15, 2026)

| Finding ID | Severity | Remediation Phase | Finding Summary | Permanent Resolution | Status | Verification Evidence |
|---|---|---|---|---|---|---|
| **F01** | **CRITICAL** | Phase 1 | Pending TOTP bypass on MPIN setup | `validateAuthenticatedAccessToken` verifies `tokenType: access`, durable revocation cutoffs, `mustChangePassword`, and setupToken issuance is verified against `tokenRevokedBefore` before atomic consumption | **CLOSED WITH EVIDENCE** | `phase1-security-remediation.spec.ts` (39/39) |
| **F02** | **HIGH** | Phase 1 | Admin password reset leaves sessions usable | Transactional `resetPassword` and `updateRoles` combining user mutation and PostgreSQL `Session` revocation in single `$transaction`; write errors propagate visibly | **CLOSED WITH EVIDENCE** | `phase1-security-remediation.spec.ts`, `07-postgres-redis-lifecycle.e2e-spec.ts` |
| **F03** | **HIGH** | Phase 1 | Removing roles keeps privileges in cache | Structured Redis cache with `tokenRevokedBeforeMs` validation, role/isPartner sync, legacy string `'ACTIVE'` treated as cache miss, reliable status cache eviction on mutations | **CLOSED WITH EVIDENCE** | `phase1-security-remediation.spec.ts` |
| **F04** | **HIGH** | Phase 1 | Scoped logout session resurrection & family isolation | Dedicated PostgreSQL `Session` table enforcement; global fallback removed; refresh always verifies DB `Session` row before trusting cached hash; cold Redis access tokens validated against `Session.revokedAt` and cryptographic `sid` binding | **CLOSED WITH EVIDENCE** | `auth-token-lifecycle.spec.ts` (25/25), `07-postgres-redis-lifecycle.e2e-spec.ts` |
| **F05** | **HIGH** | Phase 2 | Month N final settlement maker == checker | Decoupled two-stage endpoints: `prepareFinalSettlement` (Stage 1 Maker staff) and `approveFinalSettlement` (Stage 2 Checker partner, `maker != checker`), with upsert on settlement auction/winner | **CLOSED WITH EVIDENCE** | `phase2-security-remediation.spec.ts` (36/36) |
| **F06** | **HIGH** | Phase 2 | Raw storage access bypasses passbook and branch scope | Passbook ticket ownership verification (`passbooks/{chitGroupId}/ticket-{ticketNumber}.pdf`), KYC branch checks, strict default-deny for unrecognized keys | **CLOSED WITH EVIDENCE** | `phase2-security-remediation.spec.ts` |
| **F07** | **HIGH** | Phase 2 | Customer search & detail expose unscoped records & PII | Caller context scoping: `COLLECTION_AGENT` scoped strictly to active tickets in assigned branch; `panNumber` completely omitted; sensitive hashes stripped | **CLOSED WITH EVIDENCE** | `phase2-security-remediation.spec.ts` |
| **F08** | **HIGH** | Phase 2 | Ticket/auction endpoints expose fellow subscribers' PII | Chit group membership enforcement on `GET /auctions/:id` + fellow subscriber phone masking (`+91 ******0000`) | **CLOSED WITH EVIDENCE** | `phase2-security-remediation.spec.ts` |
| **F09** | **HIGH** | Phase 2 | Payment & collection writes lack agent/branch checks | Decoupled same-branch idempotency protection (cannot query/replay another user's payment); domain accounting branch derived strictly from `ticket.chitGroup.branchId` | **CLOSED WITH EVIDENCE** | `phase2-security-remediation.spec.ts` |
| **F10** | **HIGH** | Phase 1 | TOTP factor replacement without password / challenge race | Bounded retries (3 attempts) on mistyped codes without destroying setup challenge; atomic compare-and-delete Lua script on valid code verification; password required for factor replacement | **CLOSED WITH EVIDENCE** | `phase1-security-remediation.spec.ts` |
| **F11** | **HIGH** | Phase 3 | Queue dashboard auth detached from Super Admin identity | Super Admin session auth guard on Bull Board (`/admin/queues`) | **SCHEDULED (PHASE 3)** | Scheduled for Phase 3 implementation |
| **F12** | **HIGH** | Phase 2 | Database maker-checker constraints absent | PostgreSQL 17 engine CHECK constraints (`chk_payment_cash_handover_maker_checker`, `chk_auction_maker_checker`, `chk_winner_maker_checker`, `chk_reversal_maker_checker`) with SQL ternary NULL-trap immunity | **CLOSED WITH EVIDENCE** | `08-maker-checker-db-constraints.e2e-spec.ts` (15/15) |
| **F13** | **MEDIUM** | Phase 3 | SMS OTP verification race condition | Atomic Redis Lua OTP attempt tracking and consumption | **SCHEDULED (PHASE 3)** | Scheduled for Phase 3 implementation |
| **F14** | **MEDIUM** | Phase 3 | Mobile app refresh loop causes cascade 401 | Single-flight refresh mutex in Flutter Dio interceptor | **SCHEDULED (PHASE 3)** | Scheduled for Phase 3 implementation |
| **F15** | **MEDIUM** | Phase 3 | SSE approvals stream lacks mid-flight auth check | Periodic active-session heartbeat validator | **SCHEDULED (PHASE 3)** | Scheduled for Phase 3 implementation |
| **F16** | **HIGH** | Phase 1 | Shared default staff password without forced change | Atomic single-use onboarding token consumption, `mustChangePassword` enforced on both MPIN login and `verifyOtp`, TOTP requirement preserved on onboarding completion, Next.js Edge HttpOnly cookie onboarding flow with `/onboarding` UI | **CLOSED WITH EVIDENCE** | `phase1-security-remediation.spec.ts`, Playwright E2E |
