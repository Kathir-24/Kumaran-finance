# Kumaran Chits — Database Migration, Seeding & BigInt Guide

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance**  
> **Stack**: PostgreSQL 17 + Prisma ORM + NestJS 12 (TypeScript)  
> **Currency Standard**: All monetary values are strictly **whole integer Rupees (`BigInt`)**. Paise and floating-point math are strictly prohibited (`CONFIRMED-BY-DEVELOPER`).

---

## 1. Architectural Directives

1. **Strict Single-Company Tenancy (ADR-01)**:
   - Built exclusively for Kumaran Finance.
   - Zero `company_id` columns exist in any table.
2. **Whole Rupee Precision**:
   - Database columns for money use PostgreSQL 64-bit integer (**`BigInt`**).
   - TypeScript code uses native JavaScript **`bigint`** (e.g., `100000n`, `5000n`).
3. **Immutability & Constraints**:
   - Enforce database-level unique constraint on `SubscriberTicket`: `@@unique([chitGroupId, customerId])` to mathematically prevent a customer from holding 2 or more tickets in the same chit group (ADR-13).

---

## 2. Local Docker PostgreSQL 17 Setup

Local database infrastructure is managed via Docker Compose under `infra/docker/`:

```powershell
# 1. Navigate to docker directory
cd infra\docker

# 2. Verify or create .env file from template
if (!(Test-Path .env)) { Copy-Item .env.example .env }

# 3. Start PostgreSQL 17 container in the background
docker compose up -d

# 4. Verify container is healthy and running
docker compose ps
```

### Connection Parameters:
- **Host**: `127.0.0.1`
- **Port**: `5433` (mapped from container port 5432 to prevent conflicts with local Postgres installations)
- **Database**: `chitflow_dev`
- **User**: `chitflow`
- **Password**: `chitflow_dev_only`
- **Prisma Connection URL** (`apps/api/.env`):
  ```text
  DATABASE_URL="postgresql://chitflow:chitflow_dev_only@127.0.0.1:5433/chitflow_dev?schema=public"
  ```

---

## 3. Prisma Schema & Migration Lifecycle

