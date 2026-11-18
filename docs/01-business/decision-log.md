# Kumaran Chits — Architectural Decision Record (ADR) & Decision Log

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance**  
> **Status**: Active Architecture Decision Log (`ADR-01` through `ADR-26`)  
> **Status Labels Used**:
> - `CONFIRMED-BY-DEVELOPER`: Confirmed by developer based on direct knowledge/experience; subject to final company confirmation where noted.
> - `PROPOSED`: Proposed working design or technical pattern.
> - `OPEN`: Unresolved question; pending business decision or company clarification.
> - `DEFERRED`: Postponed to Phase 2 per authoritative business owner directive.
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
| **ADR-07** | Field Agent Collections & Payment Settlement | Offline entries marked `PENDING_SYNC`. Each month has strictly a single payment; **zero double payments**, **zero partial payments**, and **zero advance balance** (concept eliminated). End-of-day cash handover. | `CONFIRMED-BY-DEVELOPER` | Developer | Developer | 2026-10-17 | **Y** |
| **ADR-08** | Receipt Language & Standards | Bilingual (English + Tamil) digital PDF receipts in V1 scope (`CONFIRMED-BY-DEVELOPER`), with red diagonal cancellation watermark (`KFC-PDF-001`). | `CONFIRMED-BY-DEVELOPER` | Developer | Developer | 2026-10-17 | **Y** |
| **ADR-09** | Customer Mobile App Scope | Passbook, dividend tracker, online UPI intent, auction results display. **Deferred to Phase 2 (Q2 2027)** per Nov 13, 2026 Owner Directive (see `ADR-26`); backend APIs & Dart core preserved. | `DEFERRED` (Phase 2 — Q2 2027) | Business Owner | Owner / Developer | 2026-11-13 | **N** |
| **ADR-10** | Infrastructure, Hosting, Storage & Ownership | Production targets any Flat-Fee Linux VPS + Cloudflare R2 (₹0 egress) with zero vendor lock-in. Code/cloud/domain commercial handover terms remain `OPEN`. | `CONFIRMED-BY-DEVELOPER` (Infra) / `OPEN` (Handover) | Developer | Developer | 2026-10-17 | **Y** |
| **ADR-11** | Receipt Delivery & Passbook | Signed physical paper passbook is primary physical proof. Software records digital receipt ID for Form XXII cash book and streams A5 PDFs via BFF. Phase 1 automated alerts use Indian TRAI DLT SMS (`ADR-23`); mobile push deferred to Phase 2 (`ADR-26`). | `CONFIRMED-BY-DEVELOPER` | Developer | Developer / Owner | 2026-10-21 | **Y** |
| **ADR-12** | Notification Channels & Help Desk | Phase 1: OTP and all operational alerts delivered strictly via Indian TRAI DLT SMS (MSG91, see `ADR-23`). FCM Mobile Push deferred to Phase 2 with Flutter UI (`ADR-26`); WhatsApp Business API purged/parked; Direct phone calls for support. | `CONFIRMED-BY-DEVELOPER` | Developer | Developer / Owner | 2026-10-21 | **Y** |
| **ADR-13** | Customer Subscriptions & Ticket Limits | A customer may join multiple different chit groups, but **cannot hold 2 or more tickets in the same chit group** (`@@unique([chitGroupId, customerId])`). | `CONFIRMED-BY-DEVELOPER` | Developer | Developer | 2026-10-17 | **Y** |
| **ADR-14** | Prize Payout Modes & Zero Cash Block | Flexible disbursement voucher (Cheque, NEFT/RTGS/IMPS, or Cash). Hard cash disbursements permitted for any amount with ZERO artificial software cash block (`CONFIRMED-BY-DEVELOPER`); IT Act §40A(3) advisory rendered on cash vouchers $> ₹10,000$. | `CONFIRMED-BY-DEVELOPER` | Developer | Developer / Owner | 2026-10-19 | **Y** |
| **ADR-15** | Safety Proof & Collateral Checklist | Property documents eliminated. Surety is **not mandatory** across the board; provided only if demanded by company for safety. Flexible instruments: signed agreement (winner + nominee), signed blank cheques, promissory notes. | `CONFIRMED-BY-DEVELOPER` | Developer | Developer | 2026-10-17 | **Y** |
| **ADR-16** | Lightweight Intake & No Forced KYC | Customer intake mirrors physical notebooks: Name, Phone, Address, Nominee. Aadhaar, PAN, and document uploads are completely optional, never mandatory (`CONFIRMED-BY-DEVELOPER`). | `CONFIRMED-BY-DEVELOPER` | Developer | Developer / Owner | 2026-10-19 | **Y** |
| **ADR-17** | Dual-Platform Architecture & Partner Parity | Cross-device Maker $\ne$ Checker enforced at API & DB levels. Phase 1 production UI is Web Portal (`apps/web/`); Flutter Android UI parity deferred to Phase 2 (`ADR-26`) with Dart Core (`apps/mobile/lib/core/`) preserved. | `CONFIRMED-BY-DEVELOPER` | Developer | Developer / Owner | 2026-10-20 | **Y** |
| **ADR-18** | Phone-Only Identity & Email Elimination | Single non-nullable unique `phone` across users and customers; `email` column permanently dropped. | `CONFIRMED-BY-DEVELOPER` | Developer | Developer / Owner | 2026-10-22 | **Y** |
| **ADR-19** | Zero-Fee Native UPI Intent & Bank UTR Uniqueness | Zero third-party gateway fees (No Razorpay/Cashfree/2% MDR). NPCI native `upi://pay` deep-linking to KVB current account. `Payment.transactionRef @unique` prevents duplicate bank UTR claims. Customer claims verified by Desk Accountant under Maker != Checker. | `CONFIRMED-BY-DEVELOPER` | Developer | Developer / Owner | 2026-10-27 | **Y** |
| **ADR-20** | Backend-For-Frontend (BFF) & HttpOnly Cookie Architecture | Next.js 15 BFF proxy with HttpOnly cookies (`kc_access_token`, `kc_refresh_token`). Raw tokens eliminated from browser storage. | `CONFIRMED-BY-DEVELOPER` | Developer | Developer | 2026-11-10 | **Y** |
| **ADR-21** | Partner Identity Separation (SEC-A) | `isPartner: true` on `User` and JWT separates verified business partners from administrative Super Admin. Enforced on reversals, auctions, corrections, payouts, settlements, and defaulter removals. | `CONFIRMED-BY-DEVELOPER` | Swarm | Developer | 2026-11-13 | **Y** |
| **ADR-22** | Defaulter Removal Dual Control (SEC-B) | Two-partner workflow: Partner A requests removal (`PENDING_REMOVAL_APPROVAL`), Partner B reviews & approves (`REMOVED_DEF_3M`) or rejects with `maker != checker`. | `CONFIRMED-BY-DEVELOPER` | Swarm | Developer | 2026-11-13 | **Y** |
| **ADR-23** | Indian TRAI DLT SMS Exclusivity (Q34) | Automated notifications delivered strictly via Indian TRAI DLT SMS flow (MSG91). WhatsApp simulation channels purged; mobile push disabled in production Phase 1. | `CONFIRMED-BY-DEVELOPER` | Swarm | Developer | 2026-11-13 | **Y** |
| **ADR-24** | Session Vault, Client-Family Scoping & Durable Revocation | Dedicated PostgreSQL `Session` vault with device-family isolation (`WEB`, `MOBILE`, `DESKTOP`). Cryptographic session UUID (`sid`) binding prevents resurrection after replacement login. Invalidation on password reset, role demotion, and deactivation is durable and Redis-loss resilient. | `CONFIRMED-BY-DEVELOPER` | Security Architecture | Developer | 2026-11-15 | **Y** |
| **ADR-25** | Two-Stage Final Month Settlement & Engine-Level CHECK Constraints | Decoupled Month $N$ maturity settlement into Stage 1 (`prepare-final-settlement` Maker) and Stage 2 (`approve-final-settlement` Checker Partner, `maker != checker`). 8 PostgreSQL 17 engine-level CHECK constraints enforce dual control and financial integrity at storage level. | `CONFIRMED-BY-DEVELOPER` | Security Architecture | Developer | 2026-11-15 | **Y** |
| **ADR-26** | Flutter Android UI Phase 2 Deferral & Dart Core Preservation | Authoritative Nov 13, 2026 Owner Directive: Flutter Android mobile UI screens and APK/AAB packaging deferred to Phase 2 (Q2 2027). Phase 1 ships 100% Web Operations Portal + NestJS API + preserved Dart Core (`apps/mobile/lib/core/`) and `@kumaran/api-client`. | `DEFERRED` (Phase 2 — Q2 2027) | Business Owner | Owner / Developer | 2026-11-13 | **N** |

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

