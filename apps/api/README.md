# Kumaran Chits — NestJS Backend API

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance** (Head Office: Perundurai, Erode, Tamil Nadu)  
> **Tech Stack**: NestJS 12 + TypeScript, PostgreSQL 17 + Prisma ORM 6, Redis 7 + BullMQ  
> **Currency Standard**: PostgreSQL 64-bit integer Rupees (`BigInt`). Zero paise or floating-point decimals.

---

## 1. Quickstart Runbook

### Step 1: Ensure Local PostgreSQL 17 Database is Running
From the repository root:
```powershell
cd infra\docker
if (!(Test-Path .env)) { Copy-Item .env.example .env }
docker compose up -d
```
The database runs on `127.0.0.1:5433` (`chitflow_dev`).

### Step 2: Configure Environment & Install Dependencies
```powershell
cd ..\..\apps\api
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm install
```

### Step 3: Run Migrations & Seed Data
```powershell
# Apply Prisma schema migrations to PostgreSQL
npx prisma migrate dev

# Seed Head Office (PRD) and initial Super Admin partner
npx prisma db seed
```

### Step 4: Quality Checks & Server Launch
```powershell
# Run Oxlint (0 errors, 0 warnings required)
npm run lint

# Run automated unit and financial invariant tests (100% pass rate required)
npm test

# Start NestJS backend in development watch mode
npm run start:dev
```
- API Base URL: `http://localhost:3000`
- Health Check: `http://localhost:3000/health` (returns `{"status":"ok","service":"chitflow-api"}`)
- Prisma Studio: `npx prisma studio` (opens `http://localhost:5555`)

---

## 2. Environment Configuration & Validation

Environment variables are validated fail-fast at server startup via [`src/config/env.validation.ts`](src/config/env.validation.ts). If any critical variable is missing, the server halts immediately with an explicit error.

| Variable | Required | Default in Local Dev | Description |
|---|:---:|---|---|
| `PORT` | Optional | `3000` | HTTP port for NestJS server |
| `NODE_ENV` | Optional | `development` | Runtime environment (`development`, `production`, `test`) |
| `DATABASE_URL` | **Yes** | `postgresql://chitflow:chitflow_dev_only@127.0.0.1:5433/chitflow_dev?schema=public` | PostgreSQL connection URL |
| `JWT_SECRET` | **Yes** | Configured in `.env` | Secret key for signing staff JWT access tokens |
| `JWT_EXPIRES_IN` | Optional | `15m` | Access token lifespan |
| `REFRESH_TOKEN_EXPIRES_IN` | Optional | `7d` | Refresh token lifespan |
| `DEFAULT_FOREMAN_COMMISSION_PERCENT`| Optional | `4.00` | Foreman commission default (ADR-04) |
| `PRIMARY_BRANCH_CODE` | Optional | `PRD` | Primary branch code for Perundurai Head Office |

---

## 3. Docker Production Build

Build the production multi-stage Docker image:
```bash
docker build -t kumaran-chits-api .
```

Run the container:
```bash
docker run -p 3000:3000 --env-file .env kumaran-chits-api
```

---

## 4. Architectural Rules for Backend Engineers

Every developer and AI assistant contributing to `apps/api` must strictly follow these rules:
1. **Whole-Rupee Math (`BigInt`)**: Store and calculate currency strictly as whole integer Rupees (`BigInt` / native `bigint`). Paise and floating-point math are strictly prohibited.
2. **BigInt Serialization**: Handled automatically by [`src/common/interceptors/bigint.interceptor.ts`](src/common/interceptors/bigint.interceptor.ts).
3. **Database Constraints**: Enforce `@@unique([chitGroupId, customerId])` preventing duplicate tickets per customer in the same chit group (ADR-13).
4. **Single Payment Rule**: Enforce single discrete payment per month (`DueStatus`: `UNPAID`, `PAID`, `OVERDUE`). Reject partial payments, double payments, and advance balances (ADR-07).
5. **Maker $\ne$ Checker**: Strictly enforce `maker_user_id != checker_user_id` on payment reversals, auction finalization, and prize disbursements.
6. **Cash Handover Guard**: Enforce `collector_user_id != acknowledger_user_id` on cash handovers.
