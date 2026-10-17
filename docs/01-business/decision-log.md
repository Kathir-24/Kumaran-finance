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
| **ADR-06** | Auction Discount Ceiling Engine | Ceiling limit is **dynamic** (not constant; changes per scheme/scenario/month). Hard cap (40%) is `UNVERIFIED-LEGAL`. | `CONFIRMED-BY-DEVELOPER` (dynamic ceiling) / `UNVERIFIED-LEGAL` (40% cap) | Developer | Developer | 2026-10-17 | **Y** |
| **ADR-07** | Field Agent Offline Collections | Offline entries marked `PENDING_SYNC`. If duplicate online payment occurs, extra cash is credited as **Advance Balance** for next month. End-of-day cash handover. | `CONFIRMED-BY-DEVELOPER` | Developer | Developer | 2026-10-17 | **Y** |
| **ADR-08** | Receipt Language & Standards | Bilingual (English + Tamil) digital PDF receipts in v1 scope (`CONFIRMED-BY-DEVELOPER`). Build order `OPEN`. | `CONFIRMED-BY-DEVELOPER` | Developer | Developer | 2026-10-17 | **Y** |
| **ADR-09** | Customer Mobile App Scope | Phase 1: Passbook, dividend tracker, online payment, auction results display (`PROPOSED`). Build order `OPEN`. | `PROPOSED` | AI-assisted draft | None | 2026-10-17 | **Y** |
| **ADR-10** | Infrastructure & Code Ownership | Developer currently holds code, cloud account, and domain (`CONFIRMED-BY-DEVELOPER`). Handover terms to Kumaran Finance are `OPEN`. | `CONFIRMED-BY-DEVELOPER` (current) / `OPEN` (handover) | Developer | Developer | 2026-10-17 | **Y** |
| **ADR-11** | Receipt Delivery & Passbook | Digital receipt (SMS/WhatsApp link) + Physical & Digital Passbook entry in v1 scope (`CONFIRMED-BY-DEVELOPER`). Build order `OPEN`. | `CONFIRMED-BY-DEVELOPER` | Developer | Developer | 2026-10-17 | **Y** |
| **ADR-12** | Notification Channels | Hybrid: SMS for OTP + WhatsApp for receipts/reminders in v1 scope (`CONFIRMED-BY-DEVELOPER`). Provider approval required; build order `OPEN`. | `CONFIRMED-BY-DEVELOPER` | Developer | Developer | 2026-10-17 | **Y** |
| **ADR-13** | Customer Subscriptions & Limits | Single customer can join multiple chit groups, but **CANNOT hold 2 or more tickets in the SAME chit group** (Max 1 ticket per customer per group). | `CONFIRMED-BY-DEVELOPER` | Developer | Developer | 2026-10-17 | **Y** |
| **ADR-14** | Prize Payout Modes | Flexible disbursement voucher (Cheque, NEFT/RTGS/IMPS, or Cash) in v1 scope (`CONFIRMED-BY-DEVELOPER`). Build order `OPEN`. Cash limits are `UNVERIFIED-LEGAL`. | `CONFIRMED-BY-DEVELOPER` | Developer | Developer | 2026-10-17 | **Y** |
| **ADR-15** | Surety & Agreement Checklist | Software acts as checklist & recordkeeper: property docs, winner signature, nominee signature, scanned uploads. Property requirement varies per company policy. | `CONFIRMED-BY-DEVELOPER` (checklist role) / `OPEN` (property policy) | Developer | Developer | 2026-10-17 | **Y** |

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

### ADR-06: Dynamic Auction Discount Ceiling Engine (`CONFIRMED-BY-DEVELOPER`)
- **Decision**: The auction discount ceiling limit is **dynamic** (not constant) and changes according to the scheme terms, installment month, or scenario (`CONFIRMED-BY-DEVELOPER`).
- **Implementation**: The software supports configurable ceilings per scheme and per month index, with minimum floor protection ($D \ge C_f$) to prevent negative dividends. Statutory 40% cap is `UNVERIFIED-LEGAL`.

---

### ADR-07: Field Agent Collection & Offline Sync (`CONFIRMED-BY-DEVELOPER`)
- **Offline Entry Rule (`CONFIRMED-BY-DEVELOPER`)**: When agents record collections offline, entries are marked `PENDING_SYNC` with device timestamp. Offline entries are not treated as confirmed bank settlement until synced.
- **Conflict Handling Rule (`CONFIRMED-BY-DEVELOPER`)**: In rare cases where a customer pays online via UPI and also gives cash to an offline field agent for the same month, **the extra cash is credited as an Advance Balance toward the customer's next month's installment**.

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

### ADR-15: Surety and Agreement Checklist (`CONFIRMED-BY-DEVELOPER` / `OPEN`)
- **Software Role (`CONFIRMED-BY-DEVELOPER`)**: The software functions as an operational **checklist and recordkeeper**:
  1. Has the winner submitted property documents? [Yes / No]
  2. Has the agreement been signed by the winner? [Yes / No]
  3. Has the nominee signed? [Yes / No]
  4. Upload scanned copies of signed agreements and property deeds to secure private cloud storage.
- **Legal & Policy Boundary**: The software does not evaluate or judge the legal validity or market value of property deeds (`CONFIRMED-BY-DEVELOPER`). Property submission requirements vary depending on company risk decisions (`OPEN`).
