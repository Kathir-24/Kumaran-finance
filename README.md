# Kumaran Chits

> Official chit-fund operations platform for **Kumaran Finance**, tailored for business operations in Tamil Nadu, India.

---

## Core System Principles (`CONFIRMED-BY-DEVELOPER`)

1. **Company & Tenancy**: Built specifically for **Kumaran Finance** operating as a strict single-company database (zero redundant `company_id` columns).
2. **Whole Rupee Arithmetic**: All financial amounts (installments, dividends, foreman commissions, prize payouts) are stored and calculated strictly as **whole integer Rupees (₹)**. Paise are never used in Kumaran Finance operations.
3. **Commission & Dividends**: Foreman commission defaults to **4.00%** and is frozen per chit group upon activation. Dividends are shared **equally across ALL members in that chit group, INCLUDING the auction winner and past prized winners** (`CONFIRMED-BY-DEVELOPER`), and deducted directly from the monthly installment payable next month ($I_{net} = I_{base} - Div$). Total dividend must be cleanly divisible across tickets ($(D - C_f) \pmod M == 0$). Month $N$ final settlement deducts commission, base installment (if unpaid; zero deduction if already paid under FIN-B), and prior arrears ($V - C_f - I_{\text{base}} - \text{arrears} = \mathbf{₹91,000}$ net on ₹1L chit; or $\mathbf{₹96,000}$ if Month $N$ was already paid).
4. **Auctions & Tie-Breaks**: Auctions are conducted offline at the branch. The software records and validates bids against a fixed **one-fourth (1/4 or 25%) discount ceiling** ($D \le \frac{V}{4}$). Tied ceiling bids are resolved via **Option A (Physical Paper Token Draw)** at the branch. Clerical corrections follow a 2-partner workflow (`KFC-FIN-005`) with downstream paid due guards (`ALREADY_PAID_DUES_EXIST` under FIN-E).
5. **Operating Structure & Dual Controls**: Supports Kumaran Finance's structure (**4 equal partners**, **2–3 field collection agents**, **1 physical branch office**). High-risk financial actions (reversals, auction finalization, auction corrections, prize payouts, defaulter removals) strictly enforce **Maker-Checker separation of duties** (`maker_user_id != checker_user_id`) and verified partner identity (`isPartner: true` under SEC-A/B).
6. **Data Scope**: Handles fresh new chits as well as mid-cycle onboarding from physical paper notebooks and physical receipts.
7. **Operational Platform Scope**: Production focus is on the Web Management Portal (`apps/web`) and NestJS API (`apps/api`). Implementation of the Flutter mobile UI and Android application is **postponed** per explicit owner approval; all mobile API contracts remain preserved.

---

## Complete Documentation Suite (From Scratch to End)

The entire project blueprint, architecture, compliance, and operational manual suite is organized under [`docs/`](docs/):

