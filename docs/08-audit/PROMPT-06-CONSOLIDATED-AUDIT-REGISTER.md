# PROMPT 06 — CONSOLIDATED SIX-STAGE AUDIT REGISTER & REMEDIATION ROADMAP
## Kumaran Chits — Master Findings Register Across Prompts 01 Through 06

> **Audit Stage**: Stage 06 (Infrastructure, DevOps, Disaster Recovery & Production Readiness)  
> **Company**: **Kumaran Finance** (Head Office: Perundurai, Erode, Tamil Nadu)  
> **Status**: COMPLETED — READ-ONLY CONSOLIDATION  
> **Date**: November 2026  
> **Scope**: Cross-reconciliation of all findings across Prompt 01 (Discovery), Prompt 02 (Financial Math), Prompt 03 (Security & RBAC), Prompt 04 (Database & Concurrency), Prompt 05 (Frontend & UX), and Prompt 06 (Infrastructure & DevOps).

---

## 1. Consolidated Six-Stage Findings Register

The following register aggregates and reconciles every distinct finding across the six audit stages without erasing historical findings:

| Finding ID | Origin Stage | Domain | Title & Description | Severity | Confidence | Current Status | Remediation Priority |
|---|---|---|---|:---:|:---:|---|:---:|
| **OPS-01** | Prompt 06 | Infrastructure | **Redis Eviction Policy Incompatibility with BullMQ**: Compose configures `--maxmemory-policy volatile-lru`. BullMQ officially requires `noeviction` to prevent silent key evictions during memory spikes. | **HIGH** | HIGH | UNRESOLVED | **P0** |
| **FIN-01 / DB-001** | Prompt 02 / 04 | Financial / DB | **Prize Payout Override Ceiling Validation Gap**: `AuthorizePayoutDto` accepts arbitrary `disbursedAmount` without asserting `disbursedAmount <= prizeMoney`. Client UI is safe, but backend API requires strict validation. | **HIGH** | HIGH | UNRESOLVED | **P0** |
| **FIN-03 / DB-002** | Prompt 02 / 04 | Financial / DB | **Server-Side PDF Stream Missing Cancellation Watermark**: Web HTML preview renders diagonal "CANCELLED" watermark, but backend PDF generation stream produces unwatermarked PDFs for reversed receipts. | **MEDIUM** | HIGH | UNRESOLVED | **P1** |
| **ARC-02** | Prompt 01 / 05 | Mobile | **Native Android Flutter UI Not Implemented**: `apps/mobile/` contains Dart API models and SQLite offline sync queues, but lacks Flutter widget UI and APK build pipeline. | **HIGH** | HIGH | WORKAROUND ACTIVE (Responsive Web) | **P1** |
| **OPS-02** | Prompt 06 | CI/CD | **Playwright Browser E2E Tests Omitted from CI Pipeline**: GitHub Actions runs Vitest unit tests, but does not execute Playwright browser tests across viewports and locales. | **MEDIUM** | HIGH | UNRESOLVED | **P1** |
| **DB-001** | Prompt 04 | Database | **Missing PostgreSQL Monetary CHECK Constraints**: BigInt columns in Postgres schema lack explicit `CHECK (amount >= 0)` constraints at the DDL layer; guarded only by application decorators. | **MEDIUM** | HIGH | UNRESOLVED | **P2** |
| **DB-002** | Prompt 04 | Database | **Receipt Model Lacks Explicit Status Column**: Reversals track status on `Payment` model; `Receipt` model lacks explicit `status` enum (`VALID` / `CANCELLED`). | **LOW** | HIGH | COMPENSATED (Derived from Payment) | **P2** |
| **SEC-01** | Prompt 03 | Security | **Bull Board Default Password in Dev**: Falls back to `chitflow_secret` in development; successfully guarded by fail-fast startup validator in production. | **LOW** | HIGH | RESOLVED FOR PROD | **P2** |
| **SEC-02** | Prompt 03 | Security | **Prometheus Metrics Default Password in Dev**: Falls back to `chitflow_secret` in development; successfully guarded by fail-fast startup validator in production. | **LOW** | HIGH | RESOLVED FOR PROD | **P2** |
| **UI-01** | Prompt 05 | Frontend / QA | **Playwright Logout E2E Test Timeout**: `01-auth-lifecycle.e2e.spec.ts` test 4 timed out at 15s waiting for redirect due to tight timeout on consecutive test logins. | **LOW** | HIGH | UNRESOLVED (Test Flake) | **P3** |
| **OPS-03** | Prompt 06 | CI/CD | **Automated Remote VPS Deployment Trigger Missing**: CI publishes container images to GHCR, but deployment to Linux VPS requires manual execution of `zero-downtime-deploy.sh`. | **LOW** | MEDIUM | DOCUMENTED RUNBOOK | **P3** |
| **ARC-01** | Prompt 01 | Architecture | **Single-Company Tenancy (Zero `company_id` columns)**: Architected exclusively for Kumaran Finance. Multi-company expansion would require architectural schema changes. | **INFORMATIONAL** | HIGH | INTENDED BY DESIGN (ADR-01) | **P3** |

