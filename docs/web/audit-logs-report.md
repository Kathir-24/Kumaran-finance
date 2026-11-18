# Immutable Forensic Audit Trail Viewer (`/reports/audit-logs`)

> **Product**: Kumaran Chits  
> **Company**: Kumaran Finance (Head Office: Perundurai, Tamil Nadu)  
> **Route**: `/reports/audit-logs`  
> **Target Audience**: **Strictly `SUPER_ADMIN` ONLY (IT Administrators & Managing Partners)** — per **Guardrail 11 / `ADR-21`** (`report.controller.ts:253-254`, `route-permissions.ts:42`; all other roles including `AUDITOR`, `BRANCH_MANAGER`, `ACCOUNTANT`, `COLLECTION_AGENT`, and `CUSTOMER` receive `HTTP 403 Forbidden`)  
> **Mandatory Rule**: PostgreSQL is the sole financial truth. Audit records are engine-enforced append-only (`ENABLE ALWAYS` triggers + `REVOKE UPDATE, DELETE, TRUNCATE FROM PUBLIC`).

---

## 1. Statutory Background & Forensic Purpose

Under the **Chit Funds Act, 1982** (Sections 38 & 67), the **Tamil Nadu Chit Funds Rules**, and statutory guidelines of the **Institute of Chartered Accountants of India (ICAI)**, financial systems handling public chits must maintain an immutable, tamper-evident audit journal.

The **Immutable Forensic Audit Trail Register (`/reports/audit-logs`)** provides a real-time, chronological evidentiary record of every state transition, cash vault movement, payment reversal, and dual-control approval occurring within Kumaran Finance operations. When an independent CA Auditor requires an `AuditLog` extract during statutory examination, a Managing Partner (`SUPER_ADMIN`) exports the period-filtered CSV/print packet on their behalf.

---

## 2. Invariant Architectural Guardrails Compliance (Guardrails 1, 2, 10 & 11)

1. **Single-Company Tenancy (Guardrail 1 / ADR-01)**:
   - Operating solely for Kumaran Finance. Zero `company_id` columns exist across audit models and endpoints.
2. **Engine-Level Statutory Immutability Guarantee (`CONCURR-INV-26`)**:
   - The UI provides strictly read-only presentation. Zero `DELETE`, `PUT`, `PATCH`, or `PURGE` actions exist on audit logs.
   - PostgreSQL enforces append-only immutability at the database engine layer via **`ENABLE ALWAYS`** triggers (`trg_prevent_audit_log_mutation` on `UPDATE`/`DELETE` and `trg_prevent_audit_log_truncate` on `TRUNCATE`) plus `REVOKE UPDATE, DELETE, TRUNCATE ON "AuditLog" FROM PUBLIC`, verified by real-DB concurrency test `CONCURR-INV-26`.
   - Every audit entry captures real client IP provenance via AsyncLocalStorage (ALS) request context.
3. **Dual-Control Maker-Checker Tracking (Guardrail 10)**:
   - Specifically flags sensitive dual-control actions (`AUCTION_FINALIZED`, `PAYMENT_REVERSED`, `CASH_HANDOVER_ACKNOWLEDGED`, `PRIZE_PAYOUT_AUTHORIZED`, `SAFETY_PROOF_VERIFIED`, `UPI_CLAIM_VERIFIED`, `DEFAULTER_REMOVED`) with visual maker-checker indicators.
4. **Strict Super Admin Access Gate (Guardrail 11 / `ADR-21`)**:
   - Access to `/reports/audit-logs` and `GET /api/v1/reports/audit-logs` is restricted strictly to **`Role.SUPER_ADMIN`** across NestJS controllers (`report.controller.ts:254`), Edge Middleware (`route-permissions.ts:42`), and client shells.
   - Non-Super-Admin roles (Auditors, Branch Managers, Accountants, Agents, Customers) receive `403 Forbidden` and are blocked from reading internal system audit trails.
5. **Pure Whole Rupee Math (Guardrail 2)**:
   - Currency amounts inside diff payloads (`oldValue`, `newValue`) operate exclusively on 64-bit integer Rupees (`bigint`), zero paise/floats.

---

## 3. Real Backend API Contract

- **Endpoint**: `GET /api/v1/reports/audit-logs` (`@Roles(Role.SUPER_ADMIN)`)
- **Query DTO**:
  - `entityType?: string` (`Payment`, `Auction`, `ChitGroup`, `SubscriberTicket`, `CustomerDocument`, `AuctionMinutes`, `AuctionWinner`)
  - `action?: string` (`AUCTION_FINALIZED`, `PAYMENT_REVERSED`, `CASH_HANDOVER_ACKNOWLEDGED`, etc.)
  - `userId?: string` (UUID of staff user who executed the action)
  - `fromDate?: string` (ISO timestamp `gte`)
  - `toDate?: string` (ISO timestamp `lte`)
  - `page?: number` (Default: 1)
  - `limit?: number` (Default: 50, Max: 100)
- **Response**: `AuditLogsReportResponseDto` with pagination and itemized audit records.

---

## 4. Component Architecture & Modularity

| Component | File Path | Purpose |
|---|---|---|
| **KPI Bar** | `apps/web/src/components/reports/audit-log-kpi-bar.tsx` | 4-metric summary: Total Records, Maker-Checker, Financial, Actors |
| **Filters** | `apps/web/src/components/reports/audit-log-filters.tsx` | Action, Entity, Staff User, Date Range, Limit selectors |
| **Table** | `apps/web/src/components/reports/audit-log-table.tsx` | Paginated audit journal with color badges and copy buttons |
| **Diff Modal** | `apps/web/src/components/reports/audit-diff-modal.tsx` | Side-by-side JSON comparison of `oldValue` vs `newValue` |
| **Shared Helpers** | `apps/web/src/components/reports/report-access.ts`, `report-bigint.ts` | Super Admin access guard & BigInt/IST formatting helpers |
| **Page Route** | `apps/web/src/app/(dashboard)/reports/audit-logs/page.tsx` | Route orchestrator, RBAC gate, CSV export, print trigger |

---

## 5. Verification & Testing

- **Automated Unit Tests**:
  - `apps/web/test/audit-logs-report.spec.ts` (immutability, RBAC, dual control, diff formatting, CSV export, and 100% parity across **72** `'reports.auditTrail'` EN/TA leaf keys).
  - `apps/web/test/module-7-reports-security.spec.ts` (strict `SUPER_ADMIN` isolation & report RBAC regression guards).
- **Workspace Status**: **376 / 376** Web unit tests passing across **52** spec files (**14** top-level suites).
- **Typecheck**: `pnpm --filter web typecheck` exited with **0 errors**.
- **Production Build**: Next.js 15 standalone build compiled all **35** App Router `page.tsx` routes cleanly.
