# Real-Time Maker–Checker Approvals Hub, Governance Matrix & Statutory Reporting Hardening (`apps/api/src/report`)

> **Module**: `apps/api/src/report/`  
> **Company**: **Kumaran Finance** (Perundurai, Erode, Tamil Nadu)  
> **Guiding Guardrails**: Guardrail #10 (`Maker != Checker` + 8 PostgreSQL `CHECK` constraints) & Guardrail #11 (`ADR-21`, `ADR-27` / `SEC-A`: `Role.PARTNER` Statutory Partner Identity & `SUPER_ADMIN`-only Audit Logs)

---

## 1. The 8 Live Maker–Checker Approval Queues

Sensitive financial mutations cannot be finalized unilaterally or by Administrative IT Super Admins (`Role.SUPER_ADMIN`):

1. **Cash Handovers**: Field agents submit collected cash (`PENDING_HANDOVER`, `SUCCESS` only); an independent staff/partner (`collector != acknowledger`) counts and signs off into the branch vault (`chk_payment_cash_handover_maker_checker`).
2. **Payment Reversals (`KFC-SEC-001`)**: Verified Partner A initiates a reversal (`REQUESTED`, `POST /api/v1/payments/:id/request-reversal`); a distinct Verified Partner B approves or rejects (`maker != checker`, `chk_reversal_maker_checker`).
3. **Safety Proof Verifications (`ADR-15`)**: Desk staff verifies non-mandatory company safety proof documents (agreements, blank cheques, promissory notes; zero property documents) on finalized auctions (`COMPLETED` / `MINUTES_FILED`, `PENDING_VERIFICATION`).
4. **Prize Disbursement Authorizations**: Verified Partner B authorizes prize payouts verified by Maker (`VERIFIED_BY_MAKER`, `maker != checker`).
5. **Auction Finalizations**: Verified Partner B (or distinct authorized Checker) finalizes offline auction results recorded by Maker (`SCHEDULED` Months $2..N-1$ with winner recorded, `maker != checker`).
6. **Finalized Auction Corrections**: Verified Partner B approves post-finalization correction requests (`AUCTION_CORRECTION_REQUESTED` without subsequent approval, `maker != checker`; audit query bounded via `take: 200` per `DEF-M10-PERF-01`).
7. **Defaulter Removals (`ADR-07` / `ADR-22`)**: Verified Partner B approves 3-month consecutive defaulter removal requests on non-prized tickets (`PENDING_REMOVAL_APPROVAL`, `maker != checker`, backed by `SELECT FOR UPDATE` TOCTOU lock & DB `CHECK` constraint `chk_ticket_removal_maker_checker`).
8. **Month $N$ Final Settlements (`FIN-B`)**: Verified Partner B authorizes prepared Month $N$ direct maturity settlement vouchers (`VERIFIED_BY_MAKER` on Month $N$ `SCHEDULED` auction, `maker != checker`).

---

## 2. API Endpoints

### 2.1 Aggregated Pending Approvals (`GET /api/v1/reports/pending-approvals`)
- **Route**: `GET /api/v1/reports/pending-approvals`
- **Query Parameters**:
  - `branchId?: string` (Optional; `SUPER_ADMIN`, `ACCOUNTANT`, `AUDITOR` only — rejected with `403 Forbidden` if a `BRANCH_MANAGER` specifies a foreign branch).
  - `actionableOnly?: boolean` (Optional; filters each queue strictly to items where `canCurrentUserApprove === true` for the authenticated caller under Guardrails 10 & 11).
