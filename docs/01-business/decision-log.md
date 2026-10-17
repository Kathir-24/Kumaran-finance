# Kumaran Chits — Architectural Decision Record (ADR) & Decision Log (DRAFT)

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance**  
> **Status**: Working Draft  
> **Status Labels Used**:
> - `CONFIRMED-BY-DEVELOPER`: Confirmed by developer based on direct knowledge/experience; needs company confirmation later.
> - `PROPOSED`: Proposed working design or technical pattern.
> - `OPEN`: Unresolved question; pending business decision or company clarification.
> - `UNVERIFIED-LEGAL`: Legal or statutory claim lacking verified primary source citation.

---

## 1. Decision Matrix Summary

| ID | Topic | Strategy / Decision Summary | Status | Proposed By | Confirmed By | Date | Needs Company Confirmation (Y/N) |
|---|---|---|---|---|---|:---:|:---:|
| **ADR-01** | Deployment & Tenancy Scope | Option A: Strict single-company database (zero `company_id` columns; dedicated solely to Kumaran Finance for maximum simplicity and query speed). | `CONFIRMED-BY-DEVELOPER` | Developer | Developer | 2026-10-17 | **Y** |
| **ADR-02** | Branch Workflow & Scope | Only ONE branch exists today (`CONFIRMED-BY-DEVELOPER`). Keep branch concept in data model for possible future expansion (`PROPOSED`). | `CONFIRMED-BY-DEVELOPER` (1 branch) / `PROPOSED` (schema) | Developer (1 branch) / AI-assisted draft (schema) | Developer | 2026-10-17 | **Y** |
| **ADR-03** | Historical / Ongoing Data | Fresh start for new chits + Mid-cycle onboarding for active running chits from physical paper notebooks/ledgers. No closed dead chits. | `CONFIRMED-BY-DEVELOPER` | Developer | Developer | 2026-10-17 | **Y** |
| **ADR-04** | Foreman Commission Architecture | Configurable default of 4.00% (`CONFIRMED-BY-DEVELOPER`), copied at chit creation and frozen per chit once active. | `CONFIRMED-BY-DEVELOPER` | Developer | Developer | 2026-10-17 | **Y** |
| **ADR-05** | Offline Auction Recording | Staff conduct auctions offline at branch; software records and validates entered results (`CONFIRMED-BY-DEVELOPER`). Live mobile bidding deferred. | `CONFIRMED-BY-DEVELOPER` (offline) / `PROPOSED` (Phase 2) | Developer | Developer | 2026-10-17 | **Y** |
| **ADR-06** | Auction Discount Ceiling Engine | Fixed at strictly **1/4 (25.00%) of total chit value** ($D_{max} = \frac{V}{4}$). Non-dynamic, constant ceiling for all auction months (e.g., ₹1,00,000 scheme $\to$ max discount $\le$ ₹25,000). | `CONFIRMED-BY-DEVELOPER` | Developer | Developer | 2026-10-17 | **Y** |
| **ADR-07** | Field Agent Collections & Payment Settlement | Offline entries marked `PENDING_SYNC`. Each month has strictly a single payment; **zero double payments** and **zero advance balance** (concept eliminated). End-of-day cash handover. | `CONFIRMED-BY-DEVELOPER` | Developer | Developer | 2026-10-17 | **Y** |
| **ADR-08** | Receipt Language & Standards | Bilingual (English + Tamil) digital PDF receipts in v1 scope (`CONFIRMED-BY-DEVELOPER`). Build order `OPEN`. | `CONFIRMED-BY-DEVELOPER` | Developer | Developer | 2026-10-17 | **Y** |
| **ADR-09** | Customer Mobile App Scope | Phase 1: Passbook, dividend tracker, online payment, auction results display (`PROPOSED`). Build order `OPEN`. | `PROPOSED` | AI-assisted draft | None | 2026-10-17 | **Y** |
| **ADR-10** | Infrastructure & Code Ownership | Developer currently holds code, cloud account, and domain (`CONFIRMED-BY-DEVELOPER`). Handover terms to Kumaran Finance are `OPEN`. | `CONFIRMED-BY-DEVELOPER` (current) / `OPEN` (handover) | Developer | Developer | 2026-10-17 | **Y** |
| **ADR-11** | Receipt Delivery & Passbook | Digital receipt (SMS/WhatsApp link) + Physical & Digital Passbook entry in v1 scope (`CONFIRMED-BY-DEVELOPER`). Build order `OPEN`. | `CONFIRMED-BY-DEVELOPER` | Developer | Developer | 2026-10-17 | **Y** |
| **ADR-12** | Notification Channels | Hybrid: SMS for OTP + WhatsApp for receipts/reminders in v1 scope (`CONFIRMED-BY-DEVELOPER`). Provider approval required; build order `OPEN`. | `CONFIRMED-BY-DEVELOPER` | Developer | Developer | 2026-10-17 | **Y** |
| **ADR-13** | Customer Subscriptions & Limits | Single customer can join multiple chit groups, but **CANNOT hold 2 or more tickets in the SAME chit group** (Max 1 ticket per customer per group). | `CONFIRMED-BY-DEVELOPER` | Developer | Developer | 2026-10-17 | **Y** |
| **ADR-14** | Prize Payout Modes | Flexible disbursement voucher (Cheque, NEFT/RTGS/IMPS, or Cash) in v1 scope (`CONFIRMED-BY-DEVELOPER`). Build order `OPEN`. Cash limits are `UNVERIFIED-LEGAL`. | `CONFIRMED-BY-DEVELOPER` | Developer | Developer | 2026-10-17 | **Y** |
| **ADR-15** | Safety Proof & Collateral Checklist | Property documents eliminated. Surety is **not mandatory** across the board; provided only if demanded by company for safety. Flexible instruments: signed agreement (winner + nominee), signed blank cheques, promissory notes. | `CONFIRMED-BY-DEVELOPER` | Developer | Developer | 2026-10-17 | **Y** |

