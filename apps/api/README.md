# Kumaran Chits — NestJS Backend API (`apps/api`)

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance** (Head Office: Perundurai, Erode, Tamil Nadu)  
> **Package Architecture**: NestJS 12 Modular Monolith in `apps/api/` (**18 Controllers**, **134 HTTP Operations** + Bull Board UI `/admin/queues`)  
> **Monorepo Manager**: `pnpm@12.14.0` (Workspace Monorepo, Node.js 24 LTS)  
> **Database & Cache**: PostgreSQL 17 + Prisma ORM 6 (**18 models**, **8 enums**, **23 linear migrations**), Redis 7 (`noeviction`) + BullMQ  
> **Financial Math**: Pure whole-rupee integer arithmetic (`BigInt`). Zero paise and zero floating-point math.

---

## 1. Monorepo Workspace Operations (`pnpm`)

All build, test, and execution commands are run directly from the repository root using `pnpm`:

```powershell
# Start NestJS backend in development watch mode
pnpm run start:dev

# Run Oxlint fast linter (0 errors, 0 warnings required)
pnpm run lint

# Run all automated unit and financial invariant tests (63 suites / 1,226 tests)
pnpm test

# Run end-to-end (e2e) tests (14 suites / 187 tests)
pnpm run test:e2e

# Compile production NestJS build into dist/
pnpm run build

# Regenerate Prisma Client
pnpm run prisma:generate

# Apply database migrations to PostgreSQL (dev / deploy)
pnpm run prisma:migrate
pnpm --filter api exec prisma migrate deploy

# Seed Head Office (PRD) and initial 9 staff accounts (including 4 Verified Partners)
pnpm run prisma:seed

# Launch visual database inspector (Prisma Studio)
pnpm run prisma:studio

# Re-export OpenAPI / Swagger JSON contract
pnpm --filter api run openapi:export
```

### Verified Automated Test Baselines
- **Unit & Financial Invariant Tests**: **63 suites / 1,226 tests** passing.
- **API E2E Integration Suites**: **14 suites / 187 tests** passing against real PostgreSQL 17 + Redis 7.
- **Real PostgreSQL 17 Concurrency Suite**: **26 / 26** invariants passing (`CONCURR-INV-1..26` verifying `SELECT FOR UPDATE`, deterministic lock ordering, `withTransactionRetry`, and distributed locks).

### Direct Workspace Invocation
If you prefer targeting the `api` workspace explicitly:
```powershell
pnpm --filter api <command>
```
*Note: Dependencies are managed centrally at the monorepo root via `pnpm install`. Do not run `npm install` inside `apps/api/`.*

---

## 2. Environment Configuration & Fail-Fast Validation

Environment variables are validated fail-fast at startup via [`src/config/env.validation.ts`](src/config/env.validation.ts). If any mandatory variable is missing or violates production hardening guards, the NestJS process halts immediately with an explicit configuration error.

### Production Hardening Guards (`NODE_ENV=production`)
When `NODE_ENV=production`, `validateEnv()` strictly enforces:
1. `STORAGE_DRIVER` **must** be `'s3'` (blocks local disk fragmentation across instances).
2. `JWT_SECRET` **must** be a cryptographically secure string of at least **32 characters** and must not contain placeholder text (`replace-with-a-secure-random`).
3. `BULL_BOARD_PASSWORD` and `METRICS_PASSWORD` **cannot** use the insecure default `"chitflow_secret"`.
4. `SMS_DRIVER=msg91` requires `MSG91_AUTH_KEY`; `STORAGE_DRIVER=s3` requires `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`.

### Environment Variable Catalog (`apps/api/.env`)

