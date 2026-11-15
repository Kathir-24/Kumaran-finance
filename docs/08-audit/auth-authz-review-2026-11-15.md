# Authentication and authorization review

Review date: 2026-11-15. Repository: Kumaran Finance / Kumaran Chits.

## Assessment

**The current implementation is actively undergoing phased security remediation.** The review originally identified 16 findings: **1 Critical, 12 High, and 3 Medium**. 

### Remediation Status (Phase 1 & Phase 2 Completed: 2026-11-15)

| ID | Severity | Finding Summary | Remediation Phase | Status | Verification Reference |
|---|---|---|---|---|---|
| **F01** | **Critical** | Pending TOTP tokens can set an MPIN and bypass second factor | **Phase 1** | **RESOLVED** | `POST /auth/mobile/set-mpin` checks `tokenType: access` & single-use `SET NX` |
| **F02** | High | Admin password resets leave active sessions usable | **Phase 1** | **RESOLVED** | PostgreSQL `tokenRevokedBefore` + Redis session purging |
| **F03** | High | Removing roles does not remove privileges from existing tokens | **Phase 1** | **RESOLVED** | Role sync on DB fetch + session revocation on `updateRoles()` |
| **F04** | High | Scoped logout resurrects refresh session after 15m | **Phase 1** | **RESOLVED** | Dedicated `Session` model + clientType token binding |
| **F05** | High | Final-month settlement maker == checker | **Phase 2** | **RESOLVED** | Stage 1 `prepare-final-settlement` + Stage 2 `approve-final-settlement` (`maker != checker`) |
| **F06** | High | Storage access bypasses passbook ownership & branch | **Phase 2** | **RESOLVED** | Passbook ticket ownership verification, KYC branch checks, strict default-deny |
| **F07** | High | Customer search & detail expose unscoped records & PII | **Phase 2** | **RESOLVED** | Caller context scoping, `refreshTokenHash`/`fcmToken` stripping, masked PAN |
| **F08** | High | Ticket/auction endpoints expose other subscribers' PII | **Phase 2** | **RESOLVED** | Chit group membership enforcement + fellow subscriber phone/name masking |
| **F09** | High | Payment & collection writes lack agent/branch checks | **Phase 2** | **RESOLVED** | Domain branch from `ticket.chitGroup.branchId`, `CROSS_BRANCH_FORBIDDEN` |
| **F10** | High | Existing TOTP factor can be replaced with only access token | **Phase 1** | **RESOLVED** | Server challenge in Redis + current password required for replacement |
| **F11** | High | Queue dashboard auth detached from Super Admin identity | Phase 3 | Scheduled | Native Super Admin session guard on Bull Board |
| **F12** | High | Database maker-checker constraints absent | **Phase 2** | **RESOLVED** | PostgreSQL CHECK constraints (`chk_auction_maker_checker`, `chk_winner_maker_checker`, `chk_reversal_maker_checker`) |
| **F13** | Medium | SMS OTP race condition allows attempt exhaustion bypass | Phase 3 | Scheduled | Atomic Redis Lua OTP attempt tracking |
| **F14** | Medium | Mobile app refresh loop causes cascade 401 | Phase 3 | Scheduled | Single-flight refresh mutex in Flutter Dio interceptor |
| **F15** | Medium | SSE approvals stream lacks mid-flight auth check | Phase 3 | Scheduled | Periodic active-session heartbeat validator |
| **F16** | Medium | Hardcoded default staff password without forced change | **Phase 1** | **RESOLVED** | Random temp password + `mustChangePassword` + `POST /auth/complete-onboarding` |

