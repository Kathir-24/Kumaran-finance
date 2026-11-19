# Kumaran Chits — API Automated Test Architecture (`apps/api/test`)

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance** (Head Office: Perundurai, Erode, Tamil Nadu)  
> **Test Framework**: Jest 30 + `ts-jest` (Node.js 24 LTS VM Modules, `maxWorkers: 1` per `DEF-14`)  
> **Verified Live Baseline**: **63 Unit & Invariant Suites (`1,226` Tests)** (`61` in `test/unit/` + `2` co-located in `src/`) + **14 Real PostgreSQL 17 / Redis 7 E2E Suites (`187` Tests)** + **26/26 Real-PG Concurrency Invariants (`CONCURR-INV-1..26`)**  
> **Financial Invariant**: Pure whole-rupee math (`BigInt`). Zero floating-point arithmetic.

---

## 1. Directory Structure & Taxonomy

The `apps/api/test/` directory separates fast unit/invariant/concurrency suites (`test/unit/`) from live multi-role HTTP end-to-end suites (`test/e2e/`):

```text
apps/api/test/
├── README.md                                    # This test architecture and execution guide
├── jest-e2e.json                                # Jest E2E configuration targeting test/e2e/
├── jest-e2e-setup.ts                            # E2E test bootstrap & global env initialization
├── unit/                                        # 61 Unit, Invariant, Fuzzing & Concurrency Suites (+2 in src/ = 63 total)
│   ├── adversarial-security-invariants.spec.ts  # 31 penetration & bypass invariants
│   ├── api-resilience.spec.ts                   # Bulkhead, rate-limiting & idempotency
│   ├── arrears-util.spec.ts                     # Canonical longest contiguous unpaid streak helper
│   ├── auction-reminder.spec.ts                 # Background pre-auction reminder scheduler
│   ├── auction-state-machine.spec.ts            # Strict AuctionStatus transitions (SCHEDULED -> MINUTES_FILED)
│   ├── auction.spec.ts                          # Auctions, frozen commission, 1/4 ceiling, tie-breaks & corrections
│   ├── auth-redis-live.spec.ts                  # Live Redis Lua atomic OTP TTL & lockout
│   ├── auth-token-lifecycle.spec.ts             # Multi-client Session vault, SHA-256+bcrypt refresh & revocation
│   ├── auth.spec.ts                             # Staff login, TOTP, MPIN, onboarding & RBAC guards
│   ├── backup-drp.spec.ts                       # S3/R2 backup manifest, checksum & DRP recovery invariants
│   ├── bigint-interceptor.spec.ts               # Whole-rupee BigInt response serialization
│   ├── branch-cache.spec.ts                     # Branch 1h Redis cache & 60s negative caching
│   ├── branch.spec.ts                           # Branch CRUD & Head Office (PRD) metadata
│   ├── bull-board.spec.ts                       # Bull Board F11 Super Admin JWT & Basic Auth security
│   ├── cache-jitter.spec.ts                     # ±10–15% cache TTL jitter distribution
│   ├── cache-stampede.spec.ts                   # Distributed mutex stampede protection
│   ├── chaos-network-disconnect.spec.ts         # Transient DB/Redis fault injection
│   ├── chit-cache.spec.ts                       # Chit group scheme cache invalidation
│   ├── chit.spec.ts                             # Chit lifecycle, divisibility, commission freeze & onboarding
│   ├── circuit-breaker.spec.ts                  # MSG91 SMS gateway circuit breaker & recovery
│   ├── client-contract.spec.ts                  # OpenAPI schema AST & type safety guards
│   ├── collection.spec.ts                       # Doorstep collection, offline queue sync & dual-control handover
│   ├── concurrency-locking.spec.ts              # 4-tier DAG row-level lock ordering
│   ├── concurrency-postgres.spec.ts             # Live PostgreSQL 17 parallel contention (CONCURR-INV-1..26)
│   ├── customer-validation.spec.ts              # Indian mobile regex, masked 4-digit Aadhaar & PAN uppercase rules
│   ├── customer.spec.ts                         # Customer intake, KYC, nominees & Anti-BOLA
│   ├── disbursement.spec.ts                     # Prize disbursement, arrears offset TOCTOU, Month N & ADR-15 safety proof
│   ├── distributed-lock.spec.ts                 # Atomic Redis Lua mutex locks
│   ├── env.validation.spec.ts                   # Fail-fast environment variable & prod secret validation
│   ├── financial-boundary-fuzz.spec.ts          # Fuzzing high-value BigInt amounts & boundaries
│   ├── financial-invariants.spec.ts             # Core mathematical invariants & divisibility grid
│   ├── installment.spec.ts                      # Universal equal dividends, passbook & 2-Partner defaulter removal
│   ├── jobs.spec.ts                             # BullMQ queues, IST crons & daily arrears evaluation
│   ├── metrics.spec.ts                          # Prometheus APM metrics, strict-by-default auth & cardinality fuse
│   ├── notification-distributed.spec.ts         # Distributed BullMQ notification routing
│   ├── operational-lifecycles.spec.ts           # Full 20-month end-to-end chronological lifecycle
│   ├── otp-cooldown-lockout.spec.ts             # OTP failure lockout & daily quota enforcement
│   ├── payment.spec.ts                          # Discrete payments, direct KVB UPI claims & Partner reversals
│   ├── pdf-layout-regression.spec.ts            # Bilingual A5 receipt, voucher, Form XVII & Form XXI PDF layout proofs
│   ├── pdf.spec.ts                              # Bilingual PDF engine, pure-BigInt words, OWASP API3 & Anti-BOLA
│   ├── phase1-security-remediation.spec.ts      # Phase 1 security remediation (account takeover, Session vault, TOTP, onboarding)
│   ├── phase2-security-remediation.spec.ts      # Phase 2 security remediation (settlement, storage BOLA, phone mask, DB checks)
│   ├── phase4-concurrency-queues-sse.spec.ts    # Phase 4 hardening (F11 metrics/Bull Board, F15 SSE session guards)
│   ├── push.spec.ts                             # Phase 2 FCM push formatting & stale token pruning
│   ├── queue-resilience.spec.ts                 # Bounded removeOnFail DLQ, retry backoff & Redis outage safety
│   ├── reconciliation-ledger.spec.ts            # Direct KVB UPI claim settlement reconciliation (ADR-19)
│   ├── redis-throttler-storage.spec.ts          # Distributed Redis Lua rate-limiting storage
│   ├── report-etag.spec.ts                      # Caller-scoped HTTP 304 ETag & RxJS EMPTY handling
│   ├── report.spec.ts                           # Dashboard, Day Book, 8-queue Approvals Hub, SSE & SUPER_ADMIN Audit Logs
│   ├── request-context.spec.ts                  # AsyncLocalStorage request context & IP propagation
│   ├── request-id.spec.ts                       # X-Request-ID correlation propagation
│   ├── sentry.spec.ts                           # Sentry APM capture, safe-bypass & DPDP PII scrubbing
│   ├── session-issuance-regression.spec.ts      # Session issuance & token rotation regression proofs
│   ├── sms.spec.ts                              # MSG91 TRAI DLT SMS templates & non-blocking safety
│   ├── state-matrix-sweep.spec.ts               # Exhaustive state machine transition sweep (124 transitions)
│   ├── state-transition-retry.spec.ts           # Deadlock retry on PostgreSQL 40P01 / 40001 / P2034
│   ├── statutory-report-m10.spec.ts             # Form XXII cash reversals/handover continuity, Form XXI totals, Form XVII tie-break
│   ├── storage.spec.ts                          # Presigned S3/R2 uploads, HeadObject confirm & access control
│   ├── third-party-resilience.spec.ts           # External telecom/storage retry & fallback policies
│   ├── transaction-retry.spec.ts                # Deterministic withTransactionRetry backoff logic
│   └── user.spec.ts                             # Staff roles, STAFF_ROLES guard, Role.PARTNER & Layer 2 branch scoping
└── e2e/                                         # 14 Consolidated Multi-Role E2E & Lifecycle Suites (187 Tests)
    ├── 01-auth-security.e2e-spec.ts             # Web login, TOTP 2FA, token refresh, onboarding & mobile MPIN
    ├── 02-customer-kyc.e2e-spec.ts              # Customer onboarding, optional KYC documents & Anti-BOLA
    ├── 03-chits-auctions.e2e-spec.ts            # Chit creation, 1/4 ceiling, Option A tie-break & finalization
    ├── 04-module4-chit-schemes.e2e-spec.ts      # Comprehensive Module 4 scheme lifecycle, divisibility & onboarding (49 tests)
    ├── 04-payments-reversals.e2e-spec.ts        # Discrete payments, direct KVB UPI claims & Partner-only reversals (16 tests)
    ├── 05-disbursements-jobs.e2e-spec.ts        # Prize payouts, ADR-15 safety proof checklist & BullMQ jobs (18 tests)
    ├── 06-storage-documents.e2e-spec.ts         # Presigned URL streaming, confirm check & path traversal guards
    ├── 07-postgres-redis-lifecycle.e2e-spec.ts  # Real Postgres 17 & Redis 7 revocation, restart & session lifecycle
    ├── 08-maker-checker-db-constraints.e2e-spec.ts # Real Postgres 17 CHECK constraints & NULL-trap immunity (24 tests)
    ├── app.e2e-spec.ts                          # Root / and /health readiness/liveness probes
    ├── proxy-client-ip.e2e-spec.ts              # X-Forwarded-For & TRUST_PROXY IP parsing
    ├── response-envelope.e2e-spec.ts            # Standard envelope { success, data, timestamp }
    ├── security-headers.e2e-spec.ts             # Helmet CSP, HSTS, X-Content-Type-Options
    └── throttler.e2e-spec.ts                    # Distributed rate-limiting HTTP 429 enforcement
```