| Variable | Type | Mandatory? | Default (Local Dev) | Description |
|---|:---:|:---:|---|---|
| `PORT` | `number` | Optional | `3000` | HTTP port for NestJS API (`3002` for dedicated worker container). |
| `NODE_ENV` | `string` | Optional | `development` | Runtime environment (`development`, `staging`, `production`, `test`). |
| `API_PREFIX` | `string` | Optional | `api/v1` | Global URI prefix for all REST controllers. |
| `DATABASE_URL` | `string` | **Yes** | `postgresql://chitflow:chitflow_dev_only@127.0.0.1:5433/chitflow_dev?schema=public` | PostgreSQL 17 connection string. |
| `JWT_SECRET` | `string` | **Yes** | Configured in `.env` | HS256 signing secret ($\ge 32$ chars in production; shared with `apps/web` Edge Middleware). |
| `JWT_EXPIRES_IN` | `string` | Optional | `15m` | Short-lived access token lifespan. |
| `REFRESH_TOKEN_EXPIRES_IN` | `string` | Optional | `7d` | Refresh token session lifespan. |
| `CORS_ALLOWED_ORIGINS` | `string` | Optional | `undefined` | Comma-separated allowed web origins (also falls back to `CORS_ORIGINS`). |
| `TRUST_PROXY` | `string` | Optional | `undefined` | Express reverse-proxy trust setting validated by `parseTrustProxySetting()`. |
| `DEFAULT_FOREMAN_COMMISSION_PERCENT` | `number` | Optional | `4.00` | Default Foreman commission frozen per group upon activation (`ADR-04`). |
| `PRIMARY_BRANCH_CODE` | `string` | Optional | `PRD` | Branch code for Head Office (Perundurai). |
| `STORAGE_DRIVER` | `string` | Optional | `local` | Attachment storage driver (`local` or `s3`; forced to `s3` in production). |
| `LOCAL_STORAGE_PATH` | `string` | Optional | `./storage/uploads` | Local upload path in dev/test mode. |
| `S3_BUCKET` / `S3_REGION` | `string` | If S3 | `undefined` / `ap-south-1` | Private S3 / Cloudflare R2 / MinIO bucket & region. |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | `string` | If S3 | `undefined` | Object storage credentials. |
| `S3_ENDPOINT` / `S3_FORCE_PATH_STYLE` | `string` / `boolean` | Optional | `undefined` | Custom S3 endpoint (e.g., Cloudflare R2 or `http://127.0.0.1:9000` MinIO). |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_DB` | `string` / `number` | Optional | `127.0.0.1` / `6379` / `0` | Redis 7 host, port, and logical DB (`0`–`15`; use `1` for isolated test runs). |
| `BULL_BOARD_USER` / `BULL_BOARD_PASSWORD` | `string` | Optional | `admin` / `chitflow_secret` | Secondary HTTP Basic Auth for `/admin/queues` (default password blocked in production). |
| `METRICS_USER` / `METRICS_PASSWORD` | `string` | Optional | Falls back to Bull Board creds | HTTP Basic Auth for Prometheus `/metrics` endpoint (default password blocked in production). |
| `SMS_DRIVER` / `SMS_SENDER_ID` | `string` | Optional | `mock` / `KMRCHT` | TRAI DLT SMS driver (`mock` or `msg91`) and registered DLT header (`ADR-23`). |
| `MSG91_AUTH_KEY` / `MSG91_DLT_TE_ID` / `MSG91_DLT_*_TEMPLATE_ID` | `string` | If `msg91` | `undefined` | MSG91 API key, DLT Entity ID, and approved OTP/Receipt/Auction/Default template IDs. |
| `SMS_MAX_RETRIES` / `SMS_RETRY_BASE_DELAY_MS` / `SMS_REQUEST_TIMEOUT_MS` / `MAX_DAILY_OTP_REQUESTS` | `number` | Optional | `2` / `400` / `5000` / `5` | SMS circuit/retry backoff and per-phone daily OTP cap. |
| `PUSH_DRIVER` / `FIREBASE_*` | `string` | Optional | `undefined` | Phase 2 Q2 2027 Android FCM Push driver (`mock` or `firebase`, `ADR-26`). |
| `SENTRY_DSN` / `SENTRY_ENVIRONMENT` / `SENTRY_TRACES_SAMPLE_RATE` | `string` / `number` | Optional | `undefined` / `NODE_ENV` | Error tracking & APM sampling (`0.0`–`1.0`; safe bypass when DSN is empty). |
| `COMPANY_UPI_VPA` / `COMPANY_UPI_NAME` | `string` | Optional | `kumaranfinance@kvb` / `Kumaran Finance` | Official Karur Vysya Bank UPI payee VPA for customer claim verification (`ADR-19`). |

---

## 3. Production Docker Multi-Stage Build

Build the production multi-stage Docker image from the monorepo root:
```bash
docker build -t kumaran-chits-api -f apps/api/Dockerfile .
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

## 4. The 11 Invariant Architectural Guardrails (`CONFIRMED-BY-DEVELOPER`)

Every engineer and AI assistant contributing to `apps/api/` must strictly uphold all **11 non-negotiable architectural guardrails** (aligned with `AGENTS.md`):