```text
docs/
├── 01-business/
│   ├── decision-log.md                       # Architectural Decision Records (ADR-01 through ADR-25)
│   ├── financial-rules.md                    # Confirmed financial math (whole-rupee mandate, 4% commission, dividends)
│   ├── permissions-matrix.md                 # RBAC + maker-checker dual controls (4 partners & field agents)
│   ├── compliance-checklist.md               # Regulatory items, data minimization, & statutory review
│   └── open-questions.md                     # Centralized log of open questions and unverified legal claims
├── 02-requirements/
│   ├── prd.md                                # 10 core modules acceptance criteria
│   ├── user-stories-and-journeys.md          # 6 personas, 28 features, user stories & journey maps
│   ├── educational-guides/                   # 6-persona educational training & operational guides
│   ├── non-functional-requirements.md        # Security, latency, precision standards
│   └── notification-and-receipt-templates.md # Smart Push Notifications, DLT SMS, & Bilingual PDF receipts
├── 03-architecture/
│   ├── architecture.md                       # Modular monolith HLD & 3-tier auth
│   ├── frontend-architecture.md              # Web & Mobile architecture, PWA, & cross-device Maker-Checker
│   ├── data-model.md                         # PostgreSQL ERD & Prisma schema (single company)
│   ├── state-machines.md                     # Chit, payment, auction states
│   ├── api-spec.md                           # RESTful OpenAPI contracts & endpoints
│   ├── api-request-response-catalog.md       # JSON payload specimens for all endpoints
│   ├── completed-modules-api-registry.md     # 6-persona RBAC matrix for Modules 1–9
│   ├── registrar-filing-protocol.md          # Form XVII Registrar filing protocol
│   ├── security-and-access-guardians.md      # Anti-BOLA/IDOR & branch scoping defenses
│   ├── api-resilience-and-traffic-hardening.md
│   ├── bullmq-architecture.md
│   ├── caching-architecture.md
│   ├── database-concurrency-and-performance.md
│   ├── document-and-storage-architecture.md
│   ├── horizontal-scaling-and-high-availability.md
│   ├── observability-and-monitoring-architecture.md
│   ├── offline-architecture.md
│   ├── payment-architecture.md
│   ├── push-notification-architecture.md
│   ├── rate-limiting-and-abuse-prevention.md
│   ├── redis-architecture.md
│   ├── server-and-infrastructure-resilience.md
│   ├── sms-architecture.md
│   ├── third-party-integrations-and-resilience.md
│   └── openapi-spec.json                     # Generated OpenAPI 3.0 JSON specification
├── 04-engineering/
│   ├── setup-and-contributing.md             # Local environment & Docker guide
│   ├── ai-coding-guidelines.md               # Prompt templates & AI guardrails
│   ├── ai-agent-development-playbook.md      # Guided coding playbook & task-to-doc map
│   ├── database-migration-and-seeding-guide.md # Docker, Prisma migrations & BigInt seeding
│   ├── definition-of-done.md                 # 10-gate quality checklist per module
│   └── troubleshooting-guide.md              # Diagnostics & recovery runbooks
├── 05-testing/
│   ├── financial-tests.md                    # Math invariant & concurrency tests
│   ├── payment-integration.md                # Webhooks, sandbox, & bank reconciliation
│   └── TEST_READY.md                         # Verified test environment checklist
├── 06-devops/
│   ├── infrastructure-and-drp.md             # Production hosting (Linux VPS + Cloudflare R2), backups, restore drill
│   ├── ci-cd-pipeline.md                     # GitHub Actions pipeline
│   └── security-threat-model.md              # Fintech OWASP Top 10, rate limits, audit defense
├── 07-operations/
│   ├── PRODUCTION-DEPLOYMENT-GUIDE.md        # Authoritative Docker, TLS, BFF/SSE & zero-downtime deployment guide
│   ├── manual-onboarding-sop.md              # Physical notebook-to-digital onboarding wizard
│   ├── operations-sop.md                     # Daily cash handover & reversal SOP
│   └── user-manuals/                         # Role-specific user manuals (Admin, Cashier, Agent, Customer, Manager, Auditor)
├── 08-audit/                                 # 15 Master Independent Audit & Release-Gate Verification Documents
│   ├── audit-reconciliation-matrix.md        # Comprehensive reconciliation matrix of all prior audit findings
│   ├── business-rules-compliance-register.md # Compliance audit of 34 confirmed business requirements
│   ├── maker-checker-controls-directory.md   # Complete directory of 8 dual-control workflows and guards
│   ├── financial-math-verification.md        # Mathematical proofs: BigInt, universal dividends, 1/4 ceiling, FIN-A/B/C/D/E
│   ├── security-audit-rbac.md                # RBAC guardians, anti-BOLA/IDOR, fast-path Redis auth, partner separation
│   ├── database-concurrency-audit.md         # 25 real PostgreSQL concurrency stress tests (CONCURR-INV-1..25)
│   ├── frontend-ui-audit.md                  # Next.js 15 Web App: 353 passing tests, Tamil/English i18n, thermal print
│   ├── infrastructure-audit.md               # VPS sizing, Docker topology, daily pg_dump -F c backup, RPO <= 24h
│   ├── operations-runbook-audit.md           # Daily branch operations SOP: opening, counter, agent handover, closing
│   ├── offline-sync-audit.md                 # Offline collections protocol, conflict resolution, mobile status
│   ├── notification-audit.md                 # Indian TRAI DLT SMS flow (MSG91), DPDP masking, WhatsApp purged
│   ├── document-storage-audit.md             # Cloudflare R2 / MinIO storage, direct presigned upload, S3 confirm
│   ├── audit-logging-investigation.md        # Statutory immutable audit trail (Chit Funds Act Sec 67 & 38)
│   ├── statutory-legal-compliance.md         # Chit Funds Act 1982 compliance & blocked unapproved Q25 policy
│   └── production-readiness-certificate.md   # Official release gate determination: 1,196 passing automated tests
└── web/                                      # Next.js 15 Web Operations Portal module specs (21 files; see docs/web/README.md)
```

