# Kumaran Chits — NestJS Backend API (`apps/api`)

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance** (Head Office: Perundurai, Erode, Tamil Nadu)  
> **Package Architecture**: NestJS 12 Modular Monolith in `apps/api/`  
> **Monorepo Manager**: `pnpm 12+` (Workspace Monorepo)  
> **Database & Cache**: PostgreSQL 17 + Prisma ORM 6, Redis 7 + BullMQ  
> **Financial Math**: Pure whole-rupee integer arithmetic (`BigInt`). Zero paise and zero floats.

---

## 1. Monorepo Workspace Operations (`pnpm`)

All build, test, and execution commands are run directly from the repository root using `pnpm`:

```powershell
# Start NestJS backend in development watch mode
pnpm run start:dev

# Run Oxlint fast linter (0 errors, 0 warnings required)
pnpm run lint

# Run all automated unit and financial invariant tests
pnpm test

# Run end-to-end (e2e) tests
pnpm run test:e2e

# Compile production NestJS build into dist/
pnpm run build

# Regenerate Prisma Client
pnpm run prisma:generate

# Apply database migrations to PostgreSQL
pnpm run prisma:migrate

# Seed Head Office (PRD) and initial Super Admin partner
pnpm run prisma:seed

# Launch visual database inspector (Prisma Studio)
pnpm run prisma:studio

# Re-export OpenAPI / Swagger JSON contract
pnpm --filter api run openapi:export
```

### Direct Workspace Invocation
If you prefer targeting the `api` workspace explicitly:
```powershell
pnpm --filter api <command>
```
*Note: Dependencies are managed centrally at the monorepo root via `pnpm install`. Do not run `npm install` inside `apps/api/`.*

---

## 2. Environment Configuration & Validation

Environment variables are validated fail-fast at server startup via [`src/config/env.validation.ts`](src/config/env.validation.ts). If any mandatory variable is missing or malformed, the process halts immediately with an explicit error.

### Environment Variable Catalog (`apps/api/.env`)

| Variable | Type | Mandatory? | Default (Local Dev) | Description |
|---|:---:|:---:|---|---|
| `PORT` | `number` | Optional | `3000` | HTTP port for NestJS server. |
| `NODE_ENV` | `string` | Optional | `development` | Runtime environment (`development`, `production`, `test`). |
| `API_PREFIX` | `string` | Optional | `api/v1` | Global URI prefix for all REST controllers. |
| `DATABASE_URL` | `string` | **Yes** | `postgresql://chitflow:chitflow_dev_only@127.0.0.1:5433/chitflow_dev?schema=public` | PostgreSQL connection string. |
| `JWT_SECRET` | `string` | **Yes** | Configured in `.env` | Secret key for signing staff JWT access tokens. |
| `JWT_EXPIRES_IN` | `string` | Optional | `15m` | Access token lifespan. |
| `REFRESH_TOKEN_EXPIRES_IN`| `string` | Optional | `7d` | Refresh token lifespan. |
| `DEFAULT_FOREMAN_COMMISSION_PERCENT`| `number` | Optional | `4.00` | Default Foreman commission rate frozen per group upon activation (ADR-04). |
| `PRIMARY_BRANCH_CODE` | `string` | Optional | `PRD` | Branch code for Head Office (Perundurai). |
| `STORAGE_DRIVER` | `string` | Optional | `local` | Attachment storage driver (`local` or `s3`). |
| `LOCAL_STORAGE_PATH` | `string` | Optional | `./storage/uploads` | Path for uploaded KYC documents and PDF receipts in local mode. |
| `AWS_REGION` | `string` | Optional | `ap-south-1` | AWS region for S3 object storage. |
| `AWS_ACCESS_KEY_ID` | `string` | If S3 | `undefined` | AWS IAM Access Key (mandatory when `STORAGE_DRIVER=s3`). |
| `AWS_SECRET_ACCESS_KEY`| `string` | If S3 | `undefined` | AWS IAM Secret Key (mandatory when `STORAGE_DRIVER=s3`). |
| `AWS_S3_BUCKET` | `string` | If S3 | `undefined` | Private S3 bucket name (mandatory when `STORAGE_DRIVER=s3`). |
| `REDIS_HOST` | `string` | Optional | `127.0.0.1` | Redis host for BullMQ scheduled jobs. |
| `REDIS_PORT` | `number` | Optional | `6379` | Redis port for BullMQ background queues. |