The authoritative database schema is defined in [`docs/03-architecture/data-model.md`](file:///u:/Kumaran-finance/docs/03-architecture/data-model.md).

### 3.1 Initial Setup (in `apps/api`)
```powershell
cd apps\api

# Install Prisma CLI as a dev dependency
pnpm add -D prisma

# Install Prisma Client runtime dependency
pnpm add @prisma/client
```

### 3.2 Running Development Migrations
When adding new entities or modifying the schema in `prisma/schema.prisma`:
```powershell
# Creates a new SQL migration file and applies it to the local database
pnpm exec prisma migrate dev --name init_kumaran_schema

# Regenerates the TypeScript Prisma Client
pnpm exec prisma generate
```

### 3.3 Visualizing and Inspecting Data (Prisma Studio)
Prisma provides a visual browser GUI to view tables, inspect whole-rupee numbers, and audit records:
```powershell
pnpm exec prisma studio
```
Opens in your browser at `http://localhost:5555`.

### 3.4 Applied Migrations & Verification Log
| Migration Name | Applied At | Description | Verification Status |
|---|---|---|:---:|
| `20261018110459_init_kumaran_schema` | 2026-10-18 | Initial schema creation: 10 models, 8 enums, `roles Role[]`, `BigInt` currency fields, `@@unique([chitGroupId, customerId])` ticket limit. | **Applied & Verified** |
| `20261018125155_add_auth_credentials_to_user` | 2026-10-18 | Added password authentication, TOTP secrets, MPIN bcrypt hash, and refresh token hashes to `User`. | **Applied & Verified** |
| `20261018171620_payment_reversal_maker_checker` | 2026-10-18 | Added PaymentReversal table enforcing dual control (`requestedByUserId != reviewedByUserId`). | **Applied & Verified** |
| `20261019120630_add_registrar_filing_to_auction_minutes` | 2026-10-19 | Added Form XVII filing reference and statutory filing date fields to `AuctionMinutes`. | **Applied & Verified** |
| `20261021142000_add_fcm_token_to_user_and_customer` | 2026-10-21 | Added nullable `fcmToken` column to both `User` and `Customer` tables for Firebase Cloud Messaging push dispatch. | **Applied & Verified** |
| `20261021170132_add_payment_notes` | 2026-10-21 | Added optional `notes` column to `Payment` for cashier remarks and collection logs. | **Applied & Verified** |
| `20261022205000_remove_user_email` | 2026-10-22 | Dropped `email` column from `User` table to enforce strict phone-only identity (ADR-18). | **Applied & Verified** |
| `20261023095606_add_cycle_date_windows` | 2026-10-23 | Added `cycleStartDate` and `cycleEndDate` to `InstallmentDue` for physical 6-column passbook ledger alignment. | **Applied & Verified** (`289/289` unit tests, `82/82` E2E tests passing) |

---

## 4. The BigInt JSON Serialization Pattern (`BigIntInterceptor`)

### 4.1 The Technical Challenge
JavaScript's built-in `JSON.stringify()` cannot serialize native `BigInt` numbers by default and throws:
```text
TypeError: Do not know how to serialize a BigInt
```

### 4.2 The NestJS Solution
We implement a global **`BigIntInterceptor`** in `apps/api/src/common/interceptors/bigint.interceptor.ts`. This interceptor automatically transforms all `bigint` properties into numbers (or strings) before HTTP responses leave the server, preventing API crashes while preserving database integer integrity:

```typescript
// apps/api/src/common/interceptors/bigint.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class BigIntInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map((data) => this.transform(data)));
  }

  private transform(value: any): any {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === 'bigint') {
      // Safe conversion for whole Rupees (amounts under ₹90,000 Crore fit safely in JS Number)
      return Number(value);
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.transform(item));
    }
    if (typeof value === 'object' && !(value instanceof Date)) {
      const transformed: Record<string, any> = {};
      for (const [key, val] of Object.entries(value)) {
        transformed[key] = this.transform(val);
      }
      return transformed;
    }
    return value;
  }
}
```

### 4.3 Global Registration in `main.ts`
```typescript
// apps/api/src/main.ts
app.useGlobalInterceptors(new BigIntInterceptor());
```

---

## 5. Comprehensive Database Seeding Runbook (`prisma/seed.ts`)

Seeding guarantees that every developer and test environment starts with comprehensive, realistic operational records covering all 17 Prisma models and 10 canonical $N$-scenarios.

### 5.1 Modular Seeder Architecture
The seeder is organized into specialized modules under `apps/api/prisma/seeders/`:

```
apps/api/prisma/
├── schema.prisma
├── seed.ts                                  # Orchestrator
└── seeders/
    ├── 01-branch-users.seeder.ts           # Branch & 7 Staff accounts across 6 RBAC roles
    ├── 02-customers.seeder.ts              # 25 Verified Tamil Nadu customers, Nominees & KYC
    ├── 03-schemes-groups.seeder.ts         # 5 Schemes/ChitGroups & unique SubscriberTickets (ADR-13)
    └── 04-scenarios.seeder.ts              # All 10 operational edge cases & N scenarios
```

### 5.2 The 10 Seeded $N$-Scenarios
| Scenario # | Scenario / Model Target | Seeded Characteristics |
|---|---|---|
| **Scenario 1** | **Staff Hierarchy & Personas** | 4 Partners (`SUPER_ADMIN`), 1 Branch Manager, 1 Accountant, 2 Field Agents, 1 Auditor. |
| **Scenario 2** | **Month 1 Company Pool Invariant** | `KCA-1L-20M-01`: Ticket #1 takes full pool without auction (₹0 dividend). 12 tickets paid at counter. |
| **Scenario 3** | **Active Competitive Bidding Group** | `KCB-2L-20M-01` (Month 4): Past auctions at ₹30k and ₹40k discounts with universal dividends. |
| **Scenario 4** | **Fixed 25% Ceiling Tie-Break (ADR-06)**| `KCA-1L-20M-02`: 3 subscribers bid max ceiling (₹25,000); physical token draw recorded with Ticket #7 drawn. |
| **Scenario 5** | **Defaulters & Arrears (ADR-07)** | `KCB-2L-20M-01`: Ticket #5 has 1 overdue month (ineligible to bid); Ticket #9 has 3 months continuous arrears (`DEFAULT_3_MONTHS`). |
| **Scenario 6** | **Mid-Cycle Notebook Onboarding (ADR-14)**| `KCC-5L-25M-LEGACY`: Migrated from handwritten records at Month 7. Months 1–6 recorded as historical imports. |
| **Scenario 7** | **Field Doorstep Collection & Handover**| Doorstep cash payment collected by Agent Murugan with `cashHandoverStatus: PENDING_HANDOVER`. |
| **Scenario 8** | **Maker-Checker Dual Control Reversal** | 1 Approved Reversal (Maker Murugan != Checker Senthil); 1 Pending Reversal awaiting admin UI review. |
| **Scenario 9** | **Prize Settlement & Safety Proof (ADR-15)**| Prize disbursement with signed blank cheques, promissory notes recorded, and voucher issued. |
| **Scenario 10**| **Mature Group Final Settlement (Month N)**| `KCA-1L-20M-MATURE`: Final non-prized subscriber awarded chit pool directly with 4% commission (no auction). |

### 5.3 Test Credentials
All seeded staff members use password `Admin@Kumaran2026` and mobile MPIN `123456`:
- **Managing Partner / Super Admin**: `9876543210` (`kumaran@kumaranfinance.com`)
- **Operations Partner / Checker**: `9876543211` (`senthil@kumaranfinance.com`)
- **Branch Manager (Maker)**: `9876543212` (`manager.prd@kumaranfinance.com`)
- **Desk Accountant (Maker)**: `9876543213` (`accounts@kumaranfinance.com`)
- **Field Agent 1 (Perundurai Route)**: `9876543214` (`murugan.agent@kumaranfinance.com`)
- **Field Agent 2 (Erode Route)**: `9876543215` (`karthik.agent@kumaranfinance.com`)
- **Statutory Auditor**: `9876543216` (`auditor@natarajanca.com`)

### 5.4 Executing the Seed
```powershell
cd apps\api
pnpm exec prisma db seed
```

### 5.5 Production Seeding Safety Guard
To prevent accidental corruption of real Perundurai subscriber records, [`apps/api/prisma/seed.ts`](file:///u:/Kumaran-finance/apps/api/prisma/seed.ts) features an **immutable safety guard** at the entry of `main()`:
```typescript
const targetUrl = process.env.DATABASE_URL || '';
const isProduction =
  process.env.NODE_ENV === 'production' ||
  targetUrl.toLowerCase().includes('prod') ||
  targetUrl.toLowerCase().includes('kumaran-prod');

if (isProduction) {
  console.error('❌ [Safety Guard] Refusing to run deterministic seed in PRODUCTION environment.');
  process.exit(1);
}
```
If `pnpm exec prisma db seed` is run against a live production database or with `NODE_ENV=production`, the process immediately halts with exit code 1.

---

## 6. Migration Reset & Disaster Recovery (Local Dev)

If the local database gets out of sync or test data needs to be wiped:
```powershell
cd apps\api

# WARNING: Drops the local database, re-applies all migrations, and runs seed.ts
pnpm exec prisma migrate reset
```