### ADR-10: Infrastructure, Hosting, S3 Storage & Commercial Ownership (`CONFIRMED-BY-DEVELOPER` / `OPEN`)
- **10A. Hosting & S3 Storage (`CONFIRMED-BY-DEVELOPER`)**:
  - **Hosting Model**: Single Flat-Fee Linux VPS (Ubuntu 24.04 LTS / Debian 12) from **any Linux VPS provider** (Hostinger Mumbai, DigitalOcean Bangalore, Hetzner, Linode, Vultr, Contabo, etc. at ~₹900–₹1,800/month flat) with fixed predictable billing.
  - **Zero Vendor Lock-In**: The entire production stack is containerized with standard Docker Compose v2. It has zero proprietary cloud dependencies and can be migrated to any other VPS host in under 15 minutes by transferring the database dump.
  - **Object Storage**: Universal S3-compatible object storage via **Cloudflare R2** (10 GB free tier with ₹0 egress bandwidth fees). All customer documents and bilingual PDF receipts use 15-minute presigned URLs (`HMAC-SHA256`) with zero public access.
- **10B. Ownership of Code, Cloud, and Domain (`OPEN`)**:
  - **Current Status (`CONFIRMED-BY-DEVELOPER`)**: The developer currently holds the source code, cloud hosting accounts, and domain registration.
  - **Future Handover (`OPEN`)**: Formal handover terms, intellectual property assignment, and ongoing maintenance responsibilities remain **OPEN** subject to future commercial agreement with Kumaran Finance.

