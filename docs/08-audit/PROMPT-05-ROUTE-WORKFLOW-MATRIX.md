# PROMPT 05 — ROUTE & WORKFLOW VERIFICATION MATRIX
## Kumaran Chits — Frontend UI/UX, Routes, Personas & Workflow Audit

> **Audit Stage**: Stage 05 (Frontend UI/UX, Localization, Accessibility & Print Quality)  
> **Target Scope**: Next.js 15 App Router (`apps/web`), BFF API Proxy Routes, Client-Side RBAC, and 11 End-to-End Business Workflows  
> **Status**: COMPLETED — READ-ONLY AUDIT  
> **Date**: November 2026  
> **Operating Reality**: 1 physical branch office (Perundurai HO, Erode, Tamil Nadu), 4 equal partners, 2-3 field collection agents, handwritten paper notebooks migration.

---

## 1. Complete Route Inventory & Persona Authorization Matrix

The Kumaran Chits web application uses Next.js 15 App Router with Edge Middleware ([`apps/web/src/middleware.ts`](file:///u:/Kumaran-finance/apps/web/src/middleware.ts)), typed client SDK ([`@kumaran/api-client`](file:///u:/Kumaran-finance/packages/api-client)), and longest-prefix route permission guards defined in [`apps/web/src/lib/route-permissions.ts`](file:///u:/Kumaran-finance/apps/web/src/lib/route-permissions.ts).

### Legend
- **SA**: Super Admin / Foreman / Partner (`SUPER_ADMIN`, `CHIT_FOREMAN`)
- **BM**: Branch Manager (`BRANCH_MANAGER`)
- **AC**: Desk Accountant / Cashier (`ACCOUNTANT`, `CASHIER`)
- **AG**: Field Collection Agent (`AGENT`)
- **AU**: Independent Auditor / Chartered Accountant (`AUDITOR`)
- **CU**: Registered Customer / Subscriber (`CUSTOMER`)

| Route Path | Page Title / Purpose | Allowed Roles (RBAC) | Primary Backend Endpoints | Evidence Status |
|---|---|---|---|---|
| `/(auth)/login` | Staff & Partner Secure Login | Public (Unauthenticated) | `POST /api/auth/login`, `POST /api/auth/totp` | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/(auth)/reset-password` | Mandatory First-Login Password Change | All Authenticated Staff | `POST /api/v1/users/change-password` | `VERIFIED IN CODE` / `TEST EXECUTED — PASS` |
| `/` | Executive Dashboard & Financial Overview | SA, BM, AC, AU | `GET /api/v1/reports/kpis`, `GET /api/v1/collections/today` | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/schemes` | Chit Schemes Master Registry | SA, BM, AC, AU | `GET /api/v1/chits` | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/schemes/new` | Fresh Chit Group Creation Wizard | SA, BM | `POST /api/v1/chits` | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/schemes/onboard` | Physical Notebook Mid-Cycle Onboarding | SA, BM | `POST /api/v1/chits/onboard-notebook` | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/schemes/[id]` | Scheme Details, Schedule & Status | SA, BM, AC, AU | `GET /api/v1/chits/{id}`, `GET /api/v1/chits/{id}/schedule` | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/schemes/[id]/edit` | Edit Scheme Parameters (Draft Only) | SA, BM | `PATCH /api/v1/chits/{id}` | `VERIFIED IN CODE` |
| `/schemes/[id]/enroll` | Ticket Enrollment & Allocation Console | SA, BM, AC | `POST /api/v1/chits/{id}/tickets` | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/schemes/[id]/members` | Subscriber Roster & Ticket Registry | SA, BM, AC, AU | `GET /api/v1/chits/{id}/subscribers` | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/schemes/[id]/substitute` | Defaulter Ticket Substitution Wizard | SA, BM | `POST /api/v1/chits/{id}/substitute` | `VERIFIED IN CODE` |
| `/customers` | Subscriber Directory & Search | SA, BM, AC, AG, AU | `GET /api/v1/customers` | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/customers/new` | Bilingual Subscriber Intake Form | SA, BM, AC, AG | `POST /api/v1/customers`, `POST /api/v1/customers/{id}/nominees` | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/customers/[id]` | Subscriber 360° Profile & Ledgers | SA, BM, AC, AG, AU | `GET /api/v1/customers/{id}`, `GET /api/v1/customers/{id}/tickets` | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/customers/[id]/edit` | Update Subscriber & Nominee Info | SA, BM, AC | `PATCH /api/v1/customers/{id}` | `VERIFIED IN CODE` |
| `/customers/[id]/passbook` | Digital Subscriber Passbook View | SA, BM, AC, AG, AU, CU | `GET /api/v1/customers/{id}/passbook` | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/auctions` | Monthly Auction Central Hub | SA, BM, AC, AU | `GET /api/v1/auctions`, `GET /api/v1/chits/active` | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/auctions/[id]` | Auction Execution, Bid Entry & Lot Draw | SA, BM | `GET /api/v1/auctions/{id}`, `POST /api/v1/auctions/{id}/bids`, `POST /api/v1/auctions/{id}/tie-break` | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/collections` | Daily Counter Collection Desk | SA, BM, AC, AG | `GET /api/v1/installments/unpaid`, `POST /api/v1/payments` | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/collections/claim` | Unallocated Payment Claims Console | SA, BM, AC | `GET /api/v1/payments/unallocated`, `POST /api/v1/payments/{id}/claim` | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/collections/handover` | Field Agent Cash Handover & Settlement | SA, BM, AC, AG | `GET /api/v1/collections/agent-summary`, `POST /api/v1/collections/handover` | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/disbursements` | Prize Payout Authorization Queue | SA, BM, AC | `GET /api/v1/disbursements` | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/disbursements/[id]` | Payout Safety Checklist & Release | SA, BM | `GET /api/v1/disbursements/{id}`, `POST /api/v1/disbursements/{id}/authorize`, `POST /api/v1/disbursements/{id}/release` | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/reversals` | Payment Reversals Dual-Control Desk | SA, BM, AC | `GET /api/v1/reversals`, `POST /api/v1/reversals`, `POST /api/v1/reversals/{id}/approve` | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/reports` | Financial & Statutory Reports Index | SA, BM, AC, AU | Static index / metadata | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/reports/cash-book` | Daily Cash Receipts & Disbursements Daybook | SA, BM, AC, AU | `GET /api/v1/reports/cash-book` | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/reports/defaulters` | Consecutive Unpaid Defaulters Registry | SA, BM, AC, AU | `GET /api/v1/reports/defaulters` | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/reports/form-xvii` | Form XVII Minutes of Auction (Tamil Nadu Chit Funds Rules) | SA, BM, AU | `GET /api/v1/reports/form-xvii/{auctionId}` | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/reports/form-xxi` | Form XXI Ledger of Foreman & Chit Subscribers | SA, BM, AU | `GET /api/v1/reports/form-xxi/{chitGroupId}` | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/reports/form-xxii` | Form XXII Chit Balance Sheet & Statutory Statement | SA, BM, AU | `GET /api/v1/reports/form-xxii/{chitGroupId}` | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/reports/ledger` | Subscriber Individual Ledger Statement | SA, BM, AC, AU | `GET /api/v1/reports/subscriber-ledger/{ticketId}` | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/instructions` | Operating SOPs & Formula Cheat-Sheets | All Roles | Localized Static Rules Engine (`next-intl`) | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/branches` | Head Office & Branch Registry | SA, BM | `GET /api/v1/branches`, `POST /api/v1/branches` | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/users` | Staff Directory & RBAC Roles Assignment | SA, BM | `GET /api/v1/users`, `POST /api/v1/users`, `PATCH /api/v1/users/{id}/roles` | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/admin/jobs` | Redis & BullMQ Background Queue Telemetry | SA only | `GET /api/v1/jobs/metrics` | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/print/receipt/[id]` | A5 Bilingual Subscription Payment Receipt | SA, BM, AC, AG | `GET /api/v1/payments/{id}/receipt` | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |
| `/print/voucher/[id]` | Prize Money Payout Voucher | SA, BM | `GET /api/v1/disbursements/{id}/voucher` | `VERIFIED IN BROWSER` / `TEST EXECUTED — PASS` |

---

## 2. Web BFF API Proxy Routes Inventory

The Next.js backend-for-frontend (`apps/web/src/app/api/`) implements safe, HttpOnly cookie-based session management without exposing raw JWTs to client-side JavaScript.

| BFF API Route | Purpose | Upstream API Target | Security Headers / Mechanism | Evidence Status |
|---|---|---|---|---|
| `POST /api/auth/login` | Staff authentication & cookie issuance | `POST /api/v1/auth/login` | Sets `HttpOnly`, `SameSite=Lax`, `Secure` (production) cookies: `kc_access_token`, `kc_refresh_token` | `VERIFIED IN CODE` / `TEST EXECUTED — PASS` |
| `POST /api/auth/totp` | Complete 2FA TOTP step | `POST /api/v1/auth/totp/verify` | Updates session cookies with fully authenticated claims | `VERIFIED IN CODE` / `TEST EXECUTED — PASS` |
| `POST /api/auth/logout` | Session revocation | `POST /api/v1/auth/logout` | Clears cookies with `maxAge: 0` and invalidates Redis session family | `VERIFIED IN CODE` / `TEST EXECUTED — PASS` |
| `GET /api/auth/me` | Current staff profile hydration | `GET /api/v1/auth/me` | Injects Bearer token from `kc_access_token` cookie into upstream NestJS header | `VERIFIED IN CODE` / `TEST EXECUTED — PASS` |
| `POST /api/auth/refresh` | Silent access token refresh | `POST /api/v1/auth/refresh` | Injects `kc_refresh_token` cookie, rotates session token without UI interruption | `VERIFIED IN CODE` / `TEST EXECUTED — PASS` |

---

## 3. Detailed Audit of the 11 Core Financial Business Workflows

### Workflow 1: Staff Authentication, 2FA TOTP & Session Lifecycle
- **Trigger**: Staff visits `/login`.
- **UI Mechanism**: [`apps/web/src/components/auth/login-form.tsx`](file:///u:/Kumaran-finance/apps/web/src/components/auth/login-form.tsx).
- **Validation**: Indian mobile number regex (10 digits), password min 8 characters.
- **2FA TOTP**: When staff has TOTP enabled, login returns `totpRequired: true`, opening [`totp-form.tsx`](file:///u:/Kumaran-finance/apps/web/src/components/auth/totp-form.tsx).
- **Inactivity Timeout**: 15 minutes of inactivity prompts warning dialog and executes graceful logout.
- **Audit Finding**: `PASS`. E2E suite `01-auth-lifecycle.e2e.spec.ts` verifies invalid password rejection, valid phone login, session persistence across reloads, and logout cookie clearing.

### Workflow 2: Chit Scheme Creation & Lifecycle Management
- **Trigger**: Partner visits `/schemes/new`.
- **UI Mechanism**: [`apps/web/src/components/schemes/scheme-form.tsx`](file:///u:/Kumaran-finance/apps/web/src/components/schemes/scheme-form.tsx).
- **Validation**:
  - Chit Value ($V$): strictly positive whole integer.
  - Duration ($N$): strictly positive integer months (standard 20, 25, 40).
  - Commission: permanently locked at 4.00% (ADR-04).
  - Ceiling Discount: fixed at 25.00% (1/4 ceiling).
- **Audit Finding**: `PASS`. Form prevents editing locked parameters once created.

### Workflow 3: Physical Notebook Mid-Cycle Onboarding
- **Trigger**: Partner migrates an active handwritten paper notebook via `/schemes/onboard`.
- **UI Mechanism**: [`apps/web/src/components/schemes/notebook-master-form.tsx`](file:///u:/Kumaran-finance/apps/web/src/components/schemes/notebook-master-form.tsx).
- **Functionality**: Captures past completed auction months, past winning tickets, past discounts, and historical subscriber payment tallies.
- **Audit Finding**: `PASS`. Enables zero-downtime onboarding from paper records without corrupting future dividend math.

### Workflow 4: Subscriber Registration & KYC Intake
- **Trigger**: Staff registers customer at `/customers/new`.
- **UI Mechanism**: [`apps/web/src/components/customers/customer-intake-form.tsx`](file:///u:/Kumaran-finance/apps/web/src/components/customers/customer-intake-form.tsx).
- **Statutory Fields**:
  - Full Name in English and Tamil (`fullNameTamil`).
  - 10-digit primary mobile phone (mandatory).
  - Address Line 1, City (default 'Perundurai'), PIN Code (default '638052').
  - Optional Nominee details (Name, Relationship, Phone, Aadhaar last-4).
  - Optional PAN (regex `[A-Z]{5}[0-9]{4}[A-Z]{1}`) and Aadhaar last-4 (strictly 4 digits; full 12 digits rejected).
- **Audit Finding**: `PASS`. E2E tests and manual validation confirm strict client-side validation preventing invalid tax identifiers.

### Workflow 5: Ticket Allocation & 1-Ticket Limit Enforcement
- **Trigger**: Staff assigns tickets at `/schemes/[id]/enroll`.
- **UI Mechanism**: [`apps/web/src/components/schemes/assign-ticket-dialog.tsx`](file:///u:/Kumaran-finance/apps/web/src/components/schemes/assign-ticket-dialog.tsx).
- **Guard**: Submitting a customer who already holds a ticket in the same chit group triggers immediate rejection from backend `@@unique([chitGroupId, customerId])`.
- **Company Ticket**: Month 1 ticket 1 is permanently allocated to Kumaran Finance (`isCompanyTicket = true`).
- **Audit Finding**: `PASS`. E2E test `02-schemes-onboard.e2e.spec.ts` verifies ticket allocation integrity.

### Workflow 6: Monthly Auction Execution & Physical Lot Draw (ADR-06 Option A)
- **Trigger**: Foreman conducts auction at `/auctions/[id]`.
- **UI Mechanism**: [`apps/web/src/components/auctions/tie-break-modal.tsx`](file:///u:/Kumaran-finance/apps/web/src/components/auctions/tie-break-modal.tsx) and live auction console.
- **Invariants Enforced**:
  - Defaulters (unpaid current month installment) are strictly greyed out and disqualified from bidding.
  - Discount is capped at $V / 4$ (25.00%).
  - In Month 1 and Month $N$, no auction takes place (Month 1 goes to company, Month $N$ settled at 4% commission).
  - Physical Lot Draw (Option A): If multiple subscribers bid 25% ceiling, Foreman assigns physical token numbers (1, 2, 3...), draws paper lot physically before members, and inputs the winning ticket into the modal. Zero software lottery draw.
- **Audit Finding**: `PASS`. Verified in code and visual test audit.

### Workflow 7: Daily Counter Payment Collection & Instant A5 Receipt
- **Trigger**: Cashier collects payment at `/collections`.
- **UI Mechanism**: [`apps/web/src/components/collections/counter-payment-modal.tsx`](file:///u:/Kumaran-finance/apps/web/src/components/collections/counter-payment-modal.tsx).
- **Invariants Enforced**:
  - Payment amount is locked strictly to `netPayableAmount` ($I_{net} = I_{base} - Div$).
  - Single discrete payment: zero double payments, zero partial payments, zero advance balances.
  - Idempotency key generated per session and passed in header and body.
  - Upon success, pops open bilingual A5 receipt modal with 1-click print and PDF download.
- **Audit Finding**: `PASS`. Tested in Playwright suite `06-counter-payments.e2e.spec.ts`.

### Workflow 8: End-of-Day Field Agent Cash Handover & Dual Settlement
- **Trigger**: Field agent returns to Perundurai branch office at `/collections/handover`.
- **UI Mechanism**: [`apps/web/src/components/collections/cash-settlement-voucher-modal.tsx`](file:///u:/Kumaran-finance/apps/web/src/components/collections/cash-settlement-voucher-modal.tsx).
- **Dual Sign**: Agent selects cashier, verifies total cash collected vs receipts issued, and submits handover. Cashier verifies physical currency notes and confirms receipt.
- **Audit Finding**: `PASS`. Verified in Playwright suite `07-cash-handover.e2e.spec.ts`.

### Workflow 9: Prize Money Disbursement & Safety Checklist
- **Trigger**: Partner authorizes and releases prize money at `/disbursements/[id]`.
- **UI Mechanism**: [`apps/web/src/components/disbursements/disbursement-auth-modal.tsx`](file:///u:/Kumaran-finance/apps/web/src/components/disbursements/disbursement-auth-modal.tsx).
- **Invariants Enforced**:
  - Verification checklist: Agreement signed, Nominee consent signed, signed blank cheques recorded. Property documents completely eliminated (ADR-15).
  - Maker-Checker separation: Authorizing partner (`checker_user_id`) cannot be the user who conducted the auction or filed the request (`maker_user_id`).
- **Audit Finding**: `VERIFIED IN CODE`. Discovered FIN-01/DB-001 gap (backend DTO accepts custom amount without enforcing `<= prizeMoney`), but frontend UI correctly binds to calculated net prize money.

### Workflow 10: Payment Reversals Dual Control (Maker != Checker)
- **Trigger**: Staff requests payment reversal at `/reversals`.
- **UI Mechanism**: [`apps/web/src/components/reversals/reversal-request-modal.tsx`](file:///u:/Kumaran-finance/apps/web/src/components/reversals/reversal-request-modal.tsx) and approval dialogs.
- **Invariants Enforced**:
  - Cashier requests reversal with mandatory reason.
  - Partner/Foreman reviews and approves.
  - Backend strictly rejects if `maker_user_id == checker_user_id`.
  - Reversal immediately resets installment due status to `UNPAID`.
- **Audit Finding**: `PASS`. Verified in Playwright suite `08-payment-reversals.e2e.spec.ts`.

### Workflow 11: Statutory Reports & Print Workflows
- **Trigger**: Auditor or Partner visits `/reports` or `/print/receipt/[id]`.
- **UI Mechanism**: Form XVII, Form XXI, Form XXII tables, and print templates.
- **Invariants Enforced**:
  - Form XVII displays exact auction minutes with bid discount, commission, dividend per subscriber, and attendee signatures.
  - Print template renders at exact 148mm (A5) width with bilingual numbers in words (Tamil & English via `RupeeWords`).
  - Reversed receipts display diagonal "CANCELLED / REVERSED" watermark.
- **Audit Finding**: `PASS`. Visual crawl and print template code inspection confirm 100% adherence.
