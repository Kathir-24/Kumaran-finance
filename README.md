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
│   ├── decision-log.md                       # Architectural Decision Records (ADR-01 through ADR-15)
│   ├── financial-rules.md                    # Confirmed financial math (whole-rupee mandate, 4% commission, dividends)
│   ├── permissions-matrix.md                 # RBAC + maker-checker dual controls (4 partners & field agents)
│   ├── compliance-checklist.md               # Regulatory items, data minimization, & statutory review
│   └── open-questions.md                     # Centralized log of open questions and unverified legal claims
├── 02-requirements/
│   ├── prd.md                                # 10 core modules acceptance criteria
│   ├── user-stories-and-journeys.md          # 6 personas, 28 features, user stories & journey maps
│   ├── non-functional-requirements.md        # Security, latency, precision standards
│   └── notification-and-receipt-templates.md # Bilingual Tamil+English SMS, WhatsApp, & PDF receipts
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
│   └── openapi-spec.json                     # Generated OpenAPI 3.0 JSON specification
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

## Local Development Quickstart

Follow these 4 steps to get a fully working local development environment:

### Step 1: Start PostgreSQL 17 Database
```powershell
cd infra\docker
if (!(Test-Path .env)) { Copy-Item .env.example .env }
docker compose up -d
cd ..\..
```
The database will be available on `127.0.0.1:5433` (`chitflow_dev`).

### Step 2: Configure Environment & Install All Dependencies
```powershell
# Copy backend environment template
if (!(Test-Path apps\api\.env)) { Copy-Item apps\api\.env.example apps\api\.env }

# Install dependencies across all monorepo workspaces
pnpm install
```

### Step 3: Apply Migrations & Seed Foundational Data (Run from root)
```powershell
# Apply Prisma schema migrations to PostgreSQL
pnpm run prisma:migrate

# Seed Head Office (PRD) and initial Super Admin partner
pnpm run prisma:seed
```

### Step 4: Run Tests & Launch Development Server
```powershell
# Run unit & financial invariant tests (100% pass)
pnpm test

# Run end-to-end tests
pnpm run test:e2e

# Start the NestJS backend in development watch mode
pnpm run start:dev
```

### Live Endpoints & Tools:
- **API Base URL**: `http://localhost:3000`
- **Health Check**: `http://localhost:3000/health` (returns `{"status":"ok","service":"chitflow-api"}`)
- **Swagger / OpenAPI Documentation**: `http://localhost:3000/api/docs` *(interactive API explorer)*
- **Prisma Studio (Visual Database GUI)**: `pnpm run prisma:studio` (opens `http://localhost:5555`)