1. **Single-Company Tenancy (`ADR-01`)**: Built solely for Kumaran Finance. Zero `company_id` columns exist in any table.
2. **Whole-Rupee Math (`BigInt`) & Divisibility (`KFC-FIN-002`)**: All monetary figures (installments, bids, dividends, commissions, prize money) are 64-bit integer Rupees (`BigInt` in Prisma, native `bigint` in TypeScript; serialized via [`src/common/interceptors/bigint.interceptor.ts`](src/common/interceptors/bigint.interceptor.ts)). Paise, `.00` decimals, and floats are prohibited; net distributable dividends must divide evenly across all $N$ tickets.
3. **Commission Freeze (`ADR-04`)**: Foreman commission defaults to **4.00%**, copied and permanently frozen per chit group upon activation.
4. **Universal Equal Dividend Deduction**: Dividends are divided equally across **ALL** subscribers in the chit group, including the auction winner and past prized winners ($I_{net} = I_{base} - Div_{ticket}$).
5. **Month 1 & Month $N$ Rules (`FIN-B`)**: Month 1 full pool is taken by the company ticket (**no auction**, ₹0 dividend). Month $N$ settles directly to the final subscriber minus 4% commission (**no auction**). Auctions occur exclusively in Months $2$ through $N-1$.
6. **Fixed 1/4 Ceiling & Option A Tie-Break (`ADR-06`)**: Auction discount ceiling is fixed strictly at **25% ($V / 4$)**. Ties at the ceiling are broken via physical paper token draw at the branch; staff records the physically drawn winner — **zero autonomous software lottery draws**.
7. **Ticket Limit Constraint (`ADR-13`)**: Database-enforced `@@unique([chitGroupId, customerId])` prevents a customer from holding 2 or more tickets in the same chit group.
8. **Defaulter & Single Discrete Payment Rules (`ADR-07`)**: Unpaid members cannot bid in that month's auction; 3 consecutive unpaid months grants removal rights. Each installment month has strictly one discrete payment — zero partial payments, zero double payments, zero late fees, and zero advance balances (`DueStatus`: `UNPAID`, `PAID`, `OVERDUE`). Full cash receipts & prize payouts are supported without artificial caps (`DisbursementMode.CASH`), and customer intake requires only Full Name, Phone, Address, and City (`ADR-16`; Aadhaar/PAN/scans optional).
9. **Company Safety Proof Checklist (`ADR-15`)**: Property documents are completely eliminated. Collateral/surety is non-mandatory and tracked via a flexible checklist and scanned attachments (signed agreement, blank cheques, promissory notes).
10. **Maker $\ne$ Checker Dual Control**: Critical mutations (payment reversals, auction finalization, prize disbursements, evening cash handover `collector_user_id != acknowledger_user_id`, defaulter removal) strictly enforce **`maker_user_id != checker_user_id`** in application logic and **8 PostgreSQL engine-level `CHECK` constraints**.
11. **Verified Partner Identity & Persona Separation (`ADR-21`, `ADR-27` / `SEC-A`)**: `SUPER_ADMIN` and `PARTNER` are strictly separate first-class roles (legacy `isPartner` boolean removed). Administrative IT Super Admins (`Role.SUPER_ADMIN`) cannot authorize financial mutations; only verified statutory partners (`Role.PARTNER`) can act as Maker or Checker on financial operations. Viewing immutable Audit Logs (`/api/v1/reports/audit-logs`) and BullMQ telemetry (`/api/v1/jobs/*`, `/admin/queues`) is restricted strictly to `SUPER_ADMIN`. PostgreSQL 17 remains the sole financial truth (volatile ledgers are never cached in Redis; historical closed reports leverage HTTP 304 ETags).

---

## 5. Module Structure Overview (`21` Subdirectories in `apps/api/src/`)

```text
apps/api/src/
├── assets/          # Bundled Tamil/English Noto Sans fonts & static PDF receipt assets
├── auction/         # In-office auctions (Months 2..N-1), Option A tie-break, Registrar filing
├── auth/            # 6-persona identity, 15 auth endpoints, Redis SMS OTP, MPIN, TOTP, JWT, RBAC guards
├── branch/          # Branch office administration (PRD, ERD) & bilingual Tamil names
├── chit/            # Chit schemes, groups, activation freeze, lifecycle & mid-cycle notebook onboarding
├── collection/      # Field cash collection, UPI claim intake, evening vault cash handover
├── common/          # Interceptors (BigInt, Envelope), filters, guards, distributed locks, retry, Sentry, throttler
├── config/          # Fail-fast environment schema & production hardening validator (env.validation.ts)
├── customer/        # Lightweight notebook intake (ADR-16), S3 KYC scans, directory & nominees
├── disbursement/    # Prize payouts (Cash/Bank), maker-checker release & safety proof checklist (ADR-15)
├── health/          # Liveness & readiness probes (/health, /health/liveness, /health/readiness)
├── installment/     # Universal equal dividend dues, digital passbook, arrears & defaulters
├── jobs/            # BullMQ workers, 9 admin job routes, IST cron schedules & Bull Board (/admin/queues)
├── metrics/         # Prometheus /metrics exporter & APM instrumentation (HTTP Basic Auth)
├── notification/    # Bilingual TRAI DLT SMS (MSG91) & Phase 2 FCM Push drivers (zero WhatsApp)
├── payment/         # Discrete whole-rupee payments, UPI claims, bilingual receipts, Partner-only reversals
├── pdf/             # Bilingual PDF engine (English + தமிழ் A5 receipts & payout vouchers)
├── prisma/          # PrismaService lifecycle, connection pooling & transaction retry helpers
├── report/          # Form XVII, Form XXI, Form XXII Cash Book, Day Book, Defaulters, Approvals SSE & SUPER_ADMIN Audit Logs
├── storage/         # Local & Private S3/R2 driver with 15-minute presigned URLs
└── user/            # Staff administration, RBAC role governance, emergency password reset
```