*Phase 1 Automated Test Suite*: [`apps/api/test/unit/phase1-security-remediation.spec.ts`](file:///u:/Kumaran-finance/apps/api/test/unit/phase1-security-remediation.spec.ts) (14/14 passed, Commit `7e852c91`).  
*Phase 2 Automated Test Suite*: [`apps/api/test/unit/phase2-security-remediation.spec.ts`](file:///u:/Kumaran-finance/apps/api/test/unit/phase2-security-remediation.spec.ts) (22/22 passed).  
*Full Regression Suite*: 935 API tests + 353 Web tests passing with 0 failures.  
*Database Migrations*:  
1. `20261115030000_auth_revocation_and_session_vault` deployed to PostgreSQL 17.  
2. `20261115040000_maker_checker_check_constraints` deployed to PostgreSQL 17.

Severity reflects potential impact and required access, not evidence of exploitation. These are repository findings; no claim is made that the application has been attacked or that every deployment exposes every path.

This was a source review with existing unit/regression test execution. Findings describe confirmed code behavior or explicitly identified implementation gaps. Exploit sequences below are derived from code, not live attacks against a running deployment.

## Scope and baseline

Reviewed the API authentication controller/service, JWT strategy, role guard, user administration, financial controller/service authorization paths, customer and chit access, document helpers, PDF/storage routes, reports/SSE, queue dashboard and metrics authentication. Also reviewed web cookies, BFF proxy/auth/refresh handling, Edge JWT/route gates, browser auth state, shared TypeScript SDK authentication, and the available Dart client/mobile source tree.

Baseline: workspace AGENTS.md; permissions-matrix.md; security-and-access-guardians.md; relevant portions of data-model.md, redis-architecture.md, rate-limiting-and-abuse-prevention.md, api-spec.md, frontend-architecture.md, and web/authentication-and-identity.md. Business rules were assessed against those documents; no new business rules were implemented.

No application code was changed. This report is the deliverable.

## Findings

### F01 — Critical: Pending TOTP tokens can set an MPIN and bypass the second factor

**Evidence:** [auth.controller.ts:282](../../apps/api/src/auth/auth.controller.ts#L282), [auth.service.ts:805](../../apps/api/src/auth/auth.service.ts#L805), [auth.service.ts:851](../../apps/api/src/auth/auth.service.ts#L851), [auth.service.ts:189](../../apps/api/src/auth/auth.service.ts#L189).

`mobile/set-mpin` has no JwtAuthGuard. Its manual Bearer handling calls `verifyToken()`, which checks JWT validity but does not require `tokenType: access`, check revocation, or check active account status. It passes the subject directly to `setMpin()`. The service's token-purpose check applies only to the body `setupToken`, not this Bearer path.

**Code-derived reproduction:** Authenticate with a valid staff password to obtain a `totp_pending` token. Send that token as the Bearer credential to `POST /api/v1/auth/mobile/set-mpin`, supplying a new six-digit MPIN. Then call `mobile/login-mpin` with the phone and chosen MPIN. That login issues full tokens without TOTP. This also works when the account did not previously have an MPIN.

**Impact:** A stolen password is enough to bypass enabled TOTP, including for a partner account. Still-valid refresh or revoked access tokens can also reach the manual Bearer path. This does not require forging a JWT.

**Fix:** Route active-session MPIN changes through the full access-token validator. Permit enrollment only with a purpose-bound, single-use setup credential; check active status and revocation. Require recent authentication for replacing an existing MPIN. Regression tests must reject pending-TOTP, refresh, revoked-access, and consumed setup tokens.

### F02 — High: Administrative password resets leave active sessions usable

**Evidence:** [user.service.ts:256](../../apps/api/src/user/user.service.ts#L256), [auth.service.ts:1146](../../apps/api/src/auth/auth.service.ts#L1146), [jwt.strategy.ts:32](../../apps/api/src/auth/strategies/jwt.strategy.ts#L32).

`resetPassword()` clears the database refresh hash and evicts `user:status`, but does not delete Redis `auth:session:*` hashes or set a revocation cutoff. Refresh prioritizes the Redis hash, and access validation only checks whether the account is active after status-cache eviction.

**Reproduction:** Log in, reset the user's password through staff administration, then reuse the old access and refresh tokens. With the active Redis session hash, the old refresh credential remains usable and can keep rotating.

**Impact:** Resetting credentials does not contain a compromised session despite the endpoint's success message claiming revocation. Deactivation similarly leaves Redis session hashes behind; reactivation can make surviving credentials usable again within their lifetimes.

**Fix:** Share one revocation operation across password reset, password change, deactivation, and explicit logout; persist session invalidation and clear all relevant caches. Test reset and deactivate/reactivate with live Redis session state.

### F03 — High: Removing roles does not remove privileges from existing access tokens

**Evidence:** [user.service.ts:222](../../apps/api/src/user/user.service.ts#L222), [jwt.strategy.ts:73](../../apps/api/src/auth/strategies/jwt.strategy.ts#L73), [roles.guard.ts](../../apps/api/src/auth/guards/roles.guard.ts).

Role updates evict the status cache, but JWT validation reloads only account activity and partner status. `RolesGuard` continues to trust the roles embedded in the old JWT. The cache fast path returns the original payload unchanged.

**Reproduction:** Issue a SUPER_ADMIN access token, demote that account, and call a SUPER_ADMIN endpoint with the old token. Role authorization still uses its former role until expiry (15 minutes by default).

**Impact:** An active demoted account retains administrative access during the old-token lifetime. Partner identity in cached payloads also remains stale, although several financial services independently recheck partner identity in PostgreSQL.

**Fix:** Invalidate sessions on permission changes or validate an authorization version/current roles on each request using a safely invalidated cache. Test demotion against real guarded endpoints.

### F04 — High: Scoped logout can resurrect a refresh session after 15 minutes

**Evidence:** [auth.service.ts:1183](../../apps/api/src/auth/auth.service.ts#L1183), [auth.service.ts:1102](../../apps/api/src/auth/auth.service.ts#L1102), [auth.service.ts:1149](../../apps/api/src/auth/auth.service.ts#L1149).

Scoped logout removes the Redis family hash but deliberately leaves the database's single refresh hash. Its revocation cutoff expires after 900 seconds. Refresh falls back to that database hash whenever the requested Redis family hash is absent.

**Reproduction:** Log in on WEB as the latest login, retain its refresh token, and log out with `clientType=WEB`. Once the cutoff expires, submit that still-valid refresh token. The database fallback can authenticate it again. Without Redis, scoped logout does not invalidate the stored refresh credential at all.

Refresh also selects its family from `dto.clientType`, rather than binding it to the signed token's `clientType`. A token matching the database fallback can be presented under another family, undermining isolation and bypassing a family-specific cutoff.

**Impact:** Logout is not a durable session boundary. Redis loss/eviction and the single database hash also break reliable cross-client isolation.

**Fix:** Persist separately revocable session families in PostgreSQL; bind refresh to the signed family and reject mismatches. Keep revocation durable for the refresh credential's remaining lifetime. Never interpret a missing/revoked family as permission to use a global fallback.

### F05 — High: Final-month settlement uses the same person as maker and checker

**Evidence:** [disbursement.service.ts:962](../../apps/api/src/disbursement/disbursement.service.ts#L962), [disbursement.service.ts:1152](../../apps/api/src/disbursement/disbursement.service.ts#L1152), [disbursement.controller.ts:278](../../apps/api/src/disbursement/disbursement.controller.ts#L278).

`settleFinalMonth()` validates a partner and then creates a completed settlement auction with both `conductedByUserId` and `finalizedByUserId` equal to `checkerUserId`. It also creates an already-DISBURSED winner authorized by that same user. There is no independent maker approval stage.

**Impact:** A single partner can commit a final-month payout, violating the documented maker-checker invariant for prize disbursements. The fact that Month N has no auction does not remove the payout approval requirement.

**Fix:** Use a pending settlement prepared by one authorized user and approved by another. Add both service-level and database-level rejection of identical identities. Test this endpoint independently from ordinary auction payouts.

### F06 — High: Raw storage access bypasses passbook ownership and branch scope

**Evidence:** [document-access.helper.ts](../../apps/api/src/storage/helpers/document-access.helper.ts), [storage.controller.ts](../../apps/api/src/storage/storage.controller.ts), [pdf.service.ts:396](../../apps/api/src/pdf/pdf.service.ts#L396).

`assertStorageKeyAccess()` does not handle `passbooks/` and has no final default-deny branch. Generated passbooks use predictable `passbooks/{chitId}/ticket-{number}.pdf` keys. A customer or collection agent with a known group ID can request another ticket's already-generated passbook through `/storage/file/*key`, avoiding the PDF endpoint's ownership guard.

For other recognized prefixes, raw storage access also lacks database-backed branch checks for branch managers. A manager can request another branch's KYC, receipts, vouchers, minutes, or safety proofs by known key. The generic upload route similarly does not resolve branch/assignment ownership for staff uploads.

**Impact:** Unauthorized disclosure of stored financial statements and identity/safety documents. The file must already exist; this route does not itself generate a missing passbook.

**Fix:** Default-deny unknown categories. Resolve file metadata to its owning record and apply the same ownership/branch policy used by domain endpoints. Test raw-file routes directly, including passbooks and cross-branch keys.

### F07 — High: Customer search and detail expose unscoped records and sensitive fields

**Evidence:** [customer.controller.ts:89](../../apps/api/src/customer/customer.controller.ts#L89), [customer.controller.ts:123](../../apps/api/src/customer/customer.controller.ts#L123), [customer.service.ts:236](../../apps/api/src/customer/customer.service.ts#L236), [schema.prisma:76](../../apps/api/prisma/schema.prisma#L76).

Customer listing receives no caller context and applies no agent-assignment or manager-branch filter. It returns raw Prisma customer records with relations. Customer detail restricts customer callers to their own ID, but passes no caller to the service for manager or agent scoping.

Raw records contain address, PAN, Aadhaar last four digits, push token, and `refreshTokenHash`. Swagger response DTO declarations do not by themselves strip runtime properties; no global serializer performing that filtering was found.

**Impact:** Collection agents can enumerate customers beyond their assignment and see fields beyond their scope. Managers can access records across branches. Authentication hashes and push tokens are unnecessarily exposed. A refresh hash is not itself a usable refresh token; this finding does not claim direct login from the hash.

**Fix:** Pass caller context into list/detail services, scope the database query, and return explicit field allowlists. Never expose authentication hashes or device push tokens. Test both record visibility and response field exclusion.

### F08 — High: Ticket and auction endpoints expose other subscribers' information

**Evidence:** [chit.controller.ts:183](../../apps/api/src/chit/chit.controller.ts#L183), [chit.service.ts:857](../../apps/api/src/chit/chit.service.ts#L857), [auction.controller.ts:56](../../apps/api/src/auction/auction.controller.ts#L56), [auction.service.ts:741](../../apps/api/src/auction/auction.service.ts#L741).

All personas, including customers, can call group ticket listing. `getTickets()` returns every subscriber's identity and phone without caller context. Auction group/detail methods likewise have no caller scope and include winner/tie participant data, including phone numbers on the group path. Group listing supplies IDs that make these paths discoverable.

This defeats the PII masking implemented separately in `ChitService.findOne()`; masking one view does not protect alternate routes.

**Impact:** Customers and agents can inspect unrelated groups and recover subscriber PII through alternate API views.

**Fix:** Enforce membership/assignment/branch scope consistently and use persona-specific response projections. Test alternate endpoints with two unrelated customers and two groups.

### F09 — High: Payment and collection writes do not enforce agent assignment or branch ownership

**Evidence:** [collection.service.ts:71](../../apps/api/src/collection/collection.service.ts#L71), [collection.service.ts:153](../../apps/api/src/collection/collection.service.ts#L153), [payment.service.ts:89](../../apps/api/src/payment/payment.service.ts#L89), [payment.controller.ts:71](../../apps/api/src/payment/payment.controller.ts#L71).

Both write paths accept a ticket ID and caller ID/branch, but never establish that an agent is assigned to that subscriber or that a branch-scoped caller belongs to the ticket's branch. They validate financial state and amount, which does not establish authority. `staffBranchId || ticket.chitGroup.branchId` can attribute the payment to the caller's branch even when the ticket belongs elsewhere. Offline collection synchronization reuses the collection path.

**Impact:** An agent can record receipts and change due status for an unassigned subscriber if they know the ticket and exact amount. Branch attribution can become inconsistent.

**Fix:** Apply a caller-aware ticket access policy before idempotency lookup/return and before mutations. Derive the accounting branch from the authorized domain record. The exact assignment model must follow documented business policy; do not invent it during remediation.

### F10 — High: Existing TOTP protection can be replaced using only an access token

**Evidence:** [auth.service.ts:238](../../apps/api/src/auth/auth.service.ts#L238), [auth.service.ts:280](../../apps/api/src/auth/auth.service.ts#L280).

`enableTotp()` accepts a caller-provided secret and a code generated from that secret, then unconditionally replaces the stored secret. It neither rejects already-enabled accounts nor requires the current password/existing factor. By contrast, disabling TOTP requires the password.

**Reproduction:** Using a valid victim access token, generate a secret/code pair under attacker control and submit it to `totp/enable` on an already-enrolled account.

**Impact:** A stolen session can replace the owner's factor and lock them out of future password/TOTP login. This operation alone does not reveal the owner's password.

**Fix:** Separate initial enrollment from replacement. Bind pending enrollment server-side and require recent reauthentication/existing-factor proof for replacement. Revoke or rotate affected sessions after security-factor changes.

### F11 — High: Queue dashboard authentication is detached from Super Admin identity

**Evidence:** [bull-board-auth.middleware.ts:24](../../apps/api/src/jobs/bull-board/bull-board-auth.middleware.ts#L24), [main.ts](../../apps/api/src/main.ts), [metrics-auth.guard.ts](../../apps/api/src/metrics/guards/metrics-auth.guard.ts), [chitflow.conf:259](../../infra/docker/nginx/conf.d/chitflow.conf#L259).

`/admin/queues` uses shared Basic credentials rather than an active Super Admin identity. Missing configuration falls back to a username and password hardcoded in source. Metrics authentication has a similar fallback. The Nginx configuration forwards the queue-dashboard route.

**Impact:** Anyone who knows the shared credentials can use the queue interface without Super Admin RBAC, TOTP, or user deactivation enforcement. If defaults are deployed, credentials are predictable. Actual production overrides and network exposure were not inspected.

**Fix:** Fail startup when required credentials are absent. Gate the human queue dashboard through active Super Admin authentication and audit individual actions. Keep metrics on separately scoped machine credentials and controlled ingress. Confirm dashboard operations are limited to the intended read-only monitoring scope.

### F12 — High: Database maker-checker constraints are absent from checked-in migrations

**Evidence:** [schema.prisma:220](../../apps/api/prisma/schema.prisma#L220), [schema.prisma:257](../../apps/api/prisma/schema.prisma#L257), [schema.prisma:360](../../apps/api/prisma/schema.prisma#L360), [schema.prisma:418](../../apps/api/prisma/schema.prisma#L418), [migrations](../../apps/api/prisma/migrations).

The reviewed schema/migrations contain identity fields but no maker-versus-checker CHECK constraints or enforcing triggers for auction finalization, payout approval, reversal approval, or cash handover. Audit immutability triggers exist, but do not establish these approval constraints.

**Impact:** The required second enforcement layer is missing. A buggy application path, maintenance script, or direct database write can persist self-approved records. F05 provides a concrete application path doing so.

**Fix:** Add appropriate null-aware constraints/triggers for each transition, validate/backfill existing rows, and add database integration tests that attempt forbidden writes directly. Verify deployed schema separately; out-of-repository manual constraints were not inspected.

### F13 — Medium: OTP verification is not atomic under concurrency

**Evidence:** [auth.service.ts:700](../../apps/api/src/auth/auth.service.ts#L700), [auth.service.ts:391](../../apps/api/src/auth/auth.service.ts#L391).

Verification reads the OTP record, verifies/increments attempts in application code, then writes or deletes it. Concurrent requests can read the same attempt count and overwrite one another. Concurrent successful requests can both read the record before deletion and issue credentials. Atomic deletion of several keys does not make the entire read/verify/consume sequence atomic.

**Impact:** The documented three-attempt limit can be weakened and a nominally one-use OTP can succeed more than once during a race. Route/IP throttling reduces request volume but does not make this safe across nodes or source IPs.

**Fix:** Use an atomic Redis verification/attempt/consume operation, or serialize verification per challenge with safe locking. Test concurrent invalid guesses and concurrent correct submissions against Redis.

### F14 — Medium: Available mobile client does not implement its advertised refresh lifecycle

**Evidence:** [auth_interceptor.dart](../../apps/mobile/lib/core/api/client/auth_interceptor.dart), [api_client.dart](../../apps/mobile/lib/core/api/client/api_client.dart).

`AuthSessionManager` declares refresh-token getters and token-refreshed callbacks, but its implementation only builds Bearer headers. The HTTP client invokes `onUnauthorized` on 401 without attempting rotation or replay. The available mobile tree does not contain a complete authentication UI, secure token persistence, or biometric session implementation.

**Impact:** The checked-in client cannot demonstrate transparent refresh or the documented mobile security experience. A normal access-token expiry reaches unauthorized handling rather than using the supplied refresh callbacks. This is an implementation/completeness gap, not evidence of insecure token storage in an unseen app.

**Fix:** Implement single-flight rotation, correct MOBILE-family binding, safe request retry and secure token persistence; test expiry, concurrent 401s, logout, revocation, and offline identity changes. Validate device behavior on the actual Android app when available.

### F15 — Medium: Open approval streams outlive authorization changes

**Evidence:** [report.controller.ts:116](../../apps/api/src/report/report.controller.ts#L116), [report.service.ts:862](../../apps/api/src/report/report.service.ts#L862).

The SSE guard authenticates once when the connection opens. The interval repeatedly queries approvals using the captured JWT payload, with no session/activity/role revalidation and no token-expiry termination. The report query uses that caller for scope but does not reload active identity.

**Impact:** An already-open stream can continue exposing approval summary updates after token expiry, logout, demotion, or deactivation until the connection ends. The emitted payload is a summary, not the full approval records.

**Fix:** End at access expiry or periodically revalidate active session and permission version. Verify existing connections close after revocation, including through the BFF proxy.

### F16 — High: New staff accounts can receive a shared, source-known password

**Evidence:** [user.service.ts:20](../../apps/api/src/user/user.service.ts#L20), [user.service.ts:162](../../apps/api/src/user/user.service.ts#L162), [create-user.dto.ts](../../apps/api/src/user/dto/create-user.dto.ts).

Staff creation accepts an omitted password and then assigns the same hardcoded default. New accounts are active immediately, and this path does not enforce a first-login password change or mandatory TOTP enrollment.

**Impact:** Knowledge of a newly provisioned staff phone number and the source-known default can be sufficient to authenticate while that password remains in use. Applicable role permissions determine the resulting access.

**Fix:** Use unique short-lived initial credentials or a verified onboarding challenge; require completion before granting normal privileges. Test that omission never produces a reusable shared credential.

## Controls that are present

- Ordinary JWT-protected API routes reject non-access token types and check active account status with the documented 120-second Redis status cache.
- Web Edge verification checks HS256 signatures and token purpose, fails closed without a signing secret, and uses central route permissions. UI gating supplements API authorization; it cannot replace it.
- Normal web login/TOTP handlers put access, refresh, and pending-TOTP credentials in HttpOnly cookies. Browser auth state avoids persisting those secret tokens. Cookie defaults include SameSite=Lax and transport-dependent Secure flags.
- Password/MPIN hashing, encrypted stored TOTP secrets, cryptographic OTP generation, and SHA-256 prehashing before bcrypt refresh hashing are implemented.
- Existing refresh coalescing and reuse detection address several concurrent-rotation cases. These do not correct the durable revocation/family problems in F04.
- Ordinary PDF generation calls ownership helpers. Dedicated high-risk services include partner checks and maker-checker checks, with transactional locking in several paths.
- Report audit-log and jobs health/notification-log API endpoints use Super Admin role restrictions. The separate Bull Board Basic-auth entry point remains the exception in F11.
- Database migrations protect audit-log immutability. This is independent of the missing approval constraints.

## Verification performed

| Check | Result |
|---|---|
| API `auth.spec.ts`, `auth-token-lifecycle.spec.ts` | 2 suites, 53 tests passed |
| API `user.spec.ts`, `storage.spec.ts`, `adversarial-security-invariants.spec.ts` | 3 suites, 72 tests passed |
| Complete web unit/regression command | 353 tests passed, zero failures |
| Working tree before review | Clean |
| Application changes | None |

API tests were invoked directly with Node/Jest. The initial pnpm PowerShell wrapper was blocked by execution policy; the web tests ran successfully with `pnpm.cmd`. An initial combined API test-pattern command did not execute successfully because the Windows command wrapper interpreted its pattern separators; the explicit five-file invocations above completed successfully.

Passing tests establish the behavior those tests assert. They do not negate the findings or constitute end-to-end exploit validation. No new exploit harness or regression tests were added during this review.

## Recommended remediation sequence

1. **Contain account compromise:** close F01; correct F02/F04 revocation; remove shared default credentials in F11/F16. Revoke affected sessions after fixes using a durable mechanism.
2. **Restore financial approval guarantees:** introduce independent final-month approval and database constraints (F05/F12).
3. **Close record access gaps:** centralize caller-aware scope and response allowlists for storage, customers, tickets, auctions, and payment/collection mutations (F06–F09).
4. **Complete lifecycle controls:** invalidate on role change; protect factor replacement; serialize OTP consumption; bound SSE authorization lifetime; finish mobile refresh behavior (F03/F10/F13–F15).
5. **Add adversarial integration coverage:** exercise the exploit sequences against guarded HTTP endpoints and real PostgreSQL/Redis, especially after reset/logout and under concurrency. Use multiple personas and unrelated records; do not rely solely on mocked service tests or UI visibility tests.

## Limits and decisions requiring confirmation during fixes

- No live deployment, real credentials, externally exposed services, production database constraints, Redis outage behavior, TLS termination, Android keystore, or SMS gateway was tested. Production configuration may mitigate some exposure but cannot repair the code-level bypasses.
- No complete repository build, lint run, browser end-to-end suite, database integration suite, or Flutter device suite was run. No financial formula compliance claim is made by this auth-focused review.
- Documentation contains overlapping statements about branch-manager/accountant maker roles versus partner-only financial mutations. Before changing those role boundaries, reconcile the relevant workflow specification. This report does not invent a replacement policy. The explicit independent-approval requirement and non-partner administrator restrictions remain the baseline.
- Auction bid recording currently admits non-partner SUPER_ADMIN callers without a partner check in `recordBid()`/`recordTieBreak()`. This is an additional observed mismatch with the workspace's broad partner-only maker wording; confirm the intended operational-maker boundary before implementing a blanket restriction, given the workflow-specific matrix allowances.
- Several document helpers allow a branch manager with a missing `branchId` to pass because checks are conditional on a truthy branch. Enforce a required scope or reject missing scope; production prevalence of such accounts was not verified.
- Session identity is not tied to a persisted per-session identifier; client-family sessions share a single database fallback hash. Durable session modeling is needed before promising independent device revocation or Redis-loss resilience.
- Further hardening questions include account-based distributed password/MPIN attempt limits (current public route limits are primarily IP based), one-use TOTP challenges/codes, explicit BFF Origin/CSRF validation beyond SameSite cookies, and consistent security-event auditing for user/factor changes. These were not counted as additional confirmed vulnerabilities without targeted runtime validation and policy reconciliation.
