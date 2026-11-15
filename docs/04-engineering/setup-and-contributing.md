# Kumaran Chits — Developer Setup & Contributing Guide

> **Product**: **Kumaran Chits** (Kumaran Finance)

## 1. Prerequisites
- **Node.js**: v20 LTS or v22 LTS (Active LTS recommended for NestJS 12).
- **Docker & Docker Compose**: For local PostgreSQL 17 database.
- **Git**: Version control.
- **Flutter SDK**: v3.24+ (for Android mobile app development).
- **Editor**: VS Code / Antigravity with Prisma and Flutter extensions.

---

## 2. Repository Layout

```text
Kumaran-finance/
├── apps/
│   ├── api/                 # NestJS 12 Backend (Modular Monolith)
│   ├── mobile/              # Flutter Android-first application (In development)
│   └── web/                 # Next.js 15 Web Operations Portal (Admin, Accountant, Partners, Auditor)
├── infra/
│   ├── docker/              # Docker Compose (PostgreSQL 17)
│   └── scripts/             # Database backup & restore automation scripts
├── docs/                    # Complete Project Documentation Suite
├── .github/workflows/       # CI/CD pipelines (ephemeral Postgres, lint, test, build)
├── package.json             # Root monorepo workspace orchestration
├── .editorconfig            # Monorepo code style formatting rules
├── .prettierrc              # Monorepo Prettier configuration
├── .gitignore
├── LICENSE
└── README.md
```

---

## 3. Local Development & Verification Quickstart

### Step 1: Start Background Infrastructure (PostgreSQL 17, Redis 7 & MinIO S3)
From the repository root:
```powershell
pnpm docker:up
```
This automatically boots:
- **PostgreSQL 17 Database** on port `5433` (`chitflow-db`)
- **Redis 7 In-Memory Queue** on port `6379` (`chitflow-redis`)
- **MinIO S3 Local Storage** on port `9000` (API) and port `9001` (Web Console)
- **Bucket Initializer** which auto-creates the private bucket `kumaran-chits-private`

---

### Step 2: Configure Backend Environment & Install Dependencies
From the repository root:
```powershell
# Copy environment template if not present
if (!(Test-Path apps\api\.env)) { Copy-Item apps\api\.env.example apps\api\.env }

# Install Node.js dependencies across all workspaces
pnpm install
```

---

### Step 3: Run Database Migrations & Seed Foundational Data
Run directly from repository root:
```powershell
# Apply Prisma migrations to PostgreSQL
pnpm run prisma:migrate

# Seed Head Office (PRD) and initial Super Admin partner
pnpm run prisma:seed
```

---

### Step 4: Verify Quality Gates & Start Development Servers
```powershell
# 1. Run Oxlint linter (0 errors, 0 warnings expected)
pnpm run lint

# 2. Run backend unit & integration tests (100% pass expected)
pnpm test
pnpm run test:e2e:fresh

# 3. Run frontend unit tests (100% pass expected, 97 tests)
pnpm --filter web test

# 4. Strict frontend typecheck
pnpm web:typecheck

# 5. Start NestJS Backend API in development watch mode (Terminal 1)
pnpm run start:dev

# 6. Start Next.js Web Operations Portal (Terminal 2)
pnpm web:dev
```

---

### Step 5: Interactive Web Dashboards & Portals

Open your browser to test the built-in administrative & observability portals:

| Portal / Tool | URL | Default Credentials | Description |
|---|---|---|---|
| **Web Operations Portal** | [http://localhost:3001](http://localhost:3001) | Phone: `9876543210`<br>Pass: `Admin@Kumaran2026` | Next.js 15 bilingual operations portal (Schemes, Onboarding, Dues, Auctions). |
| **Swagger OpenAPI Explorer** | [http://localhost:3000/api/docs](http://localhost:3000/api/docs) | None (Public) | Interactive testing for all 112 physical paths (118 operations). |
| **Bull Board Queue Monitor** | [http://localhost:3000/admin/queues](http://localhost:3000/admin/queues) | Active Super Admin JWT Session<br>(or non-default `BULL_BOARD_USER` Basic Auth) | Visual dashboard for `daily-maintenance-queue`, `notification-queue`, and `reconciliation-queue`. Requires Super Admin session. |
| **Prometheus Metrics Exporter** | [http://localhost:3000/metrics](http://localhost:3000/metrics) | `METRICS_USER` / `METRICS_PASSWORD`<br>(Insecure defaults rejected in production) | Standard Prometheus telemetry: HTTP p95 latencies, BullMQ queues & chit fund KPIs. |
| **MinIO S3 Storage Console** | [http://localhost:9001](http://localhost:9001) | User: `chitflow_admin`<br>Pass: `chitflow_storage_secret` | Web file browser showing the `kumaran-chits-private` bucket. |
| **Prisma Studio (DB GUI)** | Run `pnpm run prisma:studio` | Opens [http://localhost:5555](http://localhost:5555) | Visual database table browser and editor. |

---

### Step 6: Automated S3 Database Backup & Restore Runbook

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

### Step 7: Production Full-Stack Orchestration (With Nginx Ingress)

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

> [!NOTE]
> **Production Setup**: For live deployment on any Flat-Fee Linux VPS (Hostinger, DigitalOcean, Hetzner, Linode, Vultr, etc.) + Cloudflare R2 (₹0 egress), refer to the [Production Infrastructure & DRP Guide](file:///u:/Kumaran-finance/docs/06-devops/infrastructure-and-drp.md) and the [Production Deployment & Operations Guide](file:///u:/Kumaran-finance/docs/07-operations/PRODUCTION-DEPLOYMENT-GUIDE.md).

---

## 4. Git Branching & Commit Conventions

- **Default Branch**: `main` (production-ready or stable milestone code).
- **Feature Branches**: `feat/<module-name>` (e.g., `feat/company-branch`, `feat/auth-rbac`).
- **Fix Branches**: `fix/<bug-description>`.
- **Commit Messages**: Follow Conventional Commits format:
  - `feat(api): add company and branch schema with migration`
  - `test(api): add financial invariant tests for chit auction dividend`
  - `docs(business): update financial rules with approved 4% commission`

---

## 5. Security Checklist Before Committing
1. **Never commit secrets**: Check `.env` files and API keys are in `.gitignore`.
2. **Never commit real customer data**: Only synthetic test fixtures.
3. **Run linter and tests**: Ensure `pnpm run lint` and `pnpm test` exit with 0 errors before pushing.

---

## 6. Troubleshooting & Diagnostics

If you encounter any port conflicts, database drift, MinIO S3 upload errors, Redis connectivity warnings, or financial invariant guardrail rejections, consult the comprehensive:

👉 [**docs/04-engineering/troubleshooting-guide.md**](troubleshooting-guide.md)

It contains exact error strings, root causes, copy-paste remedies for Categories A through H, and the **Nuclear Clean Slate Runbook** (reset entire local stack in < 60 seconds).
