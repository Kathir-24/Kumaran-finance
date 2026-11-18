# Real-Time Maker-Checker Actions & Pending Approvals Stream (`apps/api/src/report`)

## 1. Context & Business Need
In **Kumaran Chits** (Kumaran Finance), strict dual control is an invariant architectural guardrail (Guardrail #10: Maker $\ne$ Checker) reinforced by Verified Partner Identity (Guardrail #11 / ADR-21: `isPartner: true`). Sensitive financial mutations cannot be finalized by a single individual or by administrative IT Super Admins (`isPartner: false`):
1. **Cash Handovers**: Field agents submit collected cash (`PENDING_HANDOVER`); an independent staff/partner (`collector != acknowledger`) counts and signs off into the vault.
2. **Payment Reversals**: Partner A initiates a reversal (`REQUESTED`); an independent verified Partner B approves (`POST /payments/:id/approve-reversal`).
3. **Safety Proof Verifications**: Desk staff verifies safety proof documents on finalized auctions (`COMPLETED` / `MINUTES_FILED`, `PENDING_VERIFICATION`).
4. **Prize Disbursement Authorizations**: Verified Partner B authorizes payouts verified by Maker (`VERIFIED_BY_MAKER`, `maker != checker`).
5. **Auction Finalizations**: Verified Partner B finalizes offline auction results recorded by Maker (`SCHEDULED` Months 2..N-1 with winner recorded, `maker != checker`).
6. **Finalized Auction Corrections**: Verified Partner B approves post-finalization correction requests (`AUCTION_CORRECTION_REQUESTED` without subsequent approval, `maker != checker`).
7. **Defaulter Removals**: Verified Partner B approves 3-month consecutive defaulter removal requests (`PENDING_REMOVAL_APPROVAL`, `maker != checker`).
8. **Month N Final Settlements**: Verified Partner B authorizes prepared Month N maturity settlement vouchers (`VERIFIED_BY_MAKER` on Month N `SCHEDULED` auction, `maker != checker`).

---

## 2. API Endpoints

### 2.1 Aggregated Pending Approvals (`GET /reports/pending-approvals`)
- **Route**: `GET /reports/pending-approvals`
- **Query Parameters**:
  - `branchId?: string` (Optional; `SUPER_ADMIN`, `ACCOUNTANT`, `AUDITOR` only — rejected with `403 Forbidden` if a `BRANCH_MANAGER` specifies a foreign branch)
  - `actionableOnly?: boolean` (Optional; when `true`, filters each queue strictly to items where `canCurrentUserApprove === true` for the authenticated caller under Guardrails 10 & 11)
- **Authorized Roles**: `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, `AUDITOR`
- **Branch Scoping (Fail-Closed Anti-BOLA)**:
  - `BRANCH_MANAGER`: Strictly restricted to their assigned `branchId`. Fails closed with `403 Forbidden` (`BRANCH_SCOPE_REQUIRED`) if `branchId` is null/empty or if a foreign `branchId` is requested.
  - `SUPER_ADMIN`, `ACCOUNTANT`, `AUDITOR`: Company-wide visibility across all branches (or optional `branchId` filter).
- **Caching & Stampede Protection**:
  - Branch-scoped base snapshot cached in Redis (`report:approvals:<branchId|ALL>`, TTL `15s` with $\pm 15\%$ jitter) behind a tokenized mutex lock (`DistributedLockService` / atomic Lua release).
  - Caller-specific flags (`isOwnRequest`, `canCurrentUserApprove`, `summary.actionableByCurrentUserCount`) are computed **post-cache** per caller to prevent cross-user cache contamination.

### 2.2 Real-Time Server-Sent Events (SSE) Stream (`GET /reports/approvals-stream`)
- **Route**: `GET /reports/approvals-stream`
- **Protocol**: HTTP/1.1 or HTTP/2 Server-Sent Events (`text/event-stream`)
- **Authorized Roles**: `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, `AUDITOR`
- **Emission Cadence**: Emits an `APPROVALS_UPDATE` event immediately upon connection, and subsequently every 15 seconds.
- **Mid-Flight Session & Token Expiry Assertion (F15 + F04)**: On each 15-second tick before emitting summary data, `ReportService.assertStreamAuthorization` validates:
  - Access token expiration (`now < exp`).
  - Fast-path Redis revocation cutoff (`auth:revoked:${sub}`).
  - Database active status (`user.isActive`) and durable `tokenRevokedBefore`.
  - Persisted multi-device `Session` identity (`sid`, non-revoked, non-expired) when present.
  - Live role membership (`SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, or `AUDITOR`) and non-empty `branchId` for `BRANCH_MANAGER`.
  - Any failure throws `UnauthorizedException` or `ForbiddenException`, immediately closing the SSE pipe.

---

## 3. Verification & Testing
- Unit tests in `apps/api/test/unit/report.spec.ts` and `apps/api/test/unit/report-etag.spec.ts` verify:
  1. Complete aggregation across all 8 Maker-Checker queues with pure 64-bit `BigInt` whole-rupee math.
  2. Fail-closed branch scoping (rejecting null `branchId` and cross-branch attempts).
  3. Post-cache per-caller Maker-Checker (`maker != checker`) and Partner Identity (`isPartner: true`) actionability flags and `?actionableOnly=true` filtering.
  4. Strict `Asia/Kolkata` (IST) day boundaries, dynamic frozen commission rates, 21-day Form XVII Registrar countdown, Audit Log secret redaction, and caller-scoped HTTP 304 ETag isolation.