---

## 2. Test Execution Commands

Run tests directly from the repository root using `pnpm` (never run unit and E2E suites simultaneously against shared PostgreSQL databases):

```powershell
# Run all 63 unit & invariant test suites (1,226 passing tests; sequential maxWorkers: 1)
pnpm test

# Run a single unit test suite
pnpm --filter api test -- test/unit/auction.spec.ts

# Run all 14 multi-role PostgreSQL 17 E2E integration suites (187 passing tests; --runInBand)
pnpm run test:e2e

# Fresh seed & run E2E suites against isolated chitflow_test database
pnpm --filter api run test:e2e:fresh

# Verify TypeScript compiler typecheck across all API sources & test suites
pnpm --filter api exec tsc --noEmit

# Run fast Oxlint static analysis
pnpm run lint
```

---

## 3. Test Database Configuration

E2E and live PostgreSQL concurrency tests run against the isolated test database:
- **Default Test Database URL**: `postgresql://chitflow:chitflow_dev_only@127.0.0.1:5433/chitflow_test?schema=public`
- **Redis Test DB**: `REDIS_DB=1` (isolated from dev DB `0`).
- **Re-seeding Test DB**:
  ```powershell
  pnpm --filter api run test:db:seed
  ```
- **Port**: Docker runs PostgreSQL 17 on host port `5433`.

