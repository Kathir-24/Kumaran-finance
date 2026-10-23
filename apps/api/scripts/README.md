# Kumaran Chits — Database Automation & DRP Drill Scripts

> **Product**: **Kumaran Chits** (Kumaran Finance, Perundurai, Tamil Nadu)  
> **Location**: `apps/api/scripts/`  
> **Compliance Reference**: [`docs/06-devops/infrastructure-and-drp.md`](../../../docs/06-devops/infrastructure-and-drp.md) (§3.1, §3.3)

---

## 1. Overview of Automation Scripts

| Script | Purpose | Execution Command | S3 Storage Path |
|---|---|---|---|
| [`drp-drill.ts`](drp-drill.ts) | **Automated Disaster Recovery (DRP) Drill Engine**<br>Simulates full disaster restore in an isolated sandbox and asserts 5 financial invariants. | `pnpm db:drp:drill` | `backups/db/YYYY/MM/*.dump` |
| [`backup-to-s3.ts`](backup-to-s3.ts) | **Off-Site Database Backup & Retention Pruner**<br>Dumps PostgreSQL 17 in binary format (`pg_dump -F c`) and prunes dumps > 30 days. | `pnpm db:backup:s3` | `backups/db/YYYY/MM/*.dump` |
| [`restore-from-s3.ts`](restore-from-s3.ts) | **S3 Snapshot Restore & Listing CLI**<br>Lists S3 snapshots and executes `pg_restore --clean --if-exists`. | `pnpm db:restore:s3`<br>`pnpm db:backups:list` | Reads from `backups/db/` |
| [`export-openapi.ts`](export-openapi.ts) | **OpenAPI Spec Generator**<br>Exports current NestJS Swagger definitions to JSON. | `pnpm --filter api run openapi:export` | `docs/03-architecture/openapi-spec.json` |
| [`seed-test-db.ts`](seed-test-db.ts) | **Automated Test Database Seeder with Safety Guard**<br>Resets the isolated `chitflow_test` database with 28 unpaid dues and guards against non-test execution. | `pnpm --filter api test:db:seed`<br>`pnpm --filter api test:e2e:fresh` | Isolated `chitflow_test` (Port 5433) |

---

## 2. Automated Disaster Recovery (DRP) Drill (`drp-drill.ts`)

### Why This Exists:
In financial platforms handling subscriber funds, taking backups is only half the battle. **An unverified backup is no backup at all.** 

`drp-drill.ts` automates the **Quarterly Disaster Recovery Drill** specified in [`docs/06-devops/infrastructure-and-drp.md`](../../../docs/06-devops/infrastructure-and-drp.md) §3.3 without destroying or interrupting the developer's working database.

### Drill Lifecycle:

```mermaid
flowchart TD
    PreFlight["1. Pre-Flight Check\nQuery baseline entity counts on chitflow_dev"] --> RPO["2. RPO Phase\nExecute pg_dump -F c & stream to S3/MinIO"]
    RPO --> Isolation["3. Isolation Phase\nCREATE DATABASE chitflow_drp_drill"]
    Isolation --> RTO["4. RTO Benchmark\nDownload S3 dump & pg_restore (Stopwatch timing)"]
    RTO --> Assertions["5. Financial Invariants Suite\nRun 5 mathematical & architectural integrity checks"]
    Assertions --> Teardown["6. Clean Teardown\nDROP DATABASE chitflow_drp_drill & delete temp files"]
    Teardown --> Report["7. Audit Compliance Report\nOutputs formatted pass/fail summary"]
```

---

### The 5 Invariant Assertions Tested by the Drill:

1. **Entity Row Parity**:
   - Asserts that every single record in `chitflow_dev` was successfully restored into `chitflow_drp_drill` across all 6 core entity sets: Users, Customers, ChitGroups, SubscriberTickets, InstallmentDues, and Payments.
2. **Foreman Commission Freeze (ADR-04)**:
   - Queries `chit_groups` and asserts that `foremanCommissionRate` equals **`4.00%`** across all schemes.
3. **Ticket Limit Constraint (ADR-13)**:
   - Asserts that zero customers hold 2 or more tickets in the same chit group (`@@unique([chitGroupId, customerId])`).
4. **Pure Whole-Rupee Math Integrity (ADR-02)**:
   - Asserts that all monetary amounts are non-negative, non-null, and conform to 64-bit integer Rupees (`BigInt`). Zero floating-point decimals or fractional paise exist.
5. **Accounting Balance Equation (DRP §3.3)**:
   - Mathematically verifies that:
     $$\sum \text{Dues Generated} = \sum \text{Paid Dues} + \sum \text{Outstanding Unpaid Dues}$$

---

### How to Run:

```powershell
# From the repository root via pnpm:
pnpm run db:drp:drill

# Or via the cross-platform PowerShell runner:
powershell -ExecutionPolicy Bypass -File infra/scripts/drp-drill.ps1

# Or via Bash runner (Linux / macOS / CI):
bash infra/scripts/drp-drill.sh
```

### Sample Audit Report Output:

```text
======================================================
📋 DISASTER RECOVERY DRILL AUDIT REPORT
======================================================
   RPO Snapshot Key:    backups/db/2026/10/kumaran_chits_backup_20261020_173719.dump
   Snapshot Size:       46534 bytes
   RTO Restore Time:    0.80 seconds (Target: < 7200s)
   Overall Status:      ✅ PASSED (100% COMPLIANT)
------------------------------------------------------
   ✅ Assertion 1: Entity Row Parity
      All 6 entity sets match (Users: 1, Customers: 1, ChitGroups: 1, Tickets: 1, Dues: 0, Payments: 0)
   ✅ Assertion 2: Foreman Commission Freeze (ADR-04)
      Verified 1 chit groups locked at 4.00% commission
   ✅ Assertion 3: Ticket Limit Constraint (ADR-13)
      Enforced: 0 duplicate subscriber assignments across 1 tickets
   ✅ Assertion 4: Pure Whole-Rupee Math (ADR-02)
      All stored financial records conform to 64-bit integer Rupees
   ✅ Assertion 5: Accounting Balance Invariant (DRP §3.3)
      Balance verified: ₹0 = ₹0 (Paid) + ₹0 (Outstanding)
======================================================
```

---

## 3. Automated S3 Database Backup (`backup-to-s3.ts`)

- **Schedule**: Every midnight at 02:00 AM IST via OS cron / Task Scheduler.
- **Encryption**: Uses `AES256` server-side encryption when uploading to AWS S3. Local MinIO runs standard mode.
- **Retention Pruning**: Scans `backups/db/` and auto-deletes snapshots older than **30 days** per DRP §3.2.
- **Execution**: `pnpm run db:backup:s3`

---

## 4. S3 Snapshot Restore CLI (`restore-from-s3.ts`)

- **List Backups**:
  ```powershell
  pnpm run db:backups:list
  ```
- **Restore Latest Backup**:
  ```powershell
  pnpm run db:restore:s3
  ```
- **Restore a Specific Backup Key**:
  ```powershell
  pnpm --filter api exec ts-node scripts/restore-from-s3.ts "backups/db/2026/10/kumaran_chits_backup_20261020_173719.dump"
  ```

---

## 5. Automated Test Database Seeder (`seed-test-db.ts`)

### Why This Exists:
Under repeated automated E2E test runs, test suites transition `UNPAID` installment dues to `PAID`. Without an automated reset mechanism, consecutive test executions deplete the pool of unpaid dues, causing downstream payment and business-rule tests to fail.

`seed-test-db.ts` provides a deterministic, cross-platform mechanism to re-establish the baseline seed state in ~3.5 seconds.

### Safety Guardrail:
- **Database Name Verification**: Inspects the connection URL and strictly refuses execution if the database name does not contain `"test"` (e.g., `chitflow_test`).
- **Credential Masking**: Automatically masks database passwords in console output (`:****@`).
- **Target Isolation**: Defaults to `postgresql://chitflow:chitflow_dev_only@127.0.0.1:5433/chitflow_test?schema=public`.

### Commands:
- **Standalone Test Database Seed**:
  ```powershell
  pnpm --filter api test:db:seed
  ```
- **Fresh E2E Test Execution (Seed + Run All 10 Suites)**:
  ```powershell
  pnpm --filter api test:e2e:fresh
  ```

---

## 6. Live Server Lifecycle Verification Suite (`verify-lifecycle-1.ts` to `verify-lifecycle-11.ts`)

A collection of 11 live-server end-to-end verification runners designed to execute full end-to-end user journeys against a running NestJS instance and verify responses, invariant calculations, and audit logs:

| Runner Script | Lifecycle Focus | Verification Scope |
|---|---|---|
| [`verify-lifecycle-1.ts`](verify-lifecycle-1.ts) | Lifecycle 1: Auth & Security | Phone login, TOTP 2FA, MPIN, Biometrics, token revocation |
| [`verify-lifecycle-2.ts`](verify-lifecycle-2.ts) | Lifecycle 2: Customer Intake & KYC | Lightweight intake, masked Aadhaar, KYC presigned uploads |
| [`verify-lifecycle-3.ts`](verify-lifecycle-3.ts) | Lifecycle 3: Chit Scheme Lifecycle | Scheme creation, activation, Month 1 pool, ongoing onboarding |
| [`verify-lifecycle-4.ts`](verify-lifecycle-4.ts) | Lifecycle 4: In-Office Auctions | Offline bidding, 1/4 ceiling, Option A tie-break draw, Maker $\ne$ Checker |
| [`verify-lifecycle-5.ts`](verify-lifecycle-5.ts) | Lifecycle 5: Installments & Passbook | Universal dividends, cycle start/end dates, 6-col passbook ledger |
| [`verify-lifecycle-6.ts`](verify-lifecycle-6.ts) | Lifecycle 6: Doorstep Collections | Doorstep collection, offline sync, bilingual 80mm PDF receipt |
| [`verify-lifecycle-7.ts`](verify-lifecycle-7.ts) | Lifecycle 7: Cash Handover & Reversals | Vault cash handover, Maker $\ne$ Checker payment reversals |
| [`verify-lifecycle-8.ts`](verify-lifecycle-8.ts) | Lifecycle 8: Prize Disbursements | Safety proof checklist, A5 voucher, Month N maturity payout |
| [`verify-lifecycle-9.ts`](verify-lifecycle-9.ts) | Lifecycle 9: Statutory Registers | Form XXII Cash Book, Form XXI Passbook, Form XVII Minutes |
| [`verify-lifecycle-10.ts`](verify-lifecycle-10.ts) | Lifecycle 10: Storage & PDF Canvas | Presigned URLs, S3 KMS encryption, bilingual font rendering |
| [`verify-lifecycle-11.ts`](verify-lifecycle-11.ts) | Lifecycle 11: Background Jobs & Ops | 00:01 AM arrears, 3M default tagging, DLT SMS/Push, Bull Board |

Execution proof reports and the master verification plan are archived in [`scripts/docs/`](docs/).