- **Authorized Roles**: `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, `AUDITOR` *(client hook `useApprovalsStream` strictly gates out `COLLECTION_AGENT` via `canQueryDashboardReports(user)` to prevent `403` polling loops per `DEF-M10-WEB-01`)*.
- **Branch Scoping (Fail-Closed Anti-BOLA)**:
  - `BRANCH_MANAGER`: Strictly restricted to their assigned `branchId`; fails closed with `403 Forbidden (BRANCH_SCOPE_REQUIRED)` if `branchId` is null/empty or foreign.
  - `SUPER_ADMIN`, `ACCOUNTANT`, `AUDITOR`: Company-wide visibility across all branches (or optional `branchId` filter).
- **Caching & Stampede Protection**:
  - Branch-scoped base snapshot cached in Redis (`report:approvals:<branchId|ALL>`, TTL `15s` with $\pm 15\%$ jitter) behind a tokenized mutex lock (`DistributedLockService` with atomic Lua release).
  - Caller-specific flags (`isOwnRequest`, `canCurrentUserApprove`, `summary.actionableByCurrentUserCount`) are computed **post-cache** via `annotatePendingApprovalsForUser` to guarantee zero cross-user cache contamination.

### 2.2 Real-Time Server-Sent Events (SSE) Stream (`GET /api/v1/reports/approvals-stream`)
- **Route**: `GET /api/v1/reports/approvals-stream` (`@Sse('approvals-stream')` + `@BypassEnvelope()` per `DEF-M10-SSE-01` so `TransformResponseInterceptor` never wraps or corrupts browser `EventSource` framing).
- **Protocol**: HTTP/1.1 or HTTP/2 Server-Sent Events (`text/event-stream`), proxied unbuffered (`proxy_buffering off`, `24h` timeout) via Nginx & Next.js BFF (`/bff/api/v1/reports/approvals-stream`).
- **Authorized Roles**: `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, `AUDITOR`.
- **Emission Cadence & Resilience (`DEF-M10-SSE-02`)**:
  - Emits `APPROVALS_UPDATE` immediately upon connection and every 15 seconds thereafter, synchronizing all **8 queues** across Web Zustand (`approvals-store.ts`) and React Query cache (`queryClient.setQueryData` per `DEF-M10-WEB-02`).
  - `resolveLiveStreamUser(currentUser)` runs inside `try/catch`: transient DB/pool hiccups emit `{ type: 'HEARTBEAT' }` to keep the pipe alive, while any `UnauthorizedException` or `ForbiddenException` rethrows fail-closed to terminate the stream immediately.
- **Mid-Flight Session & Token Expiry Assertion (`F15` + `F04`)**: On every 15-second tick, `assertStreamAuthorization` verifies JWT expiration (`now < exp`), fast-path Redis revocation (`auth:revoked:${sub}`), live DB `isActive` & `tokenRevokedBefore`, active `Session` row (`sid`), live role membership, and non-empty `branchId` for `BRANCH_MANAGER`.

---

## 3. Company-Wide Approval Governance & Dual-Control Boundary Matrix

Distilling the complete 19-operation company governance audit across Kumaran Finance's 4-partner operating structure:

| Governance Category | Operations Covered | Enforced Mechanism / Rationale |
|---|---|---|
| **Strict Dual Control (`Maker != Checker`) — Enforced Live** | Auction Finalization, Finalized Auction Correction (Queue 6), Prize Disbursement Authorization, Cash Handover Acknowledgment, UPI Claim Verification (`submitter != verifier`), Payment Reversal (Verified Partner Maker + Verified Partner Checker per `KFC-SEC-001`), 3-Month Defaulter Removal (2-Partner Dual Control per `ADR-22` + `chk_ticket_removal_maker_checker`), Month $N$ Direct Settlement (Queue 8) | Enforced in application services (`assertVerifiedPartner`, `SELECT FOR UPDATE` row locks) and **8 PostgreSQL engine-level `CHECK` constraints** |
| **Gated Downstream Execution** | Prize Payment Release (`POST /api/v1/disbursements/:id/release`) | Single-user cashier/partner execution strictly gated by prior `AUTHORIZED_BY_CHECKER` state |
| **Single-Person Operational Actions (Partner-Governed Scope)** | Customer Intake & Optional KYC (`ADR-16`), Chit Scheme Creation & Activation, Subscriber Ticket Assignment (`ADR-13`), Counter/Field Cash Collection & Receipt Issuance, Defaulter Substitution (Statutory Partner `Role.PARTNER`), Staff Account Creation & Role Updates, Sub-Registrar Minutes Filing | Designed for Perundurai branch operational velocity; elevated multi-partner quorum options (e.g., 2-partner scheme activation or `SUPER_ADMIN` promotion) remain tracked as future partner-policy extensions |
| **Intentionally Immutable / Read-Only By Design** | Financial Reports (`report.controller.ts` — strictly `@Get` / `@Sse`, zero overrides), Disbursed Prize Payouts (`DISBURSED` terminal state, `FIN-05`), Immutable `AuditLog` (`ENABLE ALWAYS` triggers + `SUPER_ADMIN`-only viewing per Guardrail 11) | Statutory Chit Funds Act 1982 & ledger integrity mandates; no persistent customer bank-account table exists (payout details captured per disbursement under `ADR-15`) |
| **External Infrastructure / CLI Operations** | Disaster Recovery Restore (`infra/scripts/restore-from-s3.sh` / `apps/api/scripts/ops/restore-from-s3.ts`) | Zero in-app restore endpoints; production DRP runbook mandates dual-partner server sign-off before executing `pg_restore` |