---

## 4. The 11 Invariant Architectural Guardrails Enforced by Tests

Every suite strictly verifies Kumaran Chits' 11 non-negotiable architectural guardrails (`AGENTS.md`):

1. **Single-Company Tenancy (`ADR-01`)**: Zero `company_id` columns; strict fail-closed branch scoping.
2. **Whole-Rupee Math (`BigInt`) & Divisibility (`KFC-FIN-002`)**: Pure 64-bit integer Rupees ($V \pmod N = 0$ and $(D - C_f) \pmod N = 0$); zero floats or paise.
3. **Commission Freeze (`ADR-04`)**: Permanently frozen `ChitGroup.foremanCommissionRate` (default `4.00%`, dynamic bps math, zero hardcoded `4%`).
4. **Universal Equal Dividends**: Equal dividend credited to ALL tickets in the group, including prized winners and company ticket #1 ($I_{net} = I_{base} - Div$).
5. **Month 1 & Month $N$ Rules (`FIN-B`)**: Month 1 company pool (₹0 dividend, no auction); Month $N$ two-stage direct maturity settlement (no auction); auctions strictly in Months $2..N-1$.
6. **Fixed 1/4 Ceiling & Option A Physical Tie-Break (`ADR-06`)**: $C_f \le D \le V/4$; physical paper token draws recorded by staff with zero software RNG.
7. **Ticket Limit (`ADR-13`)**: Max 1 ticket per customer per chit group (`@@unique([chitGroupId, customerId])`).
8. **Defaulter & Discrete Single Payment Rules (`ADR-07`)**: Unpaid members barred from bidding; sequential payment order (`PRIOR_INSTALLMENT_UNPAID`); zero partial/double/advance payments; 3-month consecutive arrears removal rights via canonical `arrears.util.ts`.
9. **Company Safety Proof Checklist (`ADR-15`)**: Property documents (`PROPERTY_DEED`) strictly rejected; flexible non-mandatory checklist + private S3/R2 15-minute presigned URLs.
10. **Maker $\ne$ Checker Dual Control (`ADR-25`)**: Enforced across application services and **8 PostgreSQL engine-level `CHECK` constraints** (`08-maker-checker-db-constraints.e2e-spec.ts` — 24/24 passing).
11. **Verified Partner Identity (`ADR-21`, `ADR-27` / `SEC-A`)**: Financial mutations require `Role.PARTNER` + `isActive !== false` (`assertVerifiedPartner`); Audit Logs & BullMQ telemetry restricted strictly to `SUPER_ADMIN`.

