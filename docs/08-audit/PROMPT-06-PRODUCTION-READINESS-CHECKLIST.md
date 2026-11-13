# PROMPT 06 — PRODUCTION READINESS CHECKLIST
## Kumaran Chits — Comprehensive Operational & Deployment Readiness Gate

> **Audit Stage**: Stage 06 (Infrastructure, DevOps, Disaster Recovery & Production Readiness)  
> **Company**: **Kumaran Finance** (Head Office: Perundurai, Erode, Tamil Nadu)  
> **Status**: COMPLETED — READ-ONLY AUDIT  
> **Date**: November 2026  
> **Evaluation Scale**: `PASS` | `FAIL` | `PARTIAL` | `NOT TESTED` | `NOT APPLICABLE`

---

## 1. Production Readiness Checklist by Operational Domain

| Item # | Verification Criteria / Operational Domain | Status | Concrete Audit Evidence | Required Action Before Production Go-Live |
|:---:|---|:---:|---|---|
| **1.1** | **Frozen Lockfile Build**: Monorepo builds cleanly using `pnpm install --frozen-lockfile` without missing packages. | **PASS** | Verified in `.github/workflows/ci.yml` and local execution. | None. Maintain `pnpm-lock.yaml` integrity. |
| **1.2** | **TypeScript Typecheck**: Backend, Web, and SDK pass strict compilation with 0 type errors. | **PASS** | `pnpm run typecheck` passed cleanly across all packages. | None. Enforced in CI quality gates. |
| **1.3** | **Client SDK Drift Guard**: OpenAPI specs and generated client SDKs match backend routes. | **PASS** | `git diff --exit-code` verified in CI pipeline. | None. Maintain automatic codegen workflow. |
| **2.1** | **Non-Root Containers**: Containers run under unprivileged service users (`node`, `nextjs`). | **PASS** | `apps/api/Dockerfile` uses `USER node`; `apps/web/Dockerfile` uses `USER nextjs` (UID 1001). | None. |
| **2.2** | **Container Resource Bounds**: Memory and CPU limits are explicitly defined. | **PASS** | `docker-compose.fullstack.yml` defines `mem_limit` on all containers (API: 1280MB, Web: 512MB, DB: 1024MB, Redis: 640MB). | None. |
| **2.3** | **Container Health Checks**: Deep liveness and readiness probes configured for all services. | **PASS** | API/Worker probe `/health/readiness`; Web probes `:3001`; Postgres probes `pg_isready`; Redis probes `ping`. | None. |
| **3.1** | **Internal Port Isolation**: Database and cache ports are bound strictly to localhost (`127.0.0.1`). | **PASS** | Ports 5433 (DB), 6379 (Redis), and 9000/9001 (MinIO) bind to `127.0.0.1` in Compose. | None. Ensure host firewall (UFW) rejects public traffic to non-80/443 ports. |
| **3.2** | **Edge Rate Limiting**: Ingress rate limiting active on authentication and general APIs. | **PASS** | `chitflow.conf` defines `api_auth_limit: 3r/s` and `api_general_limit: 30r/s` returning HTTP 429. | Monitor rate limit thresholds under peak branch collection hours. |
| **3.3** | **Modern TLS & HSTS**: Enforces TLS 1.2/1.3, modern cipher suites, and 6-month HSTS preload. | **PASS** | `chitflow.conf` lines 66–77 enforce Mozilla Modern TLS and HSTS header. | Deploy valid domain certificates via Certbot on VPS. |
| **4.1** | **Zero Hardcoded Secrets in Git**: No active secrets, private keys, or passwords committed to repository. | **PASS** | Clean git history verified; `.gitignore` covers `.env*`, `*.pem`, `*.key`. | None. |
| **4.2** | **Fail-Fast Production Validation**: System rejects insecure default passwords in production. | **PASS** | `env.validation.ts` rejects default `chitflow_secret` and placeholder JWT keys when `NODE_ENV=production`. | None. Enforced at application boot. |
| **4.3** | **BFF Session Token Isolation**: Web frontend stores JWTs in `HttpOnly`, `SameSite=Lax` cookies. | **PASS** | Verified in `apps/web/src/app/api/auth/` BFF routes. Zero tokens in `localStorage`. | None. |
| **5.1** | **PostgreSQL Connection Limits**: Database connection pools are bounded to prevent exhaustion. | **PASS** | Postgres configured with `max_connections=150`; API Prisma pool capped at 25; Worker capped at 15. | None. Matches VPS memory capacity. |
| **5.2** | **Transaction Deadlock & Timeout Safety**: Financial write paths enforce statement and lock timeouts. | **PASS** | Postgres command sets `statement_timeout=15000` (15s) and `lock_timeout=5000` (5s). | None. Prevents indefinite transaction hangs. |
| **5.3** | **Database Volume Persistence**: Database data survives container recreation and host reboots. | **PASS** | Named volume `chitflow_pgdata` mounts to `/var/lib/postgresql/data`. | None. Ensure regular host filesystem snapshots. |
| **6.1** | **Process Bulkhead Isolation**: API and BullMQ workers run in separate containers. | **PASS** | `chitflow-api` has `ENABLE_BULLMQ_WORKERS=false`; `chitflow-worker` runs workers on port 3002. | None. |
| **6.2** | **Bounded Dead-Letter Job Retention**: Failed BullMQ jobs are capped to prevent Redis memory bloat. | **PASS** | `createDefaultBullMqJobOptions()` caps failed jobs at 500 entries or 7 days (`age: 604800`). | None. |
| **6.3** | **Redis Eviction Policy Safety**: Redis configured with `noeviction` for BullMQ compatibility. | **FAIL** | `docker-compose.fullstack.yml` uses `--maxmemory-policy volatile-lru`. BullMQ logs official warning. | **MUST FIX (P0)**: Change Redis maxmemory-policy to `noeviction`. |
| **7.1** | **Automated Nightly Backups**: Containerized cron takes compressed binary dump and uploads to S3. | **PASS** | `backup-cron-job.sh` runs daily at 02:00 AM IST via `chitflow-backup-cron`. | None. Ensure Cloudflare R2 bucket credentials are active. |
| **7.2** | **Disaster Recovery Restoration Verified**: Backups are tested and proven to restore cleanly. | **PASS** | `drp-drill.ts` executed live: Restored 186KB dump in **1.04s** with 100% data and invariant parity. | Schedule automated monthly DRP drill cron. |
| **8.1** | **Application Error Tracking**: Sentry initialized with PII scrubbing for unhandled exceptions. | **PASS** | `sentry.service.ts` scrubs full Aadhaar, passwords, and tokens. `/health/sentry-test` verified. | Supply production `SENTRY_DSN` in production `.env`. |
| **8.2** | **Prometheus Metrics Scraper**: Authenticated `/metrics` endpoint exports application telemetry. | **PASS** | Protected by `MetricsAuthGuard`; exports HTTP durations, active groups, collection counters. | Connect Prometheus / Grafana scraper agent. |
| **9.1** | **Automated Zero-Downtime Rollout**: Blue-green deployment script with automated rollback trap. | **PASS** | `zero-downtime-deploy.sh` preserves previous image tag and reverts if probe fails within 60s. | None. |
| **9.2** | **Automated Browser E2E in CI**: CI runs full Playwright browser tests on every PR. | **PARTIAL** | CI runs Vitest unit tests (353 passed) but omits Playwright browser tests (`playwright test`). | Add Playwright browser job to GitHub Actions workflow. |
| **10.1** | **Pure Whole-Rupee Financial Math**: Zero floats or decimal fractions in financial paths. | **PASS** | Verified in Prisma schema (`BigInt`), TypeScript (`bigint`), and DRP drill assertions. | None. Non-negotiable Invariant 2 enforced. |
| **10.2** | **Maker != Checker Enforcement**: Critical financial actions enforce dual control. | **PASS** | Payment reversals, disbursements, and handover vouchers enforce `maker_user_id != checker_user_id`. | None. Non-negotiable Invariant 10 enforced. |
| **11.1** | **Bilingual Localization Completeness**: 100% key parity between English and Tamil. | **PASS** | Exactly 1,887 keys in `en.json` and 1,887 keys in `ta.json` with 0 missing keys. | None. |
| **11.2** | **A5 Receipt Printing Compliance**: Renders legal A5 receipt with Rupee words and watermark. | **PASS** | `receipt-print-template.tsx` matches ADR-11; verified in Playwright test `06-counter-payments`. | None. |
| **12.1** | **Android Flutter UI**: Native Android mobile application buildable as signed APK. | **FAIL** | `apps/mobile/` has Dart SDK models and SQLite sync queue, but lacks Flutter widget UI and build scripts. | **MUST BUILD (P1)**: Implement Flutter Android UI screens for field agents. |
| **13.1** | **Operational Runbooks**: Documented human procedures for deployment, backups, and incidents. | **PASS** | Runbooks documented in `infra/scripts/README.md` and `docs/07-operations/`. | Distribute operational SOPs to Kumaran Finance branch staff. |