---

## Local Development & Verification Quickstart (Beginner Guide)

Follow these simple steps from your repository root (`Kumaran-finance`) to start and verify the entire system:

### Step 1: Start Background Infrastructure (Postgres + Redis + MinIO S3)
```powershell
pnpm docker:up
```
This automatically starts:
- **PostgreSQL 17 Database** on port `5433` (`chitflow-db`)
- **Redis 7 In-Memory Queue** on port `6379` (`chitflow-redis`)
- **MinIO S3 Local Storage** on port `9000` (API) and port `9001` (Web Console) — create or verify the private bucket `kumaran-chits-private` via the console or `S3_BUCKET` auto-init when uploading.

### Step 2: Configure Environment & Install Dependencies
```powershell
# Copy environment template if not present
if (!(Test-Path apps\api\.env)) { Copy-Item apps\api\.env.example apps\api\.env }

# Install all monorepo dependencies
pnpm install
```

### Step 3: Apply Migrations & Seed Initial Partner Data
```powershell
# Apply Prisma migrations to PostgreSQL
pnpm run prisma:migrate

# Seed Head Office (PRD) and initial Super Admin partner
pnpm run prisma:seed
```

### Step 4: Start Backend API Server
```powershell
# Start NestJS backend in development watch mode
pnpm run start:dev
```
Once started, the terminal will confirm:
- `🚀 Kumaran Chits API running on: http://localhost:3000`
- `📚 Swagger documentation at: http://localhost:3000/api/docs`
- `📊 Bull Board Queue Monitor at: http://localhost:3000/admin/queues`

### Step 5: Start Web Application Server
```powershell
# Start Next.js web portal in development mode
pnpm web:dev
```
Once started, open your browser to:
- `🌐 Kumaran Chits Web Portal: http://localhost:3001`
- Login with Super Admin credentials: `9876543210` / `Admin@Kumaran2026`

---

## Interactive Web Dashboards & Verification

Open your browser and verify the built-in administrative & observability portals:

| Portal / Tool | URL | Default Credentials | Description |
|---|---|---|---|
| **Web Operations Portal** | [http://localhost:3001](http://localhost:3001) | Phone: `9876543210`<br>Pass: `Admin@Kumaran2026` | Next.js 15 bilingual operations portal (Schemes, Onboarding, Dues, Auctions). |
| **Swagger OpenAPI Explorer** | [http://localhost:3000/api/docs](http://localhost:3000/api/docs) | None (Public in non-prod) | Interactive testing for all 123 physical paths (129 operations). |
| **Bull Board Queue Monitor** | [http://localhost:3000/admin/queues](http://localhost:3000/admin/queues) | Active Super Admin JWT Session<br>(or non-default `BULL_BOARD_USER` Basic Auth) | Visual dashboard for `daily-maintenance-queue`, `notification-queue`, and `reconciliation-queue`. Requires Super Admin session. |
| **Prometheus Metrics Exporter** | [http://localhost:3000/metrics](http://localhost:3000/metrics) | `METRICS_USER` / `METRICS_PASSWORD`<br>(Insecure defaults rejected in production) | Standard Prometheus telemetry: HTTP p95 latencies, BullMQ queues & chit fund KPIs. |
| **Sentry APM & Crash Monitoring**| [http://localhost:3000/health/sentry-test](http://localhost:3000/health/sentry-test) | Config in `apps/api/.env` | `@sentry/nestjs` crash reporting with Indian DPDP Act PII scrubbing and safe bypass. |
| **Pluggable DLT SMS Driver** | `SMS_DRIVER=mock` / `msg91` | Config in `apps/api/.env` | Indian TRAI DLT SMS engine (OTP, Receipts, Auctions, Warnings) with DPDP PII masking. |
| **MinIO S3 Storage Console** | [http://localhost:9001](http://localhost:9001) | User: `chitflow_admin`<br>Pass: `chitflow_storage_secret` | Web file browser showing the `kumaran-chits-private` bucket. |
| **Prisma Studio (DB GUI)** | Run `pnpm run prisma:studio` | Opens [http://localhost:5555](http://localhost:5555) | Visual database table browser and editor. |

---

## Automated S3 Database Backup & Restore Runbook

Test off-site database backups with zero external cloud dependencies:

```powershell
# 1. Take an automated binary backup and upload to S3 (with 30-day retention prune)
pnpm db:backup:s3

# 2. List all database backups stored in S3
pnpm db:backups:list

# 3. Restore the latest backup from S3 into PostgreSQL
pnpm db:restore:s3

# 4. Run automated Disaster Recovery (DRP) drill verifying RTO & financial invariants
pnpm db:drp:drill
```

---

## Testing & Quality Gates

Run the automated test suite verifying all 10 non-negotiable financial invariants:

```powershell
# 1. Run monorepo linters (oxlint for API + ESLint for Web)
pnpm run lint

# 2. Run monorepo TypeScript checks (SDK + Web + API build)
pnpm run typecheck

# 3. Run monorepo unit tests (8 SDK + 986 API unit + 358 Web unit tests = 1,352 passed tests across 73 suites)
pnpm run test
pnpm run test:e2e

# 4. Run full production builds (SDK + API + Web)
pnpm run build
```

---

## Production Full-Stack Orchestration (With Nginx Ingress)

To run the complete production-parity stack containerized behind Nginx reverse proxy:

```powershell
# Start all 9 full-stack containers (Postgres, Redis, MinIO, API, Worker, Web, Nginx, Certbot, Backup Cron)
pnpm docker:fullstack:up

# Inspect logs
pnpm docker:logs

# Stop containers
pnpm docker:fullstack:down
```
When running full-stack behind Nginx, open [https://localhost](https://localhost) (Port `443`; HTTP Port `80` redirects non-health traffic to HTTPS). See [`docs/07-operations/PRODUCTION-DEPLOYMENT-GUIDE.md`](docs/07-operations/PRODUCTION-DEPLOYMENT-GUIDE.md) for TLS and deployment instructions.

---

## Troubleshooting Guide

Encountering an issue? Refer to the comprehensive [**Troubleshooting Guide (docs/04-engineering/troubleshooting-guide.md)**](docs/04-engineering/troubleshooting-guide.md) for root-cause analysis and copy-paste remedies covering:
- **Category A**: Docker port collisions (5433, 6379, 9000, 9001) and daemon startup issues
- **Category B**: PostgreSQL connection failures and Prisma migration conflicts
- **Category C**: MinIO vs S3 Storage Server-Side Encryption (SSE-S3) and bucket self-healing
- **Category D**: BullMQ Redis direct-execution fallback mode and Bull Board auth
- **Category E**: The 10 Invariant Financial Guardrail rejections (Maker != Checker, 1/4 ceiling, defaulters)
- **Category F**: JWT auth, token expiration, and RBAC matrix permissions
- **Category G**: Windows PowerShell syntax (`&&` vs `;`) and execution policies
- **Category H**: Nginx ingress 502 Bad Gateway and upload size limits
- **Nuclear Reset**: Clean-slate reset runbook in under 60 seconds