---

## 5. Audited Domain Regression & Closure Matrix (Modules 4, 6 & 9)

All domain audit defects across Chit Schemes, Auctions, and Prize Disbursements are permanently remediated and locked behind automated regression tests:

| Audited Domain | Verified Closures Locked by Regression Suites | Automated Proof Suites |
|---|---|---|
| **Chit Schemes & Mid-Cycle Onboarding (Module 4 — `DEF-M4-01..06`)** | Added `DRAFT -> CANCELLED` terminal state (`state-matrix-sweep.spec.ts` 124/124); enforced $V \pmod N = 0$ whole-rupee divisibility; enforced Maker $\ne$ Checker Verified Partner (`Role.PARTNER`) scheme activation; added defensive pre-validation in `onboardOngoingChit()` (1/4 ceiling, 4% floor, dividend divisibility, non-duplicate winners); added `@Controller(['installments', 'installment-dues'])` route alias & Month $N$ voucher property parity | `chit.spec.ts` (31), `state-matrix-sweep.spec.ts` (124), `04-module4-chit-schemes.e2e-spec.ts` (49) |
| **Auctions, Prize Disbursements & Safety Proof (Module 6 — 51 Remediations across Rounds 1–3)** | Pure-`BigInt` frozen commission basis-point math (`DEF-AUC-01`, `DISB-03/10`); live `InstallmentDue` + TOCTOU bidding eligibility (`DEF-AUC-02/03`); finalized auction corrections reconciling unpaid Month $N+1$ dues under `FOR UPDATE` locks while failing closed if any downstream due is `PAID` (`KFC-FIN-005`/`FIN-E`); automatic unpaid arrears offset & release TOCTOU guard (`FIN-A`/`FIN-D`/`KFC-FIN-003`/`004`) with `PRIZE_ARREARS_OFFSET_ALLOCATED` audit provenance; `ALLOWED_SAFETY_PROOF_TYPES` blocking `PROPERTY_DEED`, S3 prefix sandboxing (`safety-proof[s]/{auctionId}/`), and post-disbursement immutability; 2 PostgreSQL migrations (`20261118110000_harden_auction_disbursement_constraints`, `20261118124500_case_insensitive_payout_ref_index`) hardening `chk_auction_maker_checker`, `chk_winner_maker_checker`, and case-insensitive payout reference uniqueness | `auction.spec.ts`, `auction-state-machine.spec.ts`, `disbursement.spec.ts`, `state-transition-retry.spec.ts`, `concurrency-postgres.spec.ts` (26/26), `03-chits-auctions.e2e-spec.ts`, `05-disbursements-jobs.e2e-spec.ts`, `08-maker-checker-db-constraints.e2e-spec.ts` (24/24) |
| **In-Office Bidding Console, Minutes & Corrections (Module 9 — 23 Remediations)** | Authoritative locked ticket fields (`consecutiveUnpaidMonths`, `removalRequestedByUserId`) merged in `recordBid`/`recordTieBreak` (`DEF-M9-ENG-01`); `AuctionReminderSchedulerService` & `POST /jobs/send-auction-reminder` restricted strictly to `ACTIVE` schemes, Months $2..N-1$, unconducted auctions, and branch Anti-BOLA (`DEF-M9-ENG-02/03`); added two-partner `rejectAuctionCorrection` workflow (`M9-DUAL-DEF-01`), active-correction lock (`assertNoPendingAuctionCorrection`) blocking prize disbursement during disputes (`M9-DUAL-DEF-02`), ghost tie-bidder cleanup on sub-ceiling corrections (`M9-DUAL-DEF-04`), `ParseUUIDPipe` across all 12 auction routes (`M9-DUAL-DEF-06`), IST daybook cache invalidation (`M9-DUAL-DEF-07`), and Web/Dart parity (`M9-WEB-DEF-01..06`, `M9-MOB-DEF-07..08`) | `auction.spec.ts`, `auction-reminder.spec.ts`, `disbursement.spec.ts`, `apps/mobile/test/auction_disbursement_models_test.dart` |
