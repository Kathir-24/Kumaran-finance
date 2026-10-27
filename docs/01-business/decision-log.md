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
| **ADR-11** | Receipt Delivery & Passbook | Signed physical paper passbook is primary physical proof. Software records digital receipt ID for Form XXII cash book. Mobile App Push notification is primary (₹0 cost); SMS fallback for keypad phones (`CONFIRMED-BY-DEVELOPER`). | `CONFIRMED-BY-DEVELOPER` | Developer | Developer / Owner | 2026-10-21 | **Y** |
| **ADR-12** | Notification Channels & Help Desk | Smart Hierarchy: OTP via SMS only; All operational alerts (Payments, Auctions, Dividends, Defaults) via Free Mobile Push with SMS fallback for keypad phones; WhatsApp Business API parked in V1; Direct phone calls for support (`CONFIRMED-BY-DEVELOPER`). | `CONFIRMED-BY-DEVELOPER` | Developer | Developer / Owner | 2026-10-21 | **Y** |
| **ADR-14** | Prize Payout Modes & Zero Cash Block | Flexible disbursement voucher (Cheque, NEFT/RTGS/IMPS, or Cash). Hard cash disbursements permitted for any amount with ZERO artificial software cash block (`CONFIRMED-BY-DEVELOPER`). | `CONFIRMED-BY-DEVELOPER` | Developer / Owner | 2026-10-19 | **Y** |
| **ADR-15** | Safety Proof & Collateral Checklist | Property documents eliminated. Surety is **not mandatory** across the board; provided only if demanded by company for safety. Flexible instruments: signed agreement (winner + nominee), signed blank cheques, promissory notes. | `CONFIRMED-BY-DEVELOPER` | Developer | 2026-10-17 | **Y** |
| **ADR-16** | Lightweight Intake & No Forced KYC | Customer intake mirrors physical notebooks: Name, Phone, Address, Nominee. Aadhaar, PAN, and document uploads are completely optional, never mandatory (`CONFIRMED-BY-DEVELOPER`). | `CONFIRMED-BY-DEVELOPER` | Developer / Owner | 2026-10-19 | **Y** |
| **ADR-17** | Dual-Platform Full Parity for Partners | 100% full feature parity on BOTH Web (`apps/web`) and Mobile (`apps/mobile`) for the 4 Partners across both Maker and Checker roles (`maker_user_id != checker_user_id` enforced regardless of device). Desk roles on Web; field/customers on Mobile. | `CONFIRMED-BY-DEVELOPER` | Developer / Owner | 2026-10-20 | **Y** |
| **ADR-18** | Phone-Only Identity & Email Elimination | Single non-nullable unique `phone` across users and customers; `email` column permanently dropped. | `CONFIRMED-BY-DEVELOPER` | Developer / Owner | 2026-10-22 | **Y** |
| **ADR-19** | Zero-Fee Native UPI Intent & Bank UTR Uniqueness | Zero third-party gateway fees (No Razorpay/Cashfree/2% MDR). NPCI native `upi://pay` deep-linking to KVB current account. `Payment.transactionRef @unique` prevents duplicate bank UTR claims. Customer claims verified by Desk Accountant under Maker != Checker. | `CONFIRMED-BY-DEVELOPER` | Developer / Owner | 2026-10-27 | **Y** |

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

### ADR-07: Field Agent Collection, Sync, Single Payment & Zero Partial Payments (`CONFIRMED-BY-DEVELOPER`)
- **Single Discrete Payment per Month**: Each installment month accepts strictly a single payment matching the net installment amount. **Double payments for the same specified month will never happen** in business operations.
- **Cycle Date Window (30-day collection frame)**: Each cycle operates on a date window (`cycleStartDate` to `cycleEndDate`, e.g. 22/11/2022 to 22/12/2022). Subscribers can pay on **any day** within this window (e.g. 15/12/2022).
- **Zero Partial Payments**: Installments must be paid in full for the exact net amount due ($I_{net}$). Partial payments are strictly prohibited in the product. The `DueStatus` enum is strictly `UNPAID`, `PAID`, `OVERDUE`.
- **Zero Advance Balance**: The concept of "Advance Balance" is completely eliminated from the architecture and data models. No advance ledger or carry-forward balance exists.
- **Offline Sync & Reconciliation**: When agents collect offline, entries are recorded as `PENDING_SYNC` with device timestamp. Upon syncing with the server, the payment marks that specific month's installment as `PAID`. End-of-day cash handover reconciles physical cash against recorded receipts.

---

### ADR-10: Ownership of Code, Cloud, and Domain (`CONFIRMED-BY-DEVELOPER` / `OPEN`)
- **Current Status (`CONFIRMED-BY-DEVELOPER`)**: The developer currently holds the source code, AWS cloud account, and domain registration.
- **Future Handover (`OPEN`)**: A formal handover to Kumaran Finance may occur later. Handover terms, intellectual property assignment, and ongoing maintenance responsibilities are **OPEN** and subject to future commercial agreement.

---

