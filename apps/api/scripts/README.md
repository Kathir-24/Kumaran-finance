# Kumaran Chits — API Scripts & Operations Suite

> **Product**: **Kumaran Chits** (Kumaran Finance, Perundurai, Tamil Nadu)  
> **Location**: `apps/api/scripts/`  
> **Compliance Reference**: [`docs/06-devops/infrastructure-and-drp.md`](../../../docs/06-devops/infrastructure-and-drp.md) (§3.1, §3.3)

---

## 1. Directory Structure & Domain Architecture

The API scripts suite is organized into 5 domain-specific subdirectories:

```
apps/api/scripts/
├── ops/         # Production Database Operations, S3 Backups, DRP Drills & Test Seeder
├── codegen/     # Contract Generators & OpenAPI Specification Exporters
├── audit/       # AST Persona Enforcement & Route Collision Security Tools
├── lifecycle/   # Live Server End-to-End User Journey Verification Suites (Lifecycles 1 - 11)
├── stress/      # Concurrency Stress Tests, 20-Month Financial Simulation & Adversarial Harnesses
└── docs/        # Live Execution Proof Reports & Detailed Audit Methodology
```

---

## 2. Production Operations & DRP (`ops/`)

| Script | Purpose | Execution Command | Storage / Target |
|---|---|---|---|
| [`ops/drp-drill.ts`](ops/drp-drill.ts) | **Automated Disaster Recovery (DRP) Drill Engine**<br>Simulates full disaster restore in an isolated sandbox and asserts 5 financial invariants. | `pnpm db:drp:drill` | `backups/db/YYYY/MM/*.dump` |
| [`ops/backup-to-s3.ts`](ops/backup-to-s3.ts) | **Off-Site Database Backup & Retention Pruner**<br>Dumps PostgreSQL 17 in binary format (`pg_dump -F c`) and prunes dumps > 30 days. | `pnpm db:backup:s3` | `backups/db/YYYY/MM/*.dump` |
| [`ops/restore-from-s3.ts`](ops/restore-from-s3.ts) | **S3 Snapshot Restore & Listing CLI**<br>Lists S3 snapshots and executes `pg_restore --clean --if-exists`. | `pnpm db:restore:s3`<br>`pnpm db:backups:list` | Reads from `backups/db/` |
| [`ops/seed-test-db.ts`](ops/seed-test-db.ts) | **Automated Test Database Seeder with Safety Guard**<br>Resets the isolated `chitflow_test` database with 28 unpaid dues and guards against non-test execution. | `pnpm --filter api test:db:seed`<br>`pnpm --filter api test:e2e:fresh` | Isolated `chitflow_test` (Port 5433) |

---

## 3. Specification & Contract Codegen (`codegen/`)

| Script | Purpose | Execution Command | Output Artifact |
|---|---|---|---|
| [`codegen/export-openapi.ts`](codegen/export-openapi.ts) | **OpenAPI Spec Generator**<br>Exports current NestJS Swagger definitions to JSON. | `pnpm --filter api run openapi:export`<br>`pnpm codegen:spec` | [`docs/03-architecture/openapi-spec.json`](../../../docs/03-architecture/openapi-spec.json) |

---

## 4. Security & AST Audit Utilities (`audit/`)

| Script | Purpose | Execution Command | Output Artifact |
|---|---|---|---|
| [`audit/audit-persona-enforcement.ts`](audit/audit-persona-enforcement.ts) | **Automated AST Persona Enforcement Audit Tool**<br>Parses all 18 NestJS controllers using TypeScript Compiler API; audits 111 operations and verifies 600 persona decisions. Detailed guide: [`docs/audit-persona-enforcement.md`](docs/audit-persona-enforcement.md). | `pnpm --filter api exec ts-node scripts/audit/audit-persona-enforcement.ts` | `scripts/audit/endpoint-audit-report.json` |
| [`audit/audit-route-shadowing.ts`](audit/audit-route-shadowing.ts) | **Route Shadowing & Parameter Collision Checker**<br>Validates that parameterized routes do not shadow static routes. | `pnpm --filter api exec ts-node scripts/audit/audit-route-shadowing.ts` | Console Report |
| [`audit/print-detailed-audit.ts`](audit/print-detailed-audit.ts) | **Audit Report Console Visualizer**<br>Renders structured console output from `endpoint-audit-report.json`. | `pnpm --filter api exec ts-node scripts/audit/print-detailed-audit.ts` | Terminal Output |

---

## 5. Live Server Lifecycle Verification Suite (`lifecycle/`)

A collection of 11 live-server end-to-end verification runners designed to execute full user journeys against a running NestJS instance and verify responses, invariant calculations, and audit logs:

| Runner Script | Lifecycle Focus | Verification Scope | Status |
|---|---|---|:---:|
| [`lifecycle/verify-lifecycle-1.ts`](lifecycle/verify-lifecycle-1.ts) | Lifecycle 1: Auth, Branches & Users | Web login, TOTP 2FA, Redis SMS OTP (300s TTL, 3-attempt lockout, anti-replay purge), MPIN, Branch CRUD, Staff User administration (24 steps) | ✅ **Passed** |
| [`lifecycle/verify-lifecycle-2.ts`](lifecycle/verify-lifecycle-2.ts) | Lifecycle 2: Customer Intake & KYC | Lightweight intake, masked Aadhaar (`XXXXXXXX1234`), Nominees, S3 KYC scans, 15-min presigned URLs (11 steps) | ✅ **Passed** |
| [`lifecycle/verify-lifecycle-3.ts`](lifecycle/verify-lifecycle-3.ts) | Lifecycle 3: Chit Scheme Lifecycle | Scheme creation, 4% commission lock, ADR-13 ticket limit constraint, Month 1 pool, mid-cycle intake (9 steps) | ✅ **Passed** |
| [`lifecycle/verify-lifecycle-4.ts`](lifecycle/verify-lifecycle-4.ts) | Lifecycle 4: In-Office Auctions | Offline bidding, 1/4 ceiling guard, Option A physical token tie-break, Maker $\ne$ Checker (8 steps) | ✅ **Passed** |
| [`lifecycle/verify-lifecycle-5.ts`](lifecycle/verify-lifecycle-5.ts) | Lifecycle 5: Installments & Passbook | Universal dividends ($I_{net} = I_{base} - Div$), 6-col passbook ledger, 3M arrears removal guard (9 steps) | ✅ **Passed** |
| [`lifecycle/verify-lifecycle-6.ts`](lifecycle/verify-lifecycle-6.ts) | Lifecycle 6: Doorstep Collections | Doorstep collection (exact $I_{net}$ matching), BullMQ receipt queueing, offline batch sync, dual-control cash handover (6 steps) | ✅ **Passed** |
| [`lifecycle/verify-lifecycle-7.ts`](lifecycle/verify-lifecycle-7.ts) | Lifecycle 7: Cash Handover & Reversals | Counter payments (CASH & UPI), collection queries & filters, deep lookup & OWASP BOLA defense, bilingual text receipt, ISO A5 PDF & S3 presigned URLs, Maker $\ne$ Checker reversal rejection & approval (8 steps) | ✅ **Passed** |
| [`lifecycle/verify-lifecycle-8.ts`](lifecycle/verify-lifecycle-8.ts) | Lifecycle 8: Prize Disbursements | Safety proof checklist, S3 presigned inspection, Maker-Checker authorization, Month N maturity payout (8 steps) | ✅ **Passed** |
| [`lifecycle/verify-lifecycle-9.ts`](lifecycle/verify-lifecycle-9.ts) | Lifecycle 9: Statutory Registers | Form XXII Cash Book equation ($Closing = Opening + In - Out$), Form XVII Minutes, Form XXI Passbook, SSE stream (9 steps) | ✅ **Passed** |
| [`lifecycle/verify-lifecycle-10.ts`](lifecycle/verify-lifecycle-10.ts) | Lifecycle 10: Storage & PDF Canvas | Bilingual PDFKit A5 digital receipt, prize voucher, Form XVII, Form XXI, anti-traversal security defense (5 steps) | ✅ **Passed** |
| [`lifecycle/verify-lifecycle-11.ts`](lifecycle/verify-lifecycle-11.ts) | Lifecycle 11: Background Jobs & Ops | Midnight arrears scan, 3M tagging, BullMQ queue status, DLT SMS/Push audit logs, Prometheus metrics & Bull Board (15 steps) | ✅ **Passed** |

Execution proof reports and the master verification plan are archived in [`docs/`](docs/).

---

## 6. Stress, Simulation & Adversarial Verification (`stress/`)

| Runner Script | Focus | Scope |
|---|---|---|
| [`stress/verify-concurrency-stress.ts`](stress/verify-concurrency-stress.ts) | Pessimistic Lock Concurrency | 10 parallel payment workers targeting single due. Asserts 1 success, 9 rejections, zero duplicate allocation. |
| [`stress/verify-full-20month-simulation.ts`](stress/verify-full-20month-simulation.ts) | Full 20-Month Lifecycle Simulation | Simulates full 20-month chit cycle across 20 members: 400 dues, 400 collections, 20 auctions, 5 Grand Invariants. |
| [`stress/verify-financial-adversarial-challenger.ts`](stress/verify-financial-adversarial-challenger.ts) | Adversarial Financial Rules | 31 mathematical edge-case assertions testing whole-rupee math, 25% ceiling, Month 1 & N invariants. |
| [`stress/verify-docker-nginx.ts`](stress/verify-docker-nginx.ts) | Ingress & Nginx Gateway | Validates reverse-proxy headers, SSL headers, rate limiting, and timeout behaviors. |
| [`stress/verify-client-sdk.ts`](stress/verify-client-sdk.ts) | Client API SDK Contract | Verifies `@kumaran/api-client` live operation calls against NestJS API endpoints. |
| [`stress/verify-m1-m2-comprehensive.ts`](stress/verify-m1-m2-comprehensive.ts) | Milestones 1 & 2 Sweep | Multi-role identity, branch partitioning, customer KYC, and schema creation sweep. |
| [`stress/verify-m3-m4-exhaustive.ts`](stress/verify-m3-m4-exhaustive.ts) | Milestones 3 & 4 Sweep | Auction engine, physical tie-breaking, bid submission, and receipt generation sweep. |
| [`stress/verify-milestone-5-comprehensive.ts`](stress/verify-milestone-5-comprehensive.ts) | Milestone 5 Sweep | Cash handover, collection sync, and dual-control reversal workflows. |
| [`stress/verify-negative-input-matrix.ts`](stress/verify-negative-input-matrix.ts) | Negative Fuzzing Matrix | Submits malformed payloads, out-of-range dates, and invalid phone numbers to assert HTTP 400. |
| [`stress/verify-optional-fields-matrix.ts`](stress/verify-optional-fields-matrix.ts) | Optional Field Coverage | Verifies payloads with omitted optional fields generate clean defaults without 500 errors. |
| [`stress/verify-upi-intent-and-claims.ts`](stress/verify-upi-intent-and-claims.ts) | UPI Intent & Claim Desk | Verifies dynamic UPI string generation, QR generation, customer claim submission, and maker-checker approval. |
