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
| `NODE_ENV` | `string` | Optional | `development` | Runtime environment (`development`, `staging`, `production`, `test`). |
| `API_PREFIX` | `string` | Optional | `api/v1` | Global URI prefix for all REST controllers. |
| `DATABASE_URL` | `string` | **Yes** | `postgresql://chitflow:chitflow_dev_only@127.0.0.1:5433/chitflow_dev?schema=public` | PostgreSQL connection string. |
| `JWT_SECRET` | `string` | **Yes** | Configured in `.env` | Secret key for signing staff JWT access tokens. |
| `JWT_EXPIRES_IN` | `string` | Optional | `15m` | Access token lifespan. |
| `REFRESH_TOKEN_EXPIRES_IN`| `string` | Optional | `7d` | Refresh token lifespan. |
| `CORS_ALLOWED_ORIGINS` | `string` | Optional | `http://localhost:3000,http://localhost:3001` | Comma-separated allowed web origins. |
| `DEFAULT_FOREMAN_COMMISSION_PERCENT`| `number` | Optional | `4.00` | Default Foreman commission rate frozen per group upon activation (ADR-04). |
| `PRIMARY_BRANCH_CODE` | `string` | Optional | `PRD` | Branch code for Head Office (Perundurai). |
| `STORAGE_DRIVER` | `string` | Optional | `local` | Attachment storage driver (`local` or `s3`). |
| `LOCAL_STORAGE_PATH` | `string` | Optional | `./storage/uploads` | Path for uploaded KYC documents and PDF receipts in local mode. |
| `S3_BUCKET` | `string` | If S3 | `kumaran-chits-private` | Universal S3 bucket name (Cloudflare R2, MinIO, S3). |
| `S3_REGION` | `string` | Optional | `ap-south-1` | S3 region (Mumbai). |
| `S3_ACCESS_KEY_ID` | `string` | If S3 | `undefined` | S3 access key ID. |
| `S3_SECRET_ACCESS_KEY`| `string` | If S3 | `undefined` | S3 secret access key. |
| `S3_ENDPOINT` | `string` | Optional | `undefined` | Custom S3 endpoint (e.g. `http://127.0.0.1:9000` for MinIO). |
| `S3_FORCE_PATH_STYLE` | `boolean`| Optional | `false` | Required true for local MinIO compatibility. |
| `REDIS_HOST` | `string` | Optional | `127.0.0.1` | Redis host for BullMQ background queues and distributed OTP storage. |
| `REDIS_PORT` | `number` | Optional | `6379` | Redis port for BullMQ background queues and distributed OTP storage. |
| `REDIS_DB` | `number` | Optional | `0` | Redis logical database index (`0`–`15`; use `1` for isolated test runs). |
| `BULL_BOARD_USER` | `string` | Optional | `admin` | HTTP Basic Auth user for Bull Board at `/admin/queues`. |
| `BULL_BOARD_PASSWORD` | `string` | Optional | `chitflow_secret` | HTTP Basic Auth password for Bull Board. |
| `SMS_DRIVER` | `string` | Optional | `mock` | SMS gateway driver (`mock` for dev/test, `msg91` for production DLT). |
| `PUSH_DRIVER` | `string` | Optional | `mock` | Mobile Push driver (`mock` or `firebase` for FCM). |
| `SENTRY_DSN` | `string` | Optional | `""` | Sentry DSN (safe-bypass when empty). |

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
10. **PostgreSQL Sole Financial Truth & Caching Strategy**: Volatile financial ledgers and dues are never cached in Redis or in-memory. Master reference data (branches, schemes) are cached in Redis with atomic invalidation. Historical closed reports leverage HTTP 304 ETags ([`docs/03-architecture/caching-architecture.md`](../../docs/03-architecture/caching-architecture.md)).

---

## 5. Module Structure Overview

```text
apps/api/src/
├── auth/            # 6-persona identity, Redis SMS OTP (300s TTL), MPIN, 2FA TOTP, JWT, RBAC guards
├── branch/          # Branch office administration (PRD, ERD) & bilingual Tamil names
├── user/            # Staff user administration, RBAC role assignment & status toggle
├── customer/        # Customer intake, S3 KYC scans, directory & nominees
├── chit/            # Chit schemes, groups, lifecycle & mid-cycle onboarding
├── auction/         # In-office auctions, Option A physical token tie-break, Registrar filing
├── installment/     # Universal dividend dues generation, digital passbook, defaulters
├── collection/      # Field cash collection, BullMQ receipt queueing, evening vault cash handover
├── payment/         # Discrete payments, BullMQ receipt queueing, maker-checker reversals
├── disbursement/    # Prize payouts (Cash/Bank) & company safety proof checklist
├── report/          # Form XVII statutory registers & partner audit registers
├── storage/         # Local & Private S3 driver with presigned URLs
├── pdf/             # Bilingual PDF canvas engine (EN + தமிழ்)
├── jobs/            # BullMQ background workers (daily arrears, reconciliation, receipt dispatches)
└── common/          # Interceptors (BigInt, Response envelope), filters, guards, decorators
```