---

## 4. Statutory Register & Reporting Module Hardening Baseline

All **9 endpoints** in `apps/api/src/report/report.controller.ts` (`dashboard`, `pending-approvals`, `approvals-stream`, `day-book`, `form-xxii`, `form-xvii`, `form-xxi`, `defaulters`, and `SUPER_ADMIN`-only `audit-logs`) enforce these verified invariants:

1. **Form XXII Cash Book Continuity (`DEF-M10-STAT-01`, `DEF-M10-STAT-02`)**:
   - Preserves historical cash inflows (`paymentStatus: { in: ['SUCCESS', 'REVERSED'] }`) and records approved physical cash reversals as `CASH_PAYMENT_REVERSAL` (`REV-`) outflows keyed on `reversedAt` rather than retroactively mutating prior day balances.
   - Keys `ACKNOWLEDGED` field cash handovers to `cashHandoverAcknowledgedAt ?? createdAt` so $\text{Opening Cash}(T) \equiv \text{Closing Cash}(T - 1)$ holds strictly across IST midnight boundaries.
2. **Form XXI Continuous Subscriber Passbook (`DEF-M10-STAT-03`)**:
   - Emits exact 64-bit `BigInt` running cumulative totals (`cumulativeGrossDue`, `cumulativeDividendCredit`, `cumulativeNetPayable`, `cumulativePaid`, `runningBalance`) per row plus a contiguous `1..N` `contiguousSchedule` and `passbookPrintMeta`, enforcing fail-closed customer self-isolation (`XR-M7-RPT-04`).
3. **Form XVII Auction Minutes Register (`DEF-M10-STAT-04`)**:
   - Filters strictly to Months $2$ through $N-1$, formats frozen `ChitGroup.foremanCommissionRate` dynamically, tracks the 21-day Sub-Registrar filing countdown, and exposes `winningTokenNumber`, `tiedDiscountAmount`, and per-bidder `bidDiscount` for Option A paper-token tie-breaks.
4. **Defaulters, Pagination & Cross-Tier Contract Parity (`DEF-M10-DEF-01`, `DEF-M10-DTO-01`, `DEF-M10-MOB-01`, `DEF-M10-SDK-01`)**:
   - Dashboard arrears aging and Defaulters Register exclude both `REMOVED_DEF_3M` and `SURRENDERED` tickets (`status: { notIn: ['REMOVED_DEF_3M', 'SURRENDERED'] }`).
   - Query DTOs enforce `@MaxLength(100)` on string filters and `@Max(10000)` on `page` (`validatePagination`) to prevent deep SQL `OFFSET` abuse.
   - Web report utilities harden IST date formatting (`formatIstDateString`), empty-date guards, sanitized PDF/CSV filenames, and safe denominators (`DEF-M10-WEB-03..08`); `@kumaran/api-client` and Dart Core `api_models.dart` enforce 64-bit integer whole-rupee contracts (`10/10` SDK tests, `6/6` Dart suites).

---

## 5. Verification & Testing

Verified by **60 automated Jest unit tests** across **3 spec files** under `apps/api/test/unit/`:

| Spec File | Tests | Verified Scope |
|---|:---:|---|
| `apps/api/test/unit/report.spec.ts` | **47** | 8-queue Maker–Checker aggregation, fail-closed branch scoping, post-cache Partner / `actionableOnly` flags, `@BypassEnvelope()` & SSE heartbeat/auth termination, `take: 200` Queue 6 bound, `SURRENDERED` exclusion, `@Max(10000)` pagination bounds, IST boundaries, Audit Log secret redaction |
| `apps/api/test/unit/report-etag.spec.ts` | **9** | Caller-scoped HTTP `304 Not Modified` ETag isolation for historical closed reports |
| `apps/api/test/unit/statutory-report-m10.spec.ts` | **4** | Form XXII physical cash reversal outflows & `cashHandoverAcknowledgedAt` continuity, Form XXI running `BigInt` cumulative totals & `1..N` grid, Form XVII Option A tie-break metadata |

```bash
pnpm --filter api test -- test/unit/report.spec.ts test/unit/report-etag.spec.ts test/unit/statutory-report-m10.spec.ts
```
