# Kumaran Chits — API Automated Test Architecture (`apps/api/test`)

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance** (Head Office: Perundurai, Erode, Tamil Nadu)  
> **Test Framework**: Jest 30 + `ts-jest` (Node.js 24 LTS VM Modules)  
> **Test Runners**: 59 Unit & Invariant Suites (986 Tests) + Real PostgreSQL 17 / Redis 7 Integration Suites  
> **Financial Invariant**: Pure whole-rupee math (`BigInt`). Zero floating-point arithmetic.

---

## 1. Directory Structure & Taxonomy

The `apps/api/test/` directory is partitioned into two distinct test domains to isolate fast unit/in-memory invariant tests from live end-to-end multi-role HTTP scenarios:

```
apps/api/test/
├── README.md                      # This test architecture and execution guide
├── jest-e2e.json                  # Jest E2E configuration targeting test/e2e/
├── jest-e2e-setup.ts              # E2E test bootstrap & global env initialization
├── unit/                          # 52 Unit, Invariant, Fuzzing & Concurrency Suites
│   ├── adversarial-security-invariants.spec.ts  # 31 penetration & bypass invariants
│   ├── api-resilience.spec.ts                   # Bulkhead, rate-limiting & idempotency
│   ├── auction-reminder.spec.ts                 # Background reminder scheduler
│   ├── auction-state-machine.spec.ts            # Strict state transitions (PLANNED -> CLOSED)
│   ├── auction.spec.ts                          # Chit auctions, 1/4 ceiling & tie-breaks
│   ├── auth-redis-live.spec.ts                  # Redis OTP TTL & rate lockout
│   ├── auth-token-lifecycle.spec.ts             # JWT rotation & token families
│   ├── auth.spec.ts                             # Staff login, 2FA & RBAC guards
│   ├── bigint-interceptor.spec.ts               # Rupee BigInt serialization
│   ├── branch-cache.spec.ts                     # Cache stampede & branch caching
│   ├── branch.spec.ts                           # Branch management & head office
│   ├── bull-board.spec.ts                       # Bull Board Basic Auth security
│   ├── cache-jitter.spec.ts                     # ±10% cache TTL jitter
│   ├── cache-stampede.spec.ts                   # Mutex stampede protection
│   ├── chaos-network-disconnect.spec.ts         # Transient fault injection
│   ├── chit-cache.spec.ts                       # Chit group scheme caching
│   ├── chit.spec.ts                             # Chit lifecycle, commission freeze
│   ├── circuit-breaker.spec.ts                  # SMS & payment gateway circuit breaker
│   ├── client-contract.spec.ts                  # OpenAPI schema AST & type safety guards
│   ├── collection.spec.ts                       # Doorstep agent collection & batch handover
│   ├── concurrency-locking.spec.ts              # Row-level lock ordering
│   ├── concurrency-postgres.spec.ts             # Live PostgreSQL 17 parallel contention
│   ├── customer.spec.ts                         # Customer intake, KYC & Anti-BOLA
│   ├── disbursement.spec.ts                     # Prize disbursement & collateral proof
│   ├── distributed-lock.spec.ts                 # Atomic Redis Lua mutex locks
│   ├── env.validation.spec.ts                   # Fail-fast environment variable validation
│   ├── financial-boundary-fuzz.spec.ts          # Fuzzing high-value amounts & boundaries
│   ├── financial-invariants.spec.ts             # 10 core mathematical invariants
│   ├── installment.spec.ts                      # Universal equal dividends & passbook
│   ├── jobs.spec.ts                             # BullMQ queues & daily arrears cron
│   ├── metrics.spec.ts                          # Prometheus APM metrics & basic auth
│   ├── notification-distributed.spec.ts         # Distributed notification enqueues
│   ├── operational-lifecycles.spec.ts           # 20-month end-to-end chronological lifecycle
│   ├── otp-cooldown-lockout.spec.ts             # OTP failure exponential backoff
│   ├── payment.spec.ts                          # Single discrete payments & reversals
│   ├── pdf.spec.ts                              # Bilingual receipt & passbook PDF generation
│   ├── phase1-security-remediation.spec.ts      # Phase 1: Account takeover, Session vault, revocation, TOTP, Edge onboarding (39 tests)
│   ├── phase2-security-remediation.spec.ts      # Phase 2: Final settlement, storage branch checks, customer purview, phone mask, DB constraints (36 tests)
│   ├── push.spec.ts                             # Mobile push notification dispatch
│   ├── queue-resilience.spec.ts                 # Dead-letter queue & retry backoff
│   ├── reconciliation-ledger.spec.ts            # Payment gateway ledger reconciliation
│   ├── redis-throttler-storage.spec.ts          # Distributed Redis rate-limiting storage
│   ├── report-etag.spec.ts                      # HTTP 304 ETag caching on reports
│   ├── report.spec.ts                           # Form XVII, XXI, XXII & executive day book
│   ├── request-context.spec.ts                  # AsyncLocalStorage request context
│   ├── request-id.spec.ts                       # X-Request-ID propagation
│   ├── sentry.spec.ts                           # Sentry APM exception capture & PII scrubbing
│   ├── sms.spec.ts                              # Indian DLT SMS gateway templates
│   ├── state-matrix-sweep.spec.ts               # Exhaustive state matrix validation
│   ├── state-transition-retry.spec.ts           # Deadlock retry on 40P01 / 40001 / P2034
│   ├── storage.spec.ts                          # Presigned S3 uploads & access control
│   ├── third-party-resilience.spec.ts           # Gateway fallback & retry policies
│   ├── transaction-retry.spec.ts                # Deterministic transaction retry logic
│   └── user.spec.ts                             # User roles & permissions matrix
└── e2e/                           # Consolidated Multi-Role E2E & Lifecycle Suites
    ├── 01-auth-security.e2e-spec.ts             # Web login, 2FA, token refresh, mobile MPIN
    ├── 02-customer-kyc.e2e-spec.ts              # Customer onboarding, KYC documents & BOLA
    ├── 03-chits-auctions.e2e-spec.ts            # Chit creation, 1/4 ceiling & tie-break draw
    ├── 04-payments-reversals.e2e-spec.ts        # Discrete payments, maker-checker reversals
    ├── 05-disbursements-jobs.e2e-spec.ts        # Prize payouts, safety checklist, BullMQ
    ├── 06-storage-documents.e2e-spec.ts         # Presigned URL streaming & path traversal guards
    ├── 07-postgres-redis-lifecycle.e2e-spec.ts  # Real Postgres 17 & Redis 7 auth revocation, restart, session lifecycle (6 tests)
    ├── 08-maker-checker-db-constraints.e2e-spec.ts # Real Postgres 17 CHECK constraints & ternary NULL-trap immunity (15 tests)
    ├── app.e2e-spec.ts                          # Root / and /health ping endpoints
    ├── proxy-client-ip.e2e-spec.ts              # X-Forwarded-For & trusted proxy IP parsing
    ├── response-envelope.e2e-spec.ts            # Standard envelope { success, data, timestamp }
    ├── security-headers.e2e-spec.ts             # Helmet CSP, HSTS, X-Content-Type-Options
    └── throttler.e2e-spec.ts                    # Rate-limiting HTTP 429 response enforcement
```