---

## 2. Detailed Architectural Records

### ADR-01: Deployment Scope & Tenancy Architecture (`CONFIRMED-BY-DEVELOPER`)
- **Decision**: **Option A — Strict single-company database without any `company_id` abstraction.**
- **Rationale**: The software is built exclusively for Kumaran Finance. Removing multi-tenant abstractions eliminates redundant `company_id` foreign keys, accelerates query performance, simplifies database indexes, and ensures zero risk of cross-tenant data leakage.
- **Status**: `CONFIRMED-BY-DEVELOPER` (Subject to final business sign-off by Kumaran Finance).

---

### ADR-02: Branch Scope (`CONFIRMED-BY-DEVELOPER` / `PROPOSED`)
- **Current Fact (`CONFIRMED-BY-DEVELOPER`)**: Kumaran Finance operates from **only one branch** today.
- **Architecture Strategy (`PROPOSED`)**: Keep the `Branch` entity and `branchId` foreign key in the data model. For v1, a default branch record is created, ensuring future multi-branch expansion can happen without breaking existing schemas.

---

### ADR-06: Fixed 1/4 (25%) Auction Discount Ceiling Engine (`CONFIRMED-BY-DEVELOPER`)
- **Decision**: There is **no dynamic discount ceiling**. The discount ceiling is fixed strictly at **one-fourth (1/4 or 25.00%) of the total chit value ($V$)** across all auction months ($D_{max} = \frac{V}{4} = 0.25 \times V$).
- **Formula & Range**: In any auction (Months 2 to $N-1$), the winning bid discount ($D$) must strictly satisfy:
  $$C_f \le D \le D_{max} = \frac{V}{4}$$
  where $C_f$ is the frozen 4.00% Foreman Commission ($0.04 \times V$).
- **Example**: For a ₹1,00,000 chit scheme:
  - Total Chit Value $V = \text{₹}1,00,000$.
  - Maximum Ceiling Discount $D_{max} = \frac{1,00,000}{4} = \text{₹}25,000$.
  - Bid discount cannot go more than ₹25,000 ($D \le \text{₹}25,000$).
  - Foreman Commission $C_f = 0.04 \times 1,00,000 = \text{₹}4,000$.
  - Permitted auction discount range: ₹4,000 $\le D \le$ ₹25,000.

---

### ADR-07: Field Agent Collection, Sync & Single Payment Rule (`CONFIRMED-BY-DEVELOPER`)
- **Single Discrete Payment per Month**: Each installment month accepts strictly a single payment matching the net installment amount. **Double payments for the same specified month will never happen** in business operations.
- **Zero Advance Balance**: The concept of "Advance Balance" is completely eliminated from the architecture and data models. No advance ledger or carry-forward balance exists.
- **Offline Sync & Reconciliation**: When agents collect offline, entries are recorded as `PENDING_SYNC` with device timestamp. Upon syncing with the server, the payment marks that specific month's installment as `PAID`. End-of-day cash handover reconciles physical cash against recorded receipts.

---

### ADR-10: Ownership of Code, Cloud, and Domain (`CONFIRMED-BY-DEVELOPER` / `OPEN`)
- **Current Status (`CONFIRMED-BY-DEVELOPER`)**: The developer currently holds the source code, AWS cloud account, and domain registration.
- **Future Handover (`OPEN`)**: A formal handover to Kumaran Finance may occur later. Handover terms, intellectual property assignment, and ongoing maintenance responsibilities are **OPEN** and subject to future commercial agreement.

---

### ADR-13: Customer Subscriptions & Ticket Limits (`CONFIRMED-BY-DEVELOPER`)
- **Cross-Chit Enrollment**: A single customer may join multiple different chit groups (`CONFIRMED-BY-DEVELOPER`).
- **Same-Chit Limit**: A single customer **CANNOT hold 2 or more tickets in the SAME chit group** (Max 1 ticket per customer per scheme) (`CONFIRMED-BY-DEVELOPER`).
- **Data Model Terminology**:
  - **Customer**: The individual person / entity.
  - **Membership**: The subscription relationship connecting the customer to a specific Chit Group.
  - **Ticket**: The unique participation unit (1 to $N$) within that Chit Group.

---

### ADR-15: Flexible Company Safety Proof & Collateral Checklist (`CONFIRMED-BY-DEVELOPER`)
- **Elimination of Property Docs**: Property documents and property deeds are completely removed from the standard workflow.
- **On-Demand / Non-Mandatory Security**: Submission of proof/collateral is evaluated case-by-case by Kumaran Finance and is **not mandatory** across the board.
- **Flexible Safety Proof Instruments**: If the company requests proof for company safety before prize disbursement, staff can record and attach any accepted instrument:
  1. Signed Chit Agreement with auction winner and nominee signatures.
  2. Signed Blank Cheque(s) with signatures from customer / guarantor.
  3. Promissory Note / Personal Guarantee.
  4. Other security proof accepted by branch management.
- **System Role**: Operational checklist and digital attachment repository (`isSecurityRequired: boolean`, `securityType: string?`, `blankChequeDetails: string?`, `isWinnerSigned: boolean`, `isNomineeSigned: boolean`, `documentUrls: string[]`).