---

### ADR-11: Physical Passbook Primacy, Statutory PDF Streaming & Clean Print Architecture (`CONFIRMED-BY-DEVELOPER`)
- **Ground Truth**: In Kumaran Finance operations, the customer's physical paper passbook (சீட்டு பாஸ்புக்) is their primary, legally acknowledged proof of installment payment. At doorstep collections, the agent enters the date, amount, and signs with a pen. Loose paper receipt slips are completely eliminated.
- **6-Column Passbook Ledger Standard**: The physical passbook and software digital passbook maintain identical columns:
  $$\text{Month \#} \mid \text{Payment Date (Cycle Start)} \mid \text{Paid Date (Doorstep)} \mid \text{Amount Paid } (I_{net}) \mid \text{Dividend } (Div) \mid \text{Total } (I_{base})$$
  Invariant: $\text{Amount Paid} + \text{Dividend} = \text{Total Base Installment}$ on every row.
- **Software Role**: Every transaction generates a sequential receipt number (`KC-REC-...`) solely for company ledger integrity (Form XXII Cash Book), evening handover reconciliation, and dispute backup.
- **Delivery & Asynchronous Queueing**: Counter payments (`POST /payments`) and field collections (`POST /collections/record`) immediately commit financial records to PostgreSQL and asynchronously enqueue a background receipt dispatch to BullMQ (`notification-queue` / `JOB_DISPATCH_PAYMENT_RECEIPT`, passing `paymentId` for async S3 PDF pre-rendering). In **Phase 1 production**, automated delivery runs strictly via **Indian TRAI DLT SMS** (`ADR-23`); Mobile App Push Notifications (FCM) are deferred to **Phase 2** alongside Flutter mobile UI (`ADR-26`).
- **BFF Blob PDF Delivery Architecture**: To guarantee zero popup blocker interceptions, zero cross-origin CORS barriers, and eliminate internal Docker hostname failures (`ERR_NAME_NOT_RESOLVED`), all statutory PDF downloads (Form XVII Minutes, Form XXI Passbooks, A5 Subscription Receipts, and Prize Vouchers) route directly through the Next.js BFF proxy (`/bff/api/v1/[...path]`) with unconditional `Cache-Control: private, no-store`. The web client consumes these endpoints via `@kumaran/api-client` (`parseAs: 'blob'`) and triggers instant browser downloads via transient DOM anchors (`triggerBlobDownload`) with deterministic object URL revocation.
- **High-Contrast `@media print` Stylesheet**: Browser printing (`window.print()`) for statutory registers (Form XXII Day Book, Form XXI Subscriber Ledgers, Form XVII Minutes) cleanly strips dark-mode dashboards, sidebars, topbar navigation, and buttons, rendering crisp black-on-white tables matching official A4/A5 paper records without chrome bleed.

---

### ADR-12: Notification Channels, OTP via SMS & Direct Phone Support (`CONFIRMED-BY-DEVELOPER`)
- **Authentication**: All user login OTPs (Partners, Staff, Customers) strictly use **Telecom DLT SMS** (Header: `KMRCHT`, Template `1407169823412093847`). OTP sessions are stored in **Redis** (`auth:otp:<phone>`) with a strict **300-second (5-minute) TTL**, SHA-256 hash security, and atomic Lua 3-attempt brute-force lockout (`F13`).
- **Operational Alerts (Aligned with `ADR-23` & `ADR-26`)**:
  - **Phase 1 Production**: Payments, upcoming auction reminders, post-auction dividend credits, and 3-month default warnings are delivered strictly via **Indian TRAI DLT SMS (MSG91)**.
  - **Phase 2 Target**: Free Mobile App Push Notifications (FCM) remain architecturally preserved and activate when Flutter Android mobile UI launches (`ADR-26`).
- **WhatsApp Business API**: Officially **Purged / Parked in V1** (`ADR-23`) to avoid third-party SaaS fees and Meta per-conversation charges.
- **Help Desk & Support**: Handled via **Direct Phone Calls** to Perundurai Head Office (`0424-2223333` / Partner mobile numbers).

---

### ADR-13: Customer Subscriptions & Ticket Limits (`CONFIRMED-BY-DEVELOPER`)
- **Cross-Chit Enrollment**: A single customer may join multiple different chit groups (`CONFIRMED-BY-DEVELOPER`).
- **Same-Chit Limit**: A single customer **CANNOT hold 2 or more tickets in the SAME chit group** (Max 1 ticket per customer per scheme, DB-enforced `@@unique([chitGroupId, customerId])`) (`CONFIRMED-BY-DEVELOPER`).
- **Data Model Terminology**:
  - **Customer**: The individual person / entity.
  - **Membership**: The subscription relationship connecting the customer to a specific Chit Group.
  - **Ticket**: The unique participation unit (1 to $N$) within that Chit Group.

---

### ADR-14: Prize Payout Modes & Zero Cash Block (`CONFIRMED-BY-DEVELOPER`)
- **Operational Reality**: Kumaran Finance predominantly disburses prize money in physical hard cash at the branch office, in line with long-standing local business practices in Perundurai and Erode district.
- **Architectural Decision**: The software must faithfully record operational truth. It **strictly enforces ZERO artificial cash blocks or limits**.
- **Payout Modes**: Supports `CASH`, `ACCOUNT_PAYEE_CHEQUE`, `BANK_TRANSFER_NEFT`, `BANK_TRANSFER_RTGS`, and `BANK_TRANSFER_IMPS`.
- **Zero Software Block & Tax Advisory**: Staff can disburse any authorized prize money amount (₹1,00,000, ₹2,00,000, ₹5,00,000, ₹10,00,000) in `CASH` without artificial blocking errors; vouchers exceeding ₹10,000 render statutory IT Act Section 40A(3) / 269ST advisories (`KFC-TAX-001`).

---

### ADR-15: Flexible Company Safety Proof & Collateral Checklist (`CONFIRMED-BY-DEVELOPER`)
- **Elimination of Property Docs**: Property documents and property deeds are completely removed from the standard workflow.
- **On-Demand / Non-Mandatory Security**: Submission of proof/collateral is evaluated case-by-case by Kumaran Finance and is **not mandatory** across the board.
- **Flexible Safety Proof Instruments**: If the company requests proof for company safety before prize disbursement, staff can record and attach any accepted instrument:
  1. Signed Chit Agreement with auction winner and nominee signatures.
  2. Signed Blank Cheque(s) with signatures from customer / guarantor.
  3. Promissory Note / Personal Guarantee.
  4. Other security proof accepted by branch management.
- **System Role**: Operational checklist and digital attachment repository on `AuctionWinner` (`isSecurityRequired: Boolean`, `securityType: String?`, `blankChequeDetails: String?`, `agreementSigned: Boolean`, `nomineeSigned: Boolean`, `securityDocS3Key: String?`).

---

### ADR-16: Lightweight Customer Intake & No Forced KYC (`CONFIRMED-BY-DEVELOPER`)
- **Operational Reality**: Kumaran Finance deals with known local subscribers (farmers, shopkeepers, weavers, and residents of Perundurai). Onboarding mirrors the physical paper notebook:
  1. Full Name (English and optional Tamil)
  2. Mobile Phone Number (10 digits)
  3. Address / Town
  4. Nominee Name & Relationship (mandatory guardian if minor)
- **No Forced Aadhaar / Document Uploads**:
  - Aadhaar number (stored strictly as `aadhaarLast4`), PAN card number, and identity document uploads are **strictly OPTIONAL** and never mandatory.
  - Known local subscribers are onboarded immediately upon entering their notebook details.
  - Zero forced document scans, photocopies, or third-party digital KYC barriers are required to create a customer, assign a ticket, or participate in auctions.

---

### ADR-17: Dual-Platform Architecture & Cross-Device Partner Parity (`CONFIRMED-BY-DEVELOPER`)
- **Operational Reality**: The 4 equal partners (Super Admin / Owners) run Kumaran Finance at the branch counter and on the move.
- **Phase 1 vs. Phase 2 Delivery (`ADR-26`)**:
  - **Phase 1 Active Production**: The **Next.js 15 Web Operations Portal (`apps/web/`)** is the active production interface for Partners, Desk Accountants, and CA Auditors.
  - **Phase 2 Deferred**: Flutter Android UI screens and APK packaging (`apps/mobile/`) are deferred to Phase 2 (Q2 2027) per the Nov 13, 2026 Owner Directive (`ADR-26`), while Dart Core (`apps/mobile/lib/core/`), `@kumaran/api-client`, and all mobile backend endpoints remain 100% preserved and tested.
- **Cross-Device Maker-Checker Enforcement**: The strict invariant `maker_user_id != checker_user_id` is enforced at the API and PostgreSQL levels completely agnostic of client devices (Web-to-Web, Mobile-to-Web, Web-to-Mobile, Mobile-to-Mobile).


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


---

### ADR-20: Backend-For-Frontend (BFF) & HttpOnly Cookie Architecture for Web Operations Portal (`CONFIRMED-BY-DEVELOPER`)

- **Status**: **ACCEPTED & IMPLEMENTED** (100% Verified)
- **Date**: 2026-11-10
- **Context**:
  1. The Web Operations Portal (`apps/web`) is used by office staff, branch managers, partners, and auditors to manage high-volume financial transactions.
  2. Storing raw JWT access and refresh tokens in browser `localStorage` exposes them to XSS exfiltration if any malicious third-party script runs in the window, and lacks native expiration.
  3. Furthermore, Next.js 15 Server Components and Edge Middleware (`middleware.ts`) execute on the server before client JavaScript hydrates. `localStorage` is inaccessible to the server, creating Flash of Unauthenticated Content (FOUC) and requiring client-side loading skeletons.
- **Decision & Architecture**:
  1. **Strict BFF Pattern**: The Next.js 15 web application acts as a Backend-For-Frontend proxy. Raw JWTs are strictly prohibited from client storage (`localStorage` / `sessionStorage`).
  2. **HttpOnly Cookie Storage**:
     - `kc_access_token`: `HttpOnly`, `SameSite=Lax`, `Secure` (production), `Path=/`, `Max-Age=900` (15 minutes).
     - `kc_refresh_token`: `HttpOnly`, `SameSite=Lax`, `Secure` (production), `Path=/`, `Max-Age=604800` (7 days).
     - `kc_session_active`: Non-HttpOnly flag (`Max-Age=604800`) for client UI awareness with zero secret credentials.
  3. **Zero FOUC Edge Middleware (`src/middleware.ts`)**: Next.js Edge Middleware inspects cookie presence on incoming requests to `/(dashboard)/*`. Unauthenticated users receive an immediate HTTP 307 redirect to `/login` with 0ms latency.
  4. **Transparent BFF API Proxying, SSE Pass-Through & Coalesced Refresh (`/bff/api/v1/[...path]`)**: Browser client calls target the dedicated Next.js BFF prefix (`/bff/api/v1/*`, keeping Nginx `/api/v1/*` routing unambiguous for Flutter mobile `Bearer` traffic); [`bff-api-proxy.ts`](file:///u:/Kumaran-finance/apps/web/src/lib/bff-api-proxy.ts) extracts `kc_access_token`, attaches `Authorization: Bearer <token>`, streams `text/event-stream` feeds live without buffering, deduplicates silent 401/expired refreshes across `/bff/api/v1/*` and `/api/auth/session` via [`bff-token-refresh.ts`](file:///u:/Kumaran-finance/apps/web/src/lib/bff-token-refresh.ts) paired with distributed coalescing and client-scoped revocation cutoffs (`auth:revoked_before:<userId>:<clientType>`) in NestJS `AuthService`, and expires cookies symmetrically (`Max-Age=0`, matching `SameSite` and `Secure`) on logout or terminal 401 failures.
  5. **Cross-Platform Decoupling**: The NestJS backend API (`apps/api`) remains 100% decoupled and accepts standard Bearer tokens, maintaining full architectural parity with the Flutter Mobile App (`apps/mobile`), which stores tokens in the Android Keystore (`flutter_secure_storage`).

---

### ADR-21: Verified Partner Identity Separation (`isPartner: true`) vs Administrative Super Admin (SEC-A) (`CONFIRMED-BY-DEVELOPER`)
- **Status**: **ACCEPTED & IMPLEMENTED** (100% Verified)
- **Date**: 2026-11-13
- **Operational Reality**: In Kumaran Finance, 4 equal partners own the business. The system role `SUPER_ADMIN` was previously overloaded between administrative IT privileges and genuine business partner authority. An administrative staff member or IT support user possessing `SUPER_ADMIN` must not have unilateral authority to authorize payouts, reverse payments, commit auctions, or remove subscribers.
- **Architectural Decision**:
  1. **Schema Column**: `User.isPartner Boolean @default(false)` added to Prisma schema and PostgreSQL database.
  2. **JWT Payload**: `isPartner` added to `JwtPayload` and propagated via `SanitizedUser` and `JwtStrategy`.
  3. **High-Impact Endpoints Guarded (`assertVerifiedPartner` — fail-closed `isPartner: true && isActive !== false`)**:
     - `POST /payments/:id/request-reversal`, `POST /payments/:id/approve-reversal`, `POST /payments/:id/reject-reversal`
     - `POST /auctions/:id/finalize`, `POST /auctions/:id/correction/request`, `POST /auctions/:id/correction/approve`, `POST /auctions/:id/correction/reject`
     - `PATCH /auctions/:auctionId/mark-filed-with-registrar` (enforced for `SUPER_ADMIN` callers)
     - `POST /disbursements/auction/:auctionId/authorize-payout`
     - `POST /disbursements/group/:chitGroupId/approve-final-settlement` and `POST /disbursements/group/:chitGroupId/final-settlement`
     - `POST /tickets/:id/remove-defaulter/request`, `POST /tickets/:id/remove-defaulter/approve`, `POST /tickets/:id/remove-defaulter/reject`, and `POST /tickets/:id/substitute`

---

### ADR-22: Defaulter Removal Two-Partner Dual Control (SEC-B) (`CONFIRMED-BY-DEVELOPER`)
- **Status**: **ACCEPTED & IMPLEMENTED** (100% Verified)
- **Date**: 2026-11-13
- **Operational Reality**: Forcibly removing a 3-month delinquent subscriber vacates a ticket and initiates ticket substitution. Under company partnership rules, a single partner cannot unilaterally remove a member without independent partner review.
- **Architectural Decision**:
  1. **State Machine Flow**: `DEFAULT_3_MONTHS` $\to$ `PENDING_REMOVAL_APPROVAL` $\to$ `REMOVED_DEF_3M`.
  2. **Maker Action**: Partner A submits removal request: `POST /tickets/:id/remove-defaulter/request` with `removalReason`. Sets `removalRequestedByUserId` and `removalRequestedAt`.
  3. **Checker Action**: Independent Partner B reviews and approves: `POST /tickets/:id/remove-defaulter/approve`. Backend strictly validates `ticket.removalRequestedByUserId !== checkerPartnerUserId` (`maker != checker`).
  4. **Rejection Reversion**: Partner B can reject removal via `POST /tickets/:id/remove-defaulter/reject`, restoring status to `DEFAULT_3_MONTHS`.
  5. **Q25 Financial Guardrail**: Financial damage settlement on removal remains **BLOCKED** and fails closed with `UNAPPROVED_SETTLEMENT_POLICY` pending legal counsel confirmation.

---

### ADR-23: Indian TRAI DLT SMS Exclusivity & Purge of Simulated Channels (Q34) (`CONFIRMED-BY-DEVELOPER`)
- **Status**: **ACCEPTED & IMPLEMENTED** (100% Verified)
- **Date**: 2026-11-13
- **Operational Reality**: Customer communication policy (Q34) confirms that automated messages are delivered strictly via official Indian TRAI DLT SMS flows. The WhatsApp Business API is not contracted, and previous simulation logs caused confusion. Flutter mobile app push notifications are deferred.
- **Architectural Decision**:
  1. **DLT SMS Exclusivity**: MSG91 HTTP flow API with registered 19-digit DLT template IDs is the sole automated delivery channel in production.
  2. **Purge of Fake Channels**: All WhatsApp simulation mock loggers and fake delivery channels are completely purged from `NotificationService`.
  3. **Financial Non-Blocking Guarantee**: Failure of external telecom gateway never blocks core financial database transactions. All SMS operations use non-blocking asynchronous dispatch with circuit breaker protection.

### ADR-24: Session Vault, Client-Family Scoping & Durable Revocation (`CONFIRMED-BY-DEVELOPER`)
- **Status**: **ACCEPTED & IMPLEMENTED** (100% Verified)
- **Date**: 2026-11-15
- **Operational Reality**: Field collection agents operate Android smartphones while partners and desk accountants use web workstations. Scoped logout or password change on a desktop must not terminate a field agent's active collection round, while admin password resets or role changes must durably revoke access without relying solely on volatile Redis TTLs.
- **Architectural Decision**:
  1. **PostgreSQL Session Vault**: Dedicated `Session` table indexed by `[userId, clientType]` and `[customerId, clientType]`. Refresh tokens are hashed and validated against this durable row.
  2. **Cryptographic Session Identity (`sid`) Binding**: Access and refresh tokens carry a cryptographic session UUID (`sid`). Invalidation assigns a new session identity, permanently rejecting previous tokens even if a subsequent login clears revocation flags.
  3. **Device-Family Scoped Status Caching**: Redis authorization cache keys are scoped to `user:status:${sub}:${clientType}`, preventing cross-family privilege leakage.
  4. **Next.js Edge Onboarding Journey**: Unauthenticated users with a temporary onboarding token are guided via HttpOnly cookies through `/onboarding` to set passwords, with direct Edge middleware route validation.

### ADR-25: Two-Stage Final Month Settlement & Engine-Level Maker-Checker Constraints (`CONFIRMED-BY-DEVELOPER`)
- **Status**: **ACCEPTED & IMPLEMENTED** (100% Verified)
- **Date**: 2026-11-15 (Hardened 2026-11-17/18)
- **Operational Reality**: Month $N$ maturity payout has no auction, but Guardrail 10 (Dual Control) strictly mandates that the person calculating the payout cannot be the sole approver. Furthermore, database-level constraints must reject self-approval and negative financial values even if application guards are bypassed.
- **Architectural Decision**:
  1. **Two-Stage Settlement Lifecycle (`CR-DISB-02`)**:
     - Stage 1: `POST /disbursements/group/:chitGroupId/prepare-final-settlement` (Maker staff calculates arrears, Month $N$ due deduction, 4% commission, and generates voucher snapshot).
     - Stage 2: `POST /disbursements/group/:chitGroupId/approve-final-settlement` (Checker Partner approves payout, enforcing `maker != checker` and verified partner identity `isPartner: true`). The legacy route `POST /disbursements/group/:chitGroupId/final-settlement` also enforces `{ requirePreparedSettlement: true }`, guaranteeing zero single-stage bypass.
  2. **8 PostgreSQL 17 Engine CHECK Constraints**:
     - `chk_payment_cash_handover_maker_checker` on `Payment`
     - `chk_auction_maker_checker` on `Auction` (covers both `COMPLETED` and `MINUTES_FILED`)
     - `chk_auction_non_negative_amounts` on `Auction`
     - `chk_auction_minutes_attendees` on `AuctionMinutes`
     - `chk_winner_maker_checker` on `AuctionWinner` (covers `VERIFIED_BY_MAKER`, `AUTHORIZED_BY_CHECKER`, and `DISBURSED`)
     - `chk_winner_positive_disbursed_amount` on `AuctionWinner`
     - `chk_reversal_maker_checker` on `PaymentReversal`
     - `chk_ticket_removal_maker_checker` on `SubscriberTicket`
     - All dual-control constraints are state-aware and hardened against SQL ternary logic NULL traps. Historical imported records use `isHistoricalEntry = true` to preserve legacy audit integrity without weakening live dual-control enforcement.

---

### ADR-26: Flutter Android UI Phase 2 Deferral & Dart Core Preservation (`DEFERRED` — Owner Directive)
- **Status**: **AUTHORITATIVE BUSINESS OWNER SCOPE EXCLUSION** (Phase 2 — Q2 2027)
- **Date**: 2026-11-13
- **Owner Directive**:
  > *"The entire Flutter mobile UI and Android application implementation is postponed. Do not build Flutter UI or Android APKs. Focus 100% on backend API integrity, web dashboard, PDF generation, security, and financial rules."*
- **Deferred Scope Inventory (`apps/mobile/`)**:
  | Component / Feature | Technology | Status | Target Phase |
  |---|---|:---:|:---:|
  | Android Field Agent Collection UI | Flutter / Dart | Preserved (No UI build) | Phase 2 (Q2 2027) |
  | Android Member Passbook App UI | Flutter / Dart | Preserved (No UI build) | Phase 2 (Q2 2027) |
  | Offline SQLite Sync UI | Drift / SQLite | Core & backend endpoints verified | Phase 2 |
  | Bluetooth Thermal Printer (ESC/POS) | Flutter | Architecture ready | Phase 2 |
  | Biometric Screen Lock / Android Keystore | Flutter | Deferred | Phase 2 |
  | Google Play Store Packaging (APK/AAB) | Android Gradle | Deferred | Phase 2 |
- **Preserved Backend & Dart Core Contracts**:
  1. `apps/mobile/lib/core/`: Typed 64-bit integer Rupee Dart models (`api_models.dart`), single-flight 401 refresh mutex (`AuthSessionManager`), and offline sync queue core remain 100% maintained and tested (`dart analyze` clean; 6/6 Dart test suites passing).
  2. `packages/api-client/`: Synchronized `@kumaran/api-client` TypeScript SDK.
  3. Preserved backend endpoints: Mobile Bearer auth (`/auth/mobile/*`, `/auth/refresh`), offline sync (`POST /collections/sync-offline-queue`), UPI intent (`GET /installments/:dueId/upi-intent`), and passbook (`GET /tickets/:ticketId/passbook`).
- **Phase 2 Reactivation Checklist**:
  - [ ] Upgrade Flutter SDK to latest stable release (`flutter upgrade`).
  - [ ] Regenerate Dart API models from `@kumaran/api-client` OpenAPI spec (`scripts/generate-dart-api.ts`).
  - [ ] Connect Drift offline database to SQLite storage.
  - [ ] Pair field agent handheld Android devices with Bluetooth thermal printers.
  - [ ] Configure production Firebase Cloud Messaging (FCM) credentials for Push alerts.
  - [ ] Conduct field agent training at Perundurai Head Office.
