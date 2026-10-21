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
| `20261021142000_add_fcm_token_to_user_and_customer` | 2026-10-21 | Added nullable `fcmToken` column to both `User` and `Customer` tables for Firebase Cloud Messaging push dispatch. | **Applied & Verified** (`261/261` automated tests passing) |

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

## 5. Database Seeding Runbook (`prisma/seed.ts`)

Seeding guarantees that every developer and test environment starts with the required foundational records:

### 5.1 Seeding Script Structure (`apps/api/prisma/seed.ts`)
```typescript
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Kumaran Chits database seed...');

  // 1. Seed Single Physical Branch (Head Office - Perundurai, Erode)
  const branch = await prisma.branch.upsert({
    where: { code: 'PRD' },
    update: {},
    create: {
      code: 'PRD',
      name: 'Head Office - Perundurai',
      nameTamil: 'தலைமை கிளை - பெருந்துறை',
      address: 'Main Road, Perundurai, Erode, Tamil Nadu',
      phone: '+91 98765 43210',
      isActive: true,
    },
  });
  console.log(`✅ Branch seeded: ${branch.name} (${branch.code})`);

  // 2. Seed Initial Super Admin User (Partner Account)
  const saltRounds = 12;
  const passwordHash = await bcrypt.hash('Admin@Kumaran2026', saltRounds);

  const admin = await prisma.user.upsert({
    where: { phone: '9876543210' },
    update: {},
    create: {
      branchId: branch.id,
      name: 'Kumaran Partner Admin',
      phone: '9876543210',
      email: 'admin@kumaranfinance.com',
      passwordHash,
      roles: [Role.SUPER_ADMIN],
      isActive: true,
    },
  });
  console.log(`✅ Super Admin seeded: ${admin.name} (${admin.phone})`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

### 5.2 Configuring `package.json` for Seeding
Add the `prisma.seed` configuration to `apps/api/package.json`:
```json
"prisma": {
  "seed": "ts-node prisma/seed.ts"
}
```

### 5.3 Executing the Seed
```powershell
cd apps\api
pnpm exec prisma db seed
```

---

## 6. Migration Reset & Disaster Recovery (Local Dev)

If the local database gets out of sync or test data needs to be wiped:
```powershell
cd apps\api

# WARNING: Drops the local database, re-applies all migrations, and runs seed.ts
pnpm exec prisma migrate reset
```