---

## 2. Detailed Technical Remediation Roadmap

The following prioritized roadmap defines the work required in the upcoming remediation phase:

### P0 — Critical Production Blockers (Must Fix Immediately)

#### Item P0-1: Change Redis Eviction Policy to `noeviction`
- **Finding ID**: `OPS-01`
- **Source Files**: [`infra/docker/docker-compose.fullstack.yml#L51`](file:///u:/Kumaran-finance/infra/docker/docker-compose.fullstack.yml#L51)
- **Problem**: Under `--maxmemory-policy volatile-lru`, memory pressure will cause Redis to silently evict BullMQ metadata keys and active lock tokens.
- **Remediation**:
  Replace `--maxmemory-policy volatile-lru` with `--maxmemory-policy noeviction`.
- **Specialist Role**: DevOps / Redis SRE
- **Acceptance Criteria**: Running `pnpm --filter api test -- test/unit/queue-resilience.spec.ts` emits zero eviction policy warnings.
- **Implementation Complexity**: LOW (1 line change).

#### Item P0-2: Add Backend Assertion for Prize Payout Override Ceiling
- **Finding ID**: `FIN-01 / DB-001`
- **Source Files**: [`apps/api/src/disbursements/disbursements.service.ts`](file:///u:/Kumaran-finance/apps/api/src/disbursements/disbursements.service.ts), `apps/api/src/disbursements/dto/authorize-payout.dto.ts`
- **Problem**: Backend allows `dto.disbursedAmount` without asserting `disbursedAmount <= auction.netPrizeAmount`.
- **Remediation**:
  In `disbursements.service.ts`, add strict check:
  ```typescript
  if (dto.disbursedAmount && dto.disbursedAmount > auction.netPrizeAmount) {
    throw new BadRequestException('Disbursed amount cannot exceed net auction prize money');
  }
  ```
- **Specialist Role**: Backend Financial Engineer
- **Acceptance Criteria**: Unit test verifies that submitting ₹3,80,000 for a ₹3,75,000 prize throws `BadRequestException`.
- **Implementation Complexity**: LOW.

---

### P1 — High-Priority Financial & Security Fixes

#### Item P1-1: Add "CANCELLED" Watermark to Server-Side PDF Stream
- **Finding ID**: `FIN-03 / DB-002`
- **Source Files**: [`apps/api/src/payments/pdf.service.ts`](file:///u:/Kumaran-finance/apps/api/src/payments/pdf.service.ts)
- **Problem**: Exporting a PDF of a reversed transaction produces an unwatermarked voucher.
- **Remediation**:
  If `payment.status === 'REVERSED'` or `isReversed`, overlay a 45-degree diagonal red watermark `"CANCELLED / REVERSED — பரிவர்த்தனை ரத்து செய்யப்பட்டுள்ளது"` across the PDF page.
- **Specialist Role**: Backend / PDF Specialist
- **Acceptance Criteria**: Test verifies that PDF buffer of reversed payment contains red cancelled stamp.
- **Implementation Complexity**: MEDIUM.

#### Item P1-2: Author Flutter Android UI Screens for Field Agents
- **Finding ID**: `ARC-02`
- **Source Files**: `apps/mobile/lib/screens/`, `apps/mobile/pubspec.yaml`
- **Problem**: Field agents currently rely on the responsive web app on mobile browsers.
- **Remediation**:
  Scaffold Flutter Android app in `apps/mobile/` consuming the existing Dart API client and SQLite sync manager. Implement 3 core screens: (1) Collection Desk, (2) Passbook Lookup, and (3) Cash Handover.
- **Specialist Role**: Flutter Mobile Engineer
- **Acceptance Criteria**: Flutter app builds signed APK running offline payment collections with SQLite sync.
- **Implementation Complexity**: HIGH.

#### Item P1-3: Integrate Playwright Browser Tests into GitHub Actions CI
- **Finding ID**: `OPS-02`
- **Source Files**: [`.github/workflows/ci.yml`](file:///u:/Kumaran-finance/.github/workflows/ci.yml)
- **Problem**: Browser regressions could pass CI without detection.
- **Remediation**:
  Add a `playwright-e2e` job in `ci.yml` running `pnpm --filter web exec playwright test` with containerized Chromium.
- **Specialist Role**: QA / CI/CD Engineer
- **Acceptance Criteria**: CI runs full visual crawler and core E2E batch on PRs to `main`.
- **Implementation Complexity**: MEDIUM.

---

### P2 — Reliability, Consistency & Operational Improvements

#### Item P2-1: Add PostgreSQL Monetary `CHECK (amount >= 0)` Constraints
- **Finding ID**: `DB-001`
- **Source Files**: `apps/api/prisma/schema.prisma`, Prisma migrations
- **Problem**: Zero negative balance constraints at database DDL layer.
- **Remediation**:
  Add migration with `ALTER TABLE payments ADD CONSTRAINT check_payment_amount_positive CHECK (amount > 0);`.
- **Specialist Role**: Database Architect
- **Acceptance Criteria**: Attempting direct SQL insert of negative amount fails with PostgreSQL constraint violation.
- **Implementation Complexity**: LOW.

#### Item P2-2: Add Explicit Status Column to `Receipt` Model
- **Finding ID**: `DB-002`
- **Source Files**: `apps/api/prisma/schema.prisma`
- **Problem**: Receipts inherit status from payments rather than having their own state.
- **Remediation**:
  Add `status ReceiptStatus @default(ISSUED)` to `Receipt` model (`ISSUED`, `CANCELLED`).
- **Specialist Role**: Database Architect
- **Implementation Complexity**: LOW.

---

### P3 — Usability, Maintainability & Scalability

#### Item P3-1: Adjust Playwright Auth Fixture Timeout
- **Finding ID**: `UI-01`
- **Source Files**: [`apps/web/e2e/fixtures/auth-fixtures.ts`](file:///u:/Kumaran-finance/apps/web/e2e/fixtures/auth-fixtures.ts)
- **Problem**: 15s navigation timeout occasionally flakes under rapid consecutive test logins.
- **Remediation**: Increase navigation timeout to 30s.
- **Implementation Complexity**: LOW.

#### Item P3-2: Add Automated SSH Webhook Deployment to VPS
- **Finding ID**: `OPS-03`
- **Source Files**: [`.github/workflows/ci.yml`](file:///u:/Kumaran-finance/.github/workflows/ci.yml)
- **Problem**: Deployment requires manual SSH execution of `zero-downtime-deploy.sh`.
- **Remediation**: Add CD step executing deploy script on production VPS upon push to `main`.
- **Implementation Complexity**: MEDIUM.
