# KUMARAN CHITS — DOCUMENTATION CONSISTENCY & ALIGNMENT REGISTER

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance** (Perundurai, Erode District, Tamil Nadu)  
> **Date**: November 13, 2026  
> **Authority**: Antigravity Technical Documentation & Governance Team  
> **Status**: **100% SPECIFICATION ALIGNMENT ACROSS REPOSITORY**

---

## 1. Documentation Governance Principles

1. **Historical Audit Preservation**: Past audit reports (`docs/08-audit/PROMPT-01*.md` through `PROMPT-06*.md`) are **unmodified historical baseline records**. They document discoveries at specific points in time and are never altered.
2. **Single Source of Truth**: `docs/08-audit/CONFIRMED-BUSINESS-RULES.md` and `docs/08-audit/MASTER-REMEDIATION-REGISTER.md` serve as the authoritative reference for all business rules, mathematical formulas, and operational policies.
3. **Continuous Code-to-Doc Parity**: Every change implemented during remediation is reflected in technical documentation.

---

## 2. Cross-Document Parity Register

| Document Path | Topic / Domain | Remediated Code Alignment | Alignment Status |
|---|---|---|:---:|
| [`docs/01-business/financial-rules.md`](file:///u:/Kumaran-finance/docs/01-business/financial-rules.md) | Whole Rupee Math, Divisibility, Month N Settlement | Aligned with $(D-C)\%N==0$ divisibility guard, Month N $I_{\text{base}}$ deduction, and automated arrears offset | **ALIGNED** |
| [`docs/01-business/decision-log.md`](file:///u:/Kumaran-finance/docs/01-business/decision-log.md) | ADR 01–19 | Confirmed ADR-01 (Single-company), ADR-04 (4% commission), ADR-06 (1/4 ceiling), ADR-07 (Defaulters), ADR-13 (Max 1 ticket) | **ALIGNED** |
| [`docs/01-business/permissions-matrix.md`](file:///u:/Kumaran-finance/docs/01-business/permissions-matrix.md) | RBAC & Dual Control Matrix | Aligned with Partner exclusivity on reversals, auction finalization, and defaulter exit settlements | **ALIGNED** |
| [`docs/03-architecture/data-model.md`](file:///u:/Kumaran-finance/docs/03-architecture/data-model.md) | Prisma Schema & Constraints | Verified `BigInt` columns, composite uniqueness, and DEF-DB-05 index coverage | **ALIGNED** |
| [`docs/03-architecture/api-spec.md`](file:///u:/Kumaran-finance/docs/03-architecture/api-spec.md) | REST Endpoints & DTOs | Aligned with `POST /auctions/:id/correction/request` & `approve`, and Super Admin exclusivity | **ALIGNED** |
| [`docs/02-requirements/notification-and-receipt-templates.md`](file:///u:/Kumaran-finance/docs/02-requirements/notification-and-receipt-templates.md) | Bilingual PDF Layouts & Watermark | Aligned with `ரத்து செய்யப்பட்டது / CANCELLED` watermark on reversed payment receipts | **ALIGNED** |
| [`docs/07-operations/operations-sop.md`](file:///u:/Kumaran-finance/docs/07-operations/operations-sop.md) | Daily Branch Operations & Handover | Aligned with Maker != Checker physical sign-off and two-partner approval runbooks | **ALIGNED** |
| [`docs/07-operations/PRODUCTION-DEPLOYMENT-GUIDE.md`](file:///u:/Kumaran-finance/docs/07-operations/PRODUCTION-DEPLOYMENT-GUIDE.md) | Linux VPS & Docker Deployment | Aligned with flat-fee Linux VPS (~₹900–₹1,800/mo) + Cloudflare R2 deployment | **ALIGNED** |

---

## 3. Discrepancy Reconciliation Summary

| Discrepancy Discovered | Prior Documentation Wording | Confirmed & Remediated Reality |
|---|---|---|
| **Month N Prize Amount** | "Pays full pool $V - C$ = ₹96,000" | Deducts Month N installment if unpaid: $V - C - I_{\text{base}} = \mathbf{₹91,000}$ (or $\mathbf{₹96,000}$ if Month N was already paid at counter; double collection strictly barred under FIN-B). |
| **Dividend Remainder** | "Silently truncated via integer division" | Strictly rejected at bid entry: $(D-C)\%N==0$ throwing HTTP 400. |
| **Prize Payout Arrears** | "Arrears collected manually" | Automatically queried and deducted from prize snapshot in `authorizePayout`; verified via TOCTOU check inside lock (FIN-D). |
| **Auction Finalization Roles** | "Allowed: Super Admin, Branch Manager" | Allowed strictly: **Super Admin (Partners only with `isPartner: true` under SEC-A)**. |
| **Reversal Initiation Roles** | "Allowed: Super Admin, Branch Manager, Accountant" | Cashier/Staff requests reversal; approved strictly by verified **Partner (`isPartner: true` under SEC-A with `maker != checker`)**. |
| **Defaulter Settlement Roles** | "Allowed: Super Admin, Accountant" | Two-partner dual control: Partner A requests removal (`PENDING_REMOVAL_APPROVAL`), Partner B approves (`REMOVED_DEF_3M` with `maker != checker`). Damage settlement fails closed with `UNAPPROVED_SETTLEMENT_POLICY` (Q25). |
| **Cancelled Receipt PDF** | "Receipt marked cancelled in database" | Prominently displays bold red diagonal watermark `ரத்து செய்யப்பட்டது / CANCELLED`. |
| **WhatsApp Notifications** | "Simulated WhatsApp alerts in service" | Fake simulation mocks completely purged per Q34; Indian Telecom DLT SMS is sole automated production delivery channel. |
