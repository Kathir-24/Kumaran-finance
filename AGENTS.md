# AGENTS.md — Master Workspace Instructions for AI Coding Agents

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance** (Tamil Nadu, India)  
> **Target Audience**: All AI Agents, Coding Assistants, and Pair-Programmers  
> **Mandatory Rule**: Read this document first. **If any rule or requirement is ambiguous, STOP and ask the developer before executing code to avoid hallucination.**

---

## 1. Product & Operating Context

- **Platform**: **Kumaran Chits** — official chit-fund operations software built exclusively for **Kumaran Finance**.
- **Operating Reality**: 
  - Operating from **1 physical branch office** (Head Office - Perundurai, Erode, Tamil Nadu).
  - Managed by **4 equal partners** and **2 to 3 field collection agents**.
  - Current business records exist **exclusively in physical hand-written paper notebooks and physical receipts** (no soft copies/Excel in current business).
  - Software supports fresh new chits as well as mid-cycle onboarding from physical notebooks.
- **Tech Stack**:
  - **Monorepo & Package Manager**: `pnpm 12+` (Workspace Monorepo with `pnpm-workspace.yaml`)
  - **Backend**: NestJS 12 (TypeScript, Modular Monolith) in `apps/api/`
  - **Database**: PostgreSQL 17 + Prisma ORM (Port `5433` via Docker)
  - **Web Dashboard**: React / Next.js 15 (Admin, Accountant, Partners, Auditor) in `apps/web/`
  - **Mobile App**: Flutter + Dart (Android-first: 100% full feature parity for Partners/Super Admin + Field Agents & Customers) in `apps/mobile/`
  - **Shared Client SDK**: Typed Client API SDK in `packages/api-client/` (`@kumaran/api-client`) + Dart Models in `apps/mobile/lib/core/api/`
  - **Jobs & Queue**: Redis 7 + BullMQ (Background jobs only; PostgreSQL is the sole financial truth)
  - **Object Storage**: S3-Compatible Object Storage (Cloudflare R2, MinIO, or private S3 with 15-minute presigned URLs)
  - **Production Hosting**: Any Flat-Fee Linux VPS (Hostinger, DigitalOcean, Hetzner, Linode, Vultr, Contabo, or any Linux VPS provider at ~₹900–₹1,800/month flat) + Cloudflare R2 (₹0 egress bandwidth fees)

---

## 2. Core Protocol for AI Agents

Every agent starting any task in this codebase must strictly follow these 4 operational protocols:

1. **Search for PoC (Proof of Concept) First**:
   - Before authoring any new module, controller, or algorithm, search the repository for existing PoCs, schemas, and patterns to maintain consistency.
2. **Stop & Ask (Zero Hallucination Policy)**:
   - If a business rule, edge case, calculation formula, or statutory requirement is not 100% explicitly documented in `docs/`, **YOU MUST STOP AND ASK THE DEVELOPER** before writing or executing code.
3. **Small, Reviewable Increments**:
   - Work in small, guided steps (DTO $\to$ Service $\to$ Controller $\to$ Unit Tests). Never generate unverified multi-file code dumps.
4. **File Sizing & Modularity**:
   - Keep files focused and readable (ideally under 300–350 lines). If a service or controller begins to grow too large, propose separating it into modular sub-services or helper files and link them cleanly.

---

## 3. The 10 Invariant Architectural Guardrails (`CONFIRMED-BY-DEVELOPER`)

These 10 rules are mathematically and architecturally non-negotiable. Never violate them under any circumstances:

```mermaid
flowchart TD
    G1["1. Single Company\nZero company_id columns"] --- G2["2. Whole Rupee Math\nBigInt only; zero paise/floats"]
    G2 --- G3["3. Commission Freeze\n4.00% locked per group"]
    G3 --- G4["4. Universal Dividends\nInet = Ibase - Div (All members)"]
    G4 --- G5["5. Month 1 & N Rules\nNo auctions in Month 1 & N"]
    G5 --- G6["6. Fixed 1/4 Ceiling & Tie-Break\nMax discount = V/4; paper token draw"]
    G6 --- G7["7. Ticket Limit\nMax 1 ticket per customer in same group"]
    G7 --- G8["8. Defaulter & Payment Rules\nUnpaid = no bid; zero double payment/advance"]
    G8 --- G9["9. Company Safety Proof\nCheques/Agreements; property eliminated"]
    G9 --- G10["10. Maker != Checker\nStrict dual control on reversals/payouts"]
```