---

## 3. Production Docker Multi-Stage Build

Build the production multi-stage Docker image from the monorepo root:
```bash
docker build -t kumaran-chits-api -f apps/api/Dockerfile apps/api
```

Run the container in production:
```bash
docker run -d \
  --name kumaran-chits-api \
  -p 3000:3000 \
  --env-file apps/api/.env \
  kumaran-chits-api
```

---

## 4. Backend Architectural Invariants (`CONFIRMED-BY-DEVELOPER`)

Every engineer and AI assistant contributing to `apps/api/` must strictly uphold these 9 non-negotiable architectural rules:

1. **Whole-Rupee Math (`BigInt`)**: All monetary figures (installments, bids, dividends, commissions, prize money) are 64-bit integer Rupees (`BigInt` in Prisma, native `bigint` in TypeScript). Paise, `.00` decimals, and IEEE 754 floating-point numbers are strictly prohibited in financial code.
2. **BigInt Serialization**: Handled automatically on outgoing responses via [`src/common/interceptors/bigint.interceptor.ts`](src/common/interceptors/bigint.interceptor.ts).
3. **Single-Company Tenancy (ADR-01)**: Built solely for Kumaran Finance. Zero `company_id` columns exist in any table.
4. **Ticket Limit Constraint (ADR-13)**: Database-enforced rule `@@unique([chitGroupId, customerId])` prevents a customer from holding 2 or more tickets in the same chit group.
5. **Single Discrete Monthly Payment (ADR-07)**: Each installment month has strictly one discrete payment. Zero partial payments, double payments, or advance balances exist. `DueStatus` is strictly `UNPAID`, `PAID`, `OVERDUE`.
6. **Maker-Checker Separation of Duties**: Critical endpoints (payment reversals, auction finalization, prize disbursements) strictly enforce `maker_user_id != checker_user_id` at both application and database levels.
7. **Evening Cash Handover Guard**: Strictly enforces `collector_user_id != acknowledger_user_id` when acknowledging physical field cash into the branch vault.
8. **Hard Cash / Zero Cash Block**: Full cash receipts and prize payouts are supported at any rupee value without artificial software thresholds or blocks (`DisbursementMode.CASH`).
9. **Lightweight Notebook Intake**: Customer intake mirrors physical notebooks—only Full Name, Phone, and Address are required (Aadhaar, PAN, and document scans are strictly optional).

---

## 5. Module Structure Overview

```text
apps/api/src/
├── auth/            # 6-persona identity, 2FA TOTP, JWT, RBAC guards
├── customer/        # Notebook customer intake & directory
├── chit/            # Chit schemes, groups, lifecycle & mid-cycle onboarding
├── auction/         # In-office auctions, Option A physical token tie-break, Registrar filing
├── installment/     # Universal dividend dues generation, digital passbook, defaulters
├── collection/      # Field cash collection & evening vault cash handover
├── payment/         # Discrete payments, bilingual receipts, maker-checker reversals
├── disbursement/    # Prize payouts (Cash/Bank) & company safety proof checklist
├── report/          # Form XVII statutory registers & partner audit registers
├── storage/         # Local & Private S3 driver with presigned URLs
├── pdf/             # Bilingual PDF canvas engine (EN + தமிழ்)
├── jobs/            # BullMQ background workers (daily arrears, reconciliation, notifications)
└── common/          # Interceptors (BigInt, Response envelope), filters, guards, decorators
```