### ADR-11: Physical Passbook Primacy & Smart Digital Receipts (`CONFIRMED-BY-DEVELOPER`)
- **Ground Truth**: In Kumaran Finance operations, the customer's physical paper passbook (சீட்டு பாஸ்புக்) is their primary, legally acknowledged proof of installment payment. At doorstep collections, the agent enters the date, amount, and signs with a pen. Loose paper receipt slips are completely eliminated.
- **6-Column Passbook Ledger Standard**: The physical passbook and software digital passbook maintain identical columns:
  $$\text{Month \#} \mid \text{Payment Date (Cycle Start)} \mid \text{Paid Date (Doorstep)} \mid \text{Amount Paid } (I_{net}) \mid \text{Dividend } (Div) \mid \text{Total } (I_{base})$$
  Invariant: $\text{Amount Paid} + \text{Dividend} = \text{Total Base Installment}$ on every row.
- **Software Role**: Every transaction generates a sequential receipt number (`KC-REC-...`) solely for company ledger integrity (Form XXII Cash Book), evening handover reconciliation, and dispute backup.
- **Delivery & Asynchronous Queueing**: Counter payments (`POST /payments`) and field collections (`POST /collections/record`) immediately commit financial records to PostgreSQL and asynchronously enqueue a background receipt dispatch to BullMQ (`notification-queue` / `JOB_DISPATCH_PAYMENT_RECEIPT`). Smartphone app subscribers receive an instant free Push Notification deep-linking to their digital passbook. Keypad phone users receive an SMS receipt fallback.

---

### ADR-12: Smart Notification Hierarchy, OTP via SMS & Direct Phone Support (`CONFIRMED-BY-DEVELOPER`)
- **Authentication**: All user login OTPs (Partners, Staff, Customers) strictly use **Telecom DLT SMS** (Header: `KMRCHT`, Template `1407169823412093847`). OTP sessions are stored in **Redis** (`auth:otp:<phone>`) with a strict **300-second (5-minute) TTL**, SHA-256 hash security, and a 3-attempt brute-force lockout.
- **Operational Alerts**: Payments, upcoming auction reminders, post-auction dividend credits, and 3-month default warnings follow a unified smart hierarchy:
  - **Smartphone Users**: Free Mobile App Push Notifications (FCM, ₹0 cost).
  - **Keypad Phone Users**: Telecom DLT SMS fallback.
- **WhatsApp Business API**: Officially **Parked / Shelved in V1** to avoid third-party SaaS fees and Meta per-conversation charges.
- **Help Desk & Support**: Handled via **Direct Phone Calls** to Perundurai Head Office (`0424-2223333` / Partner mobile numbers).

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

---

### ADR-14: Prize Payout Modes & Zero Cash Block (`CONFIRMED-BY-DEVELOPER`)
- **Operational Reality**: Kumaran Finance predominantly disburses prize money in physical hard cash at the branch office, in line with long-standing local business practices in Perundurai and Erode district.
- **Architectural Decision**: The software must faithfully record operational truth. It **strictly enforces ZERO artificial cash blocks or limits**.
- **Payout Modes**: Supports `CASH`, `ACCOUNT_PAYEE_CHEQUE`, `BANK_TRANSFER_NEFT`, `BANK_TRANSFER_RTGS`, and `BANK_TRANSFER_IMPS`.
- **Zero Software Block**: Staff can disburse any authorized prize money amount (₹1,00,000, ₹2,00,000, ₹5,00,000, ₹10,00,000) in `CASH`. The system records the transaction without throwing artificial blocking errors.

---

### ADR-16: Lightweight Customer Intake & No Forced KYC (`CONFIRMED-BY-DEVELOPER`)
- **Operational Reality**: Kumaran Finance deals with known local subscribers (farmers, shopkeepers, weavers, and residents of Perundurai). Onboarding mirrors the physical paper notebook:
  1. Full Name (English and optional Tamil)
  2. Mobile Phone Number (10 digits)
  3. Address / Town
  4. Nominee Name & Relationship
- **No Forced Aadhaar / Document Uploads**:
  - Aadhaar number, PAN card number, and identity document uploads are **strictly OPTIONAL** and never mandatory.
  - Known local subscribers are onboarded immediately upon entering their notebook details.
  - Zero forced document scans, photocopies, or third-party digital KYC barriers are required to create a customer, assign a ticket, or participate in auctions.

---

### ADR-17: Dual-Platform Full Parity for Partners (Web & Mobile Parity for Maker & Checker) (`CONFIRMED-BY-DEVELOPER`)
- **Operational Reality**: The 4 equal partners (Super Admin / Owners) run Kumaran Finance on the move, at home, at the branch counter, and in customer meetings. They cannot be restricted exclusively to desktop computers, nor can they be forced to perform high-volume ledger entry on smartphones.
- **Architectural Decision**:
  1. **100% Feature Parity for Partners**: The 4 Partners have 100% full feature parity on **BOTH** the Web Portal (`apps/web/`) and the Android Mobile App (`apps/mobile/`).
  2. **Cross-Device Maker-Checker**: The strict invariant `maker_user_id != checker_user_id` is enforced at the API and database levels, completely agnostic of client devices:
     - Partner A on Mobile (Maker) $\to$ Partner B on Web (Checker)
     - Partner A on Web (Maker) $\to$ Partner B on Mobile (Checker)
     - Partner A on Mobile (Maker) $\to$ Partner B on Mobile (Checker)
     - Partner A on Web (Maker) $\to$ Partner B on Web (Checker)
  3. **Role-Tailored Platform Distribution**:
     - **Partners (`SUPER_ADMIN`)**: 100% Full Parity on Web & Mobile (Auctions, Approvals, Payouts, Cash Handover, Reports).
     - **Desk Accountant (`ACCOUNTANT`)**: Primarily Web Portal (transcribing 20-month physical notebooks, day books, voucher preparation).
     - **CA Auditor (`AUDITOR`)**: Primarily Web Portal (read-only 12-column Form XXII Cash Book, Form XXI Ledgers, forensic audit trails).
     - **Field Collection Agents (`COLLECTION_AGENT`)**: Primarily Mobile App (1-second fingerprint unlock, doorstep collections, offline SQLite auto-sync, push/SMS receipts).
     - **Customers (`CUSTOMER`)**: Primarily Mobile App (bilingual passbook, 1-tap UPI payment via GPay/PhonePe/Paytm, auction results).
     - **Dual-Role Staff (`[COLLECTION_AGENT, ACCOUNTANT]`)**: Mobile App on collection rounds; Web Portal or Mobile App at office desk.


---

### ADR-18: Phone-Only Identity Architecture & Complete Email Elimination (`CONFIRMED-BY-DEVELOPER`)
- **Operational Reality**: Kumaran Finance operates as a physical branch chit fund in Perundurai, Erode. The 4 Managing Partners, desk accountant, field collection agents, and all chit subscribers interact exclusively using **10-digit Indian mobile phone numbers** (`^[6-9]\d{9}$`). Staff and subscribers do not possess or use company email accounts for daily operations, receipts, or approvals.
- **Architectural Decision**:
  1. **Sole Communication & Login Handle**: `phone` is the single, non-nullable, unique identity across both staff (`User`) and subscribers (`Customer`).
  2. **Total Elimination of Email**: The `email` column is dropped entirely from the database schema (`User` table), JWT token payloads, API request DTOs (`LoginDto`), and user profile responses.
  3. **Strict Phone Validation**: Authentication endpoints (`POST /auth/web/login`, `POST /auth/mobile/login-mpin`) enforce 10-digit Indian mobile regex matching (`REGEX_INDIAN_PHONE`). Ambiguous `identifier` fields accepting email are permanently eliminated.

---

### ADR-19: Zero-Fee Native NPCI UPI Intent & Bank UTR Anti-Duplication Protocol (`CONFIRMED-BY-DEVELOPER`)
- **Operational Reality**: Third-party payment gateways (Razorpay, Cashfree, PayU) levy 1.5% to 2.0% + GST on every transaction. In a 20-month chit fund collecting ₹1,00,000 to ₹50,00,000 monthly, gateway MDR charges would bleed ₹20,000 to ₹1,00,000+ per month in unnecessary administrative leakage. Furthermore, Kumaran Finance settles transactions directly into its Karur Vysya Bank (KVB) current account in Perundurai.
- **Architectural Decision**:
  1. **Strict Rejection of Third-Party Gateways**: Zero gateway SDKs, zero aggregator merchant fees, zero 2% MDR costs.
  2. **NPCI Native 1-Tap UPI Intent (`upi://pay`)**:
     - Dynamic server helper `GET /installments/:dueId/upi-intent` generates the official NPCI URI:
       ```
       upi://pay?pa=kumaranfinance@kvb&pn=Kumaran+Finance&am=<Inet>&cu=INR&tn=<Group-Ticket-Month>&tr=<dueId>
       ```
     - Locking the exact whole-rupee net payable installment amount ($I_{net} = I_{base} - Div$) prevents subscribers from entering arbitrary amounts.
     - Deep-links directly to GPay, PhonePe, Paytm, or BHIM on Android with 1-tap.
  3. **PostgreSQL Bank UTR Anti-Duplication Guard**:
     - `Payment.transactionRef` is marked `@unique` in Prisma (`Payment_transactionRef_key` in PostgreSQL 17).
     - Allows infinite `NULL` values for cash payments, while mathematically blocking any non-null bank UTR or cheque reference string from ever being submitted or claimed more than once.
     - Collision attempts return `HTTP 409 Conflict` (`DUPLICATE_TRANSACTION_REF`).
  4. **Customer Claim & Desk Accountant Verification (Maker != Checker)**:
     - Subscribers submit their 12-digit bank UTR reference via `POST /payments/upi-claim` (`paymentStatus: INITIATED`).
     - Desk Accountant inspects the KVB NetBanking / mobile banking statement for the credit and verifies via `POST /payments/:id/verify-upi-claim`.
     - Maker != Checker is enforced: the user who submitted the claim cannot verify it.
     - Verification transitions payment to `SUCCESS`, generates sequential bilingual receipt (`KC-REC-PRD-YYYY-XXXXX`), marks due `PAID`, and dispatches push receipt to the subscriber.