---

## 2. Test Execution Commands

Run tests directly from the repository root using `pnpm`:

```powershell
# Run all 54 unit & invariant test suites (828 tests)
pnpm test

# Run single unit test suite
pnpm test test/unit/auction.spec.ts

# Run all 11 multi-role E2E integration test suites (99 tests)
pnpm run test:e2e

# Fresh seed & run E2E suites against test database
pnpm --filter api run test:e2e:fresh

# Verify TypeScript compiler typecheck across all test suites
pnpm run typecheck

# Run fast Oxlint static analysis on src/ and test/
pnpm run lint
```

---

## 3. Test Database Configuration

E2E and live PostgreSQL concurrency tests run against the isolated test database:
- **Default Test Database URL**: `postgresql://chitflow:chitflow_dev_only@127.0.0.1:5433/chitflow_test?schema=public`
- **Re-seeding Test DB**:
  ```powershell
  pnpm --filter api run test:db:seed
  ```
- **Port**: Docker runs PostgreSQL 17 on host port `5433`.

---

## 4. Key Architectural Invariants Enforced by Tests

Every test suite strictly verifies the following Kumaran Chits invariants:
1. **Whole-Rupee Math (`BigInt`)**: No fractional paise or floating-point decimals in any monetary computation.
2. **Universal Equal Dividends**: Dividend is distributed equally across all members (including prized winners and auction winner).
3. **1/4 Discount Ceiling & Physical Tie-Break**: Max discount is strictly 25% of chit value. Tie-breaks are drawn physically via paper tokens and recorded by staff.
4. **Maker $\ne$ Checker**: Strict separation of duties on reversals, disbursements, and cash handovers (`maker_user_id != checker_user_id`).
5. **Single Discrete Monthly Payment**: Zero double collections, zero partial payments, and zero advance balances.