1. **Single-Company Tenancy (ADR-01)**: Built solely for Kumaran Finance. Zero `company_id` columns exist in any table.
2. **Pure Whole Rupee Math**: All monetary values are 64-bit integer Rupees (**`BigInt`** in Prisma, native **`bigint`** in TypeScript). Paise, decimal fractions (`.00`), and IEEE 754 floating-point numbers (`float`, `number`) are strictly prohibited in financial code.
3. **Commission Freeze (ADR-04)**: Foreman commission defaults to **4.00%**, copied and permanently frozen per chit group upon activation.
4. **Universal Equal Dividend Deduction**: Dividend is allocated **equally across ALL members in that chit group, INCLUDING the auction winner and past prized winners**. Every customer in the group pays the discounted net installment ($I_{net} = I_{base} - Div_{ticket}$) next month.
5. **Month 1 & Month $N$ Rules**: Month 1 full pool is taken by the company customer ticket (**no auction**, ₹0 dividend). Month $N$ is settled directly to the final subscriber with a 4% commission and receipt (**no auction**). Auctions occur exclusively in Months 2 through $N-1$.
6. **Fixed 1/4 Ceiling & Physical Tie-Break Protocol (ADR-06 & Option A)**: Auction discount ceiling is fixed strictly at **one-fourth (1/4 or 25%) of total chit value** ($D \le \frac{V}{4}$). If multiple members bid the ceiling, the Foreman draws paper tokens physically at the branch in front of members; staff enters the drawn winning ticket into the system. **No autonomous software lottery draws**.
7. **Ticket Limit Constraint (ADR-13)**: A customer can join multiple chit groups, but **cannot hold 2 or more tickets in the same chit group** (Database enforced: `@@unique([chitGroupId, customerId])`).
8. **Defaulter & Single Payment Rules (ADR-07)**: Any subscriber who has not paid their installment due for that month is **strictly ineligible to participate or bid** in that month's auction. 3 consecutive unpaid months grants the company removal rights. Each month has strictly a single discrete payment; **zero double payments**, **zero partial payments**, and **zero advance balances** exist. `DueStatus` is strictly `UNPAID`, `PAID`, `OVERDUE`.
9. **Company Safety Proof Checklist (ADR-15)**: Property documents are completely eliminated. Collateral/surety is **not mandatory** across the board and requested only on-demand for company safety. Software acts as a flexible checklist and attachment recordkeeper (signed agreement with winner & nominee, signed blank cheques, promissory notes, and scanned uploads).
10. **Maker-Checker Separation of Duties**: Critical actions (payment reversals, auction finalization, prize disbursements, cash handover) strictly enforce **`maker_user_id != checker_user_id`** at application and database levels, regardless of client device (Web-to-Web, Mobile-to-Mobile, or Cross-Device).
11. **Verified Partner Identity (ADR-21 / SEC-A)**: Not all Super Admins are partners. Administrative Super Admins (`isPartner: false`) possess IT capabilities (user onboarding, settings, viewing audit logs, and BullMQ queues) but are **strictly barred** from financial authorizations (reversals, auction finalization, prize payouts, defaulter removal). Only verified statutory business partners (`isPartner: true`) can act as Maker or Checker on financial mutations under Guardrail 10. Viewing audit logs and background queues is restricted strictly to Super Admin.

---

## 4. Task-to-Documentation Cross-Reference Matrix

Before starting any task, read the exact corresponding specification document in `docs/` to avoid hallucinations:

| Task / Domain Area | Primary Specification Document to Read |
|---|---|
| **Database Models & Prisma Schema** | [`docs/03-architecture/data-model.md`](docs/03-architecture/data-model.md) |
| **Database Concurrency, Pooling & Resilience** | [docs/03-architecture/database-concurrency-and-performance.md](docs/03-architecture/database-concurrency-and-performance.md) |
| **Financial Formulas & Chit Math** | [`docs/01-business/financial-rules.md`](docs/01-business/financial-rules.md) |
| **Architectural Decisions (ADR 01-25)** | [`docs/01-business/decision-log.md`](docs/01-business/decision-log.md) |
| **Personas, Roles & RBAC Matrix** | [`docs/01-business/permissions-matrix.md`](docs/01-business/permissions-matrix.md) |
| **Security & Anti-BOLA/IDOR Guardians** | [`docs/03-architecture/security-and-access-guardians.md`](docs/03-architecture/security-and-access-guardians.md) |
| **Functional Requirements (10 Modules)** | [`docs/02-requirements/prd.md`](docs/02-requirements/prd.md) |
| **User Stories & 6-Persona Journey Maps** | [`docs/02-requirements/user-stories-and-journeys.md`](docs/02-requirements/user-stories-and-journeys.md) |
| **API Endpoints, DTOs & HTTP Methods** | [`docs/03-architecture/api-spec.md`](docs/03-architecture/api-spec.md) |
| **API Resilience & High-Load Hardening** | [`docs/03-architecture/api-resilience-and-traffic-hardening.md`](docs/03-architecture/api-resilience-and-traffic-hardening.md) |
| **Horizontal Scaling & High Availability** | [`docs/03-architecture/horizontal-scaling-and-high-availability.md`](docs/03-architecture/horizontal-scaling-and-high-availability.md) |
| **Server & Infrastructure Resilience**    | [`docs/03-architecture/server-and-infrastructure-resilience.md`](docs/03-architecture/server-and-infrastructure-resilience.md) |
| **Frontend Architecture & Cross-Platform** | [`docs/03-architecture/frontend-architecture.md`](docs/03-architecture/frontend-architecture.md) |
| **Frontend Resilience & UI Hardening**     | [docs/03-architecture/frontend-architecture.md](docs/03-architecture/frontend-architecture.md#9-client-side-resilience--ui-performance-hardening-confirmed-by-developer) |
| **Client API SDK & Contract Generator** | [`docs/03-architecture/frontend-architecture.md`](docs/03-architecture/frontend-architecture.md) |
| **State Transitions & Lifecycle Guards** | [`docs/03-architecture/state-machines.md`](docs/03-architecture/state-machines.md) |
| **Non-Functional Standards (NFR)** | [`docs/02-requirements/non-functional-requirements.md`](docs/02-requirements/non-functional-requirements.md) |
| **Bilingual Receipts & Notification Templates**| [`docs/02-requirements/notification-and-receipt-templates.md`](docs/02-requirements/notification-and-receipt-templates.md) |
| **Database Migrations, BigInt & Seeding** | [`docs/04-engineering/database-migration-and-seeding-guide.md`](docs/04-engineering/database-migration-and-seeding-guide.md) |
| **Guided Coding Playbook & Prompt Templates**| [`docs/04-engineering/ai-agent-development-playbook.md`](docs/04-engineering/ai-agent-development-playbook.md) |
| **Definition of Done (10 Quality Gates)** | [`docs/04-engineering/definition-of-done.md`](docs/04-engineering/definition-of-done.md) |
| **Financial Invariants & Test Assertions** | [`docs/05-testing/financial-tests.md`](docs/05-testing/financial-tests.md) |
| **Payment Gateway Sandbox & Reconciliations**| [`docs/05-testing/payment-integration.md`](docs/05-testing/payment-integration.md) |
| **Physical Notebook Onboarding SOP** | [`docs/07-operations/manual-onboarding-sop.md`](docs/07-operations/manual-onboarding-sop.md) |
| **Troubleshooting & Diagnostics (N-Modes)**| [`docs/04-engineering/troubleshooting-guide.md`](docs/04-engineering/troubleshooting-guide.md) |
| **Redis Architecture & Distributed OTP** | [`docs/03-architecture/redis-architecture.md`](docs/03-architecture/redis-architecture.md) |
| **Caching Architecture & 5-Tier Strategy** | [`docs/03-architecture/caching-architecture.md`](docs/03-architecture/caching-architecture.md) |
| **BullMQ Jobs & Background Queues** | [`docs/03-architecture/bullmq-architecture.md`](docs/03-architecture/bullmq-architecture.md) |
| **Offline Sync & Resilience Architecture** | [`docs/03-architecture/offline-architecture.md`](docs/03-architecture/offline-architecture.md) |
| **Push Notification & Mobile Alerts** | [`docs/03-architecture/push-notification-architecture.md`](docs/03-architecture/push-notification-architecture.md) |
| **SMS Architecture & Indian Telecom DLT** | [`docs/03-architecture/sms-architecture.md`](docs/03-architecture/sms-architecture.md) |
| **Third-Party Integrations & Resilience** | [docs/03-architecture/third-party-integrations-and-resilience.md](docs/03-architecture/third-party-integrations-and-resilience.md) |
| **Payment, Collections & Dual-Control Architecture** | [`docs/03-architecture/payment-architecture.md`](docs/03-architecture/payment-architecture.md) |
| **Rate Limiting, Throttling & Abuse Prevention** | [`docs/03-architecture/rate-limiting-and-abuse-prevention.md`](docs/03-architecture/rate-limiting-and-abuse-prevention.md) |
| **Document, Upload & Storage Architecture** | [`docs/03-architecture/document-and-storage-architecture.md`](docs/03-architecture/document-and-storage-architecture.md) |
| **Observability, Monitoring & Audit Architecture** | [`docs/03-architecture/observability-and-monitoring-architecture.md`](docs/03-architecture/observability-and-monitoring-architecture.md) |
| **Prometheus Metrics & APM Telemetry**    | [`apps/api/src/metrics/README.md`](apps/api/src/metrics/README.md) |
| **Daily Operations, Cash Handover & Reversals**| [`docs/07-operations/operations-sop.md`](docs/07-operations/operations-sop.md) |
| **Production Deployment & Rollback Guide**| [`docs/07-operations/PRODUCTION-DEPLOYMENT-GUIDE.md`](docs/07-operations/PRODUCTION-DEPLOYMENT-GUIDE.md) |
| **User Manuals Suite Index**              | [`docs/07-operations/user-manuals/README.md`](docs/07-operations/user-manuals/README.md) |
| **Web Admin & Partner Operations**       | [`docs/07-operations/user-manuals/admin-foreman-manual.md`](docs/07-operations/user-manuals/admin-foreman-manual.md) |
| **Desk Accountant & Cashier Operations**   | [`docs/07-operations/user-manuals/accountant-desk-manual.md`](docs/07-operations/user-manuals/accountant-desk-manual.md) |
| **Field Agent Android Mobile App**        | [`docs/07-operations/user-manuals/agent-mobile-manual.md`](docs/07-operations/user-manuals/agent-mobile-manual.md) |
| **Customer Android Mobile App**           | [`docs/07-operations/user-manuals/customer-app-guide.md`](docs/07-operations/user-manuals/customer-app-guide.md) |
| **Branch Manager Operations**             | [`docs/07-operations/user-manuals/branch-manager-manual.md`](docs/07-operations/user-manuals/branch-manager-manual.md) |
| **Independent CA Auditor Portal**         | [`docs/07-operations/user-manuals/auditor-portal-manual.md`](docs/07-operations/user-manuals/auditor-portal-manual.md) |

---

## 5. Verification Before Submitting Work

Before claiming any task is complete, verify:
- [ ] Stored currency amounts use `BigInt` (not `number` or float).
- [ ] Maker $\ne$ Checker constraint is enforced on sensitive endpoints.
- [ ] Partner identity (`isPartner: true`) is enforced on financial endpoints; audit logs and BullMQ telemetry are restricted strictly to Super Admin.
- [ ] No unverified business or statutory rules were assumed without confirmation.
- [ ] Automated tests verify calculation invariants with 100% pass rate.
- [ ] Code is formatted and compiles cleanly without lint errors.
- [ ] Storage uploads use direct presigned PUT URLs, 120s cellular timeouts, client compression, and async BullMQ pre-rendering.
- [ ] Authentication uses fast-path Redis status caching (120s TTL) and client-scoped session families without cross-device refresh invalidation.
- [ ] Financial write paths enforce row-level locking (`SELECT FOR UPDATE`), deterministic lock sorting, and automated retry on transient deadlocks (`withTransactionRetry`).
- [ ] Heavy aggregate reports and batch background crons enforce safe distributed locking (`DistributedLockService`) with unique tokens and atomic Lua releases.
- [ ] Production hosting targets any flat-fee Linux VPS (Hostinger, DigitalOcean, Hetzner, Linode, Vultr, etc.) + Cloudflare R2 with zero vendor lock-in.
