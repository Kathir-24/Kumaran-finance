# Immutable Forensic Audit Trail Viewer (`/reports/audit-logs`)

> **Product**: Kumaran Chits  
> **Company**: Kumaran Finance (Head Office: Perundurai, Tamil Nadu)  
> **Route**: `/reports/audit-logs`  
> **Target Audience**: Super Admin (Managing Partners), Independent CA Auditor, Branch Manager, Desk Accountant, Subscribers (Self-Audit)  
> **Mandatory Rule**: PostgreSQL is the sole financial truth. Audit records are append-only; zero mutation or deletion capabilities exist.

---

## 1. Statutory Background & Forensic Purpose

Under the **Tamil Nadu Chit Funds Rules** and statutory guidelines of the **Institute of Chartered Accountants of India (ICAI)**, financial systems handling public chits must maintain an immutable, tamper-evident audit journal.

The **Immutable Forensic Audit Trail Register (`/reports/audit-logs`)** provides a real-time, chronological evidentiary record of every state transition, cash vault movement, payment reversal, and dual-control approval occurring within Kumaran Finance operations.

---

## 2. The 10 Invariant Architectural Guardrails Compliance

1. **Single-Company Tenancy (Guardrail 1 / ADR-01)**:
   - Operating solely for Kumaran Finance. Zero `company_id` columns exist across audit models and endpoints.
2. **Statutory Immutability Guarantee**:
   - The UI provides strictly read-only presentation. Zero `DELETE`, `PUT`, `PATCH`, or `PURGE` actions exist on audit logs.
   - PostgreSQL `AuditLog` table is append-only, providing evidentiary weight for external auditors.
3. **Dual-Control Maker-Checker Tracking (Guardrail 10)**:
   - Specifically flags sensitive dual-control actions (`AUCTION_FINALIZED`, `PAYMENT_REVERSED`, `CASH_HANDOVER_ACKNOWLEDGED`, `PRIZE_PAYOUT_AUTHORIZED`, `SAFETY_PROOF_VERIFIED`, `UPI_CLAIM_VERIFIED`) with visual maker-checker indicators.
4. **Strict Super Admin Access Gate**:
   - Access to the immutable audit trail is restricted strictly to `Role.SUPER_ADMIN` across backend controllers, services, and web edge middleware.
   - Non-Super-Admin roles (Auditors, Branch Managers, Accountants, Customers) receive `403 Forbidden` and are blocked from reading internal system audit trails.
5. **Pure Whole Rupee Math (Guardrail 2)**:
   - Currency amounts inside diff payloads (`oldValue`, `newValue`) operate exclusively on 64-bit integer Rupees (`bigint`), zero paise/floats.

---

## 3. Real Backend API Contract

- **Endpoint**: `GET /api/v1/reports/audit-logs`
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

All files remain strictly $\le 300\text{--}350$ lines:

| Component | File Path | Line Count | Purpose |
|---|---|---|---|
| **KPI Bar** | `apps/web/src/components/reports/audit-log-kpi-bar.tsx` | 89 lines | 4-metric summary: Total Records, Maker-Checker, Financial, Actors |
| **Filters** | `apps/web/src/components/reports/audit-log-filters.tsx` | 186 lines | Action, Entity, Staff User, Date Range, Limit selectors |
| **Table** | `apps/web/src/components/reports/audit-log-table.tsx` | 279 lines | Paginated audit journal with color badges and copy buttons |
| **Diff Modal** | `apps/web/src/components/reports/audit-diff-modal.tsx` | 177 lines | Side-by-side JSON comparison of `oldValue` vs `newValue` |
| **Page Route** | `apps/web/src/app/(dashboard)/reports/audit-logs/page.tsx` | 336 lines | Route orchestrator, RBAC gate, CSV export, print trigger |

---

## 5. Verification & Testing

- **Automated Unit Tests**: `apps/web/test/audit-logs-report.spec.ts` (8 invariant tests asserting immutability, RBAC, self-isolation, dual control, diff formatting, CSV export, and bilingual dictionary parity).
- **Workspace Status**: 256/256 tests passing across 11 test suites.
- **Typecheck**: `tsc --noEmit` exited with code 0.
- **Production Build**: Next.js 15 compiled 29 routes cleanly.
