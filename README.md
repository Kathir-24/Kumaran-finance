# Kumaran Chits

> Official chit-fund operations platform for **Kumaran Finance**, tailored for business operations in Tamil Nadu, India.

---

## Core System Principles (`CONFIRMED-BY-DEVELOPER`)

1. **Company & Tenancy**: Built specifically for **Kumaran Finance** operating as a strict single-company database (zero redundant `company_id` columns).
2. **Whole Rupee Arithmetic**: All financial amounts (installments, dividends, foreman commissions, prize payouts) are stored and calculated strictly as **whole integer Rupees (₹)**. Paise are never used in Kumaran Finance operations.
3. **Commission & Dividends**: Foreman commission defaults to **4.00%** and is frozen per chit group upon activation. Dividends are shared **equally across ALL members in that chit group, INCLUDING the auction winner and past prized winners** (`CONFIRMED-BY-DEVELOPER`), and deducted directly from the monthly installment payable next month ($I_{net} = I_{base} - Div$).
4. **Auctions & Tie-Breaks**: Auctions are conducted offline at the branch. The software records and validates bids against a fixed **one-fourth (1/4 or 25%) discount ceiling** ($D \le \frac{V}{4}$). Tied ceiling bids are resolved via **Option A (Physical Paper Token Draw)** at the branch.
5. **Operating Structure & Dual Controls**: Supports Kumaran Finance's structure (**4 equal partners**, **2–3 field collection agents**, **1 physical branch office**). The 4 Partners have 100% full feature parity across both Web (`apps/web`) and Mobile (`apps/mobile`) frontends. High-risk financial actions strictly enforce **Maker-Checker separation of duties** (`maker_user_id != checker_user_id`) across any device combination.
6. **Data Scope**: Handles fresh new chits as well as mid-cycle onboarding from physical paper notebooks and physical receipts.

---

## Complete Documentation Suite (From Scratch to End)

The entire project blueprint, architecture, compliance, and operational manual suite is organized under [`docs/`](docs/):

```text
u:\Kumaran-finance\docs\
├── 01-business/
│   ├── decision-log.md                       # Architectural Decision Records (ADR-01 through ADR-18)
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
│   ├── openapi-spec.json                     # Generated OpenAPI 3.0 JSON specification
│   └── openapi-types.ts                      # Strongly-typed TypeScript client SDK contract
├── 04-engineering/
│   ├── setup-and-contributing.md             # Local environment & Docker guide
│   ├── ai-coding-guidelines.md               # Prompt templates & AI guardrails
│   ├── ai-agent-development-playbook.md      # Guided coding playbook & task-to-doc map
│   ├── database-migration-and-seeding-guide.md # Docker, Prisma migrations & BigInt seeding
│   └── definition-of-done.md                 # 10-gate quality checklist per module
├── 05-testing/
│   ├── financial-tests.md                    # Math invariant & concurrency tests
│   └── payment-integration.md                # Webhooks, sandbox, & bank reconciliation
├── 06-devops/
│   ├── infrastructure-and-drp.md             # Fresh AWS setup, backups, restore drill
│   ├── ci-cd-pipeline.md                     # GitHub Actions pipeline
│   └── security-threat-model.md              # Fintech OWASP Top 10, rate limits, audit defense
└── 07-operations/
    ├── manual-onboarding-sop.md              # Physical notebook-to-digital onboarding wizard
    ├── operations-sop.md                     # Daily cash handover & reversal SOP
    └── user-manuals/
        ├── admin-foreman-manual.md           # Web dashboard operations manual
        ├── agent-mobile-manual.md            # Field agent Android app manual
        └── customer-app-guide.md             # Customer passbook & payment guide
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
- **MinIO S3 Local Storage** on port `9000` (API) and port `9001` (Web Console)
- **Bucket Initializer** which auto-creates the private bucket `kumaran-chits-private`

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

---

## Interactive Web Dashboards & Verification

Open your browser and verify the built-in administrative & observability portals:

| Portal / Tool | URL | Default Credentials | Description |
|---|---|---|---|
| **Swagger OpenAPI Explorer** | [http://localhost:3000/api/docs](http://localhost:3000/api/docs) | None (Public) | Interactive testing for all 105 physical paths (111 operations). |
| **Bull Board Queue Monitor** | [http://localhost:3000/admin/queues](http://localhost:3000/admin/queues) | User: `admin`<br>Pass: `chitflow_secret` | Visual dashboard for `daily-maintenance-queue`, `notification-queue`, and `reconciliation-queue`. |
| **Prometheus Metrics Exporter** | [http://localhost:3000/metrics](http://localhost:3000/metrics) | User: `admin`<br>Pass: `chitflow_secret` | Standard Prometheus telemetry: HTTP p95 latencies, BullMQ queues & chit fund KPIs. |
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
# Run Oxlint linter (0 warnings, 0 errors expected)
pnpm run lint

# Run all 24 unit test suites (343 / 343 passing tests, 100% pass rate)
pnpm test

# Run all 10 end-to-end integration test suites (82 / 82 passing tests, total 425 / 425 passing tests)
pnpm test:e2e:fresh

# Run production compilation check
pnpm run build
```

---

## Production Full-Stack Orchestration (With Nginx Ingress)

To run the complete production-parity stack containerized behind Nginx reverse proxy:

```powershell
# Start PostgreSQL, Redis, MinIO, NestJS API, and Nginx reverse proxy
pnpm docker:fullstack:up

# Inspect logs
pnpm docker:logs

# Stop containers
pnpm docker:fullstack:down
```
When running full-stack, access the system directly through Nginx on [http://localhost](http://localhost) (Port 80).

---

## Troubleshooting Guide

Encountering an issue? Refer to the comprehensive [**Troubleshooting Guide (docs/04-engineering/troubleshooting-guide.md)**](docs/04-engineering/troubleshooting-guide.md) for root-cause analysis and copy-paste remedies covering:
- **Category A**: Docker port collisions (5433, 6379, 9000, 9001) and daemon startup issues
- **Category B**: PostgreSQL connection failures and Prisma migration conflicts
- **Category C**: MinIO vs AWS S3 Server-Side Encryption (SSE-S3) and bucket self-healing
- **Category D**: BullMQ Redis direct-execution fallback mode and Bull Board auth
- **Category E**: The 10 Invariant Financial Guardrail rejections (Maker != Checker, 1/4 ceiling, defaulters)
- **Category F**: JWT auth, token expiration, and RBAC matrix permissions
- **Category G**: Windows PowerShell syntax (`&&` vs `;`) and execution policies
- **Category H**: Nginx ingress 502 Bad Gateway and upload size limits
- **Nuclear Reset**: Clean-slate reset runbook in under 60 seconds

