# PROMPT 05 — FORMS, VALIDATION & PRINT/PDF WORKFLOW REVIEW
## Kumaran Chits — Interactive Forms, Validation Architecture, A5 Receipts & Statutory Prints

> **Audit Stage**: Stage 05 (Frontend UI/UX, Localization, Accessibility & Print Quality)  
> **Target Scope**: Form Validation, Idempotency Protection, A5 Bilingual Receipts, Payout Vouchers, and Statutory TN Chit Forms (XVII, XXI, XXII)  
> **Status**: COMPLETED — READ-ONLY AUDIT  
> **Date**: November 2026  
> **Key References**: [`apps/web/src/components/print/receipt-print-template.tsx`](file:///u:/Kumaran-finance/apps/web/src/components/print/receipt-print-template.tsx), [`apps/web/src/components/print/voucher-print-template.tsx`](file:///u:/Kumaran-finance/apps/web/src/components/print/voucher-print-template.tsx), [`apps/web/src/components/collections/counter-payment-modal.tsx`](file:///u:/Kumaran-finance/apps/web/src/components/collections/counter-payment-modal.tsx)

---

## 1. Frontend Form Validation Architecture

The Kumaran Chits web application adopts a dual-tier validation strategy:
1. **Client-Side Pre-Flight Validation**: Immediate, zero-latency validation on user input before network submission, providing instantaneous visual feedback.
2. **Backend DTO Validation**: NestJS `class-validator` and `class-transformer` decorators in `apps/api/src/` as the ultimate security gatekeeper.

### Form-by-Form Validation Audit

| Form Component | Validation Mechanism | Field Guards & Business Constraints | Idempotency Protection | Status |
|---|---|---|---|---|
| **Subscriber Intake** ([`customer-intake-form.tsx`](file:///u:/Kumaran-finance/apps/web/src/components/customers/customer-intake-form.tsx)) | React state + explicit regex guards | Full Name $\ge 2$ chars; Phone `/^\d{10}$/`; PIN `/^\d{6}$/`; PAN `/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/`; Aadhaar strictly last 4 digits `/^\d{4}$/`. | N/A (Standard entity creation) | `VERIFIED IN CODE` / `TEST EXECUTED — PASS` |
| **Chit Scheme Creation** ([`scheme-form.tsx`](file:///u:/Kumaran-finance/apps/web/src/components/schemes/scheme-form.tsx)) | React state + math invariants | Chit value $> 0$; Duration $> 0$; Commission permanently locked at 4.00%; Ceiling discount fixed at 25.00%. | N/A (Admin configuration) | `VERIFIED IN CODE` / `TEST EXECUTED — PASS` |
| **Physical Notebook Migration** ([`notebook-master-form.tsx`](file:///u:/Kumaran-finance/apps/web/src/components/schemes/notebook-master-form.tsx)) | Tabular grid state with keyboard navigation | 400-cell matrix representing past completed auctions, winning tickets, discounts, and payment tallies. | Guarded against duplicate scheme activation | `VERIFIED IN CODE` / `TEST EXECUTED — PASS` |
| **Counter Payment Collection** ([`counter-payment-modal.tsx`](file:///u:/Kumaran-finance/apps/web/src/components/collections/counter-payment-modal.tsx)) | Controlled component + TanStack Query mutation | Due selection locked to discrete net installment amount ($I_{net}$); zero double payments; payment method selector (`CASH`, `UPI`, `CHEQUE`, `BANK_TRANSFER`). | **Enforced via `useIdempotentAction()`** (UUID passed in `Idempotency-Key` header and body) | `VERIFIED IN CODE` / `TEST EXECUTED — PASS` |
| **Option A Tie-Break Draw** ([`tie-break-modal.tsx`](file:///u:/Kumaran-finance/apps/web/src/components/auctions/tie-break-modal.tsx)) | Form state + validation guards | Minimum 2 tied tickets required; physical token numbers assigned; winning ticket manually entered by staff based on paper token draw; witness names recorded. | Prevents duplicate auction finalization | `VERIFIED IN CODE` / `TEST EXECUTED — PASS` |
| **Prize Payout Authorization** ([`disbursement-auth-modal.tsx`](file:///u:/Kumaran-finance/apps/web/src/components/disbursements/disbursement-auth-modal.tsx)) | Checklist state validation | Mandatory toggles: Agreement signed, Nominee consent signed; optional blank cheques count and bank details recorded; Maker $\ne$ Checker verified. | Atomic transaction on backend | `VERIFIED IN CODE` / `TEST EXECUTED — PASS` |
| **Payment Reversal Request** ([`reversal-request-modal.tsx`](file:///u:/Kumaran-finance/apps/web/src/components/reversals/reversal-request-modal.tsx)) | Textarea + reason validation | Mandatory reason string ($\ge 10$ chars); Maker $\ne$ Checker validation; checks if auction already occurred. | Guarded by backend transaction | `VERIFIED IN CODE` / `TEST EXECUTED — PASS` |
| **Staff & Branch Setup** ([`user-form.tsx`](file:///u:/Kumaran-finance/apps/web/src/components/users/user-form.tsx), [`branch-form.tsx`](file:///u:/Kumaran-finance/apps/web/src/components/branches/branch-form.tsx)) | Input guards | Phone 10 digits; password min 8 chars; branch name and address required. | Standard entity creation | `VERIFIED IN CODE` / `TEST EXECUTED — PASS` |

---

## 2. A5 Bilingual Subscription Payment Receipt (`print/receipt/[id]`)

The subscription payment receipt represents the primary legal instrument given to rural subscribers upon paying their monthly chit installment. It is governed by **ADR-11** and Tamil Nadu Chit Funds Rules.

### Visual & Physical Print Specifications
- **Physical Canvas**: Formatted strictly for **A5 Paper (148mm $\times$ 210mm)**, either portrait slip or pre-printed counter voucher.
- **Screen View vs Print Output**:
  - Screen displays floating top action bar with "Back to Collections", "Print A5", and "Download PDF".
  - Floating controls and navigation are hidden during print via CSS class `print:hidden`.
  - Margins and background colors are optimized for black-and-white thermal and laser office printers.
- **Bilingual Content Breakdown**:
  1. **Header & Letterhead**: Company Name ("KUMARAN FINANCE / குமரன் ஃபைனான்ஸ்"), Perundurai branch address, phone number.
  2. **Receipt Metadata**: Receipt Number (e.g. `KC-REC-00042`), Date & Time of collection, Payment Mode (`CASH` / `UPI` with reference ID).
  3. **Chit & Ticket Particulars**: Chit Group Code (e.g. `KCA`), Month Number / Total Months (e.g. `3 / 20`), Ticket Number (e.g. `#14`).
  4. **Subscriber Identification**: Full Name in English and Tamil, registered phone number, address.
  5. **Financial Breakdown Table**:
     - Base Installment: ₹25,000
     - Less Dividend Credit: - ₹4,500
     - Net Payable Amount: ₹20,500
     - Total Amount Paid: ₹20,500 (highlighted in bold monospace)
  6. **Rupee Words**: Rendered in both Tamil (*இருபதாயிரத்து ஐந்நூறு ரூபாய் மட்டும்*) and English (*Twenty Thousand Five Hundred Rupees Only*) via `RupeeWords`.
  7. **Signatures**: Cashier / Collector name and designated line for authorized signature.
  8. **ADR-11 Statutory Disclaimers**: Explicit notice: *"This computer-generated receipt is a temporary counter voucher. The physical subscriber passbook maintained at the branch office remains the official financial ground truth."*
- **Reversal Status**:
  - If `isReversed === true`, a prominent diagonal 45-degree watermark with dashed border renders across the receipt canvas displaying: `"CANCELLED / REVERSED — பரிவர்த்தனை ரத்து செய்யப்பட்டுள்ளது"`.
- **Audit Assessment**: `VERIFIED IN CODE` / `TEST EXECUTED — PASS` (Verified in Playwright test `06-counter-payments.e2e.spec.ts`).

---

## 3. Prize Money Disbursement Voucher (`print/voucher/[id]`)

Governed by Invariant 9 and ADR-15, the Prize Money Disbursement Voucher serves as the primary voucher signed by the prized subscriber upon collecting their net prize payout.

### Voucher Specifications & Safety Checklist
- **Layout**: Standard A4 or A5 Landscape voucher canvas.
- **Financial Fields**:
  - Chit Value ($V$): e.g. ₹5,00,000
  - Winning Bid Discount ($D$): e.g. ₹1,25,000 (verified $\le 25\%$ ceiling)
  - Net Prize Money Disbursed: ₹3,75,000
  - Amount in Words: Rendered in Tamil and English.
- **Company Safety Proof Checklist (ADR-15)**:
  - Checkbox: Registered Chit Agreement signed by Prized Subscriber.
  - Checkbox: Nominee / Family Guarantor consent signed.
  - Checkbox: Signed Blank Security Cheques recorded (Bank name, cheque numbers). Property documents explicitly marked NOT REQUIRED.
- **Dual Verification Signatures**:
  - Verified By: Maker user name (Desk Accountant).
  - Authorized By: Checker user name (Partner / Super Admin).
  - Receiver's Signature: Marked for prized subscriber physical signature.

---

## 4. Statutory Report Workflows (Form XVII, XXI, XXII)

The Tamil Nadu Chit Funds Rules, 1984 require foremen to maintain and file specific statutory registers with the Registrar of Chits:

### 1. Form XVII — Minutes of Auction (`/reports/form-xvii`)
- **Statutory Purpose**: Record of auction proceedings filed within 14 days of each auction.
- **Data Rendered**:
  - Chit Group Code, Month Number, Date and Time of Auction.
  - List of eligible participating subscribers.
  - Bid progression and winning bid discount.
  - Foreman commission deducted (strictly 4.00%).
  - Total dividend pool and net dividend distributed per ticket.
  - Signatures of Foreman and minimum 2 attending subscribers.
- **Status**: Implemented in [`apps/web/src/components/reports/form-xvii-viewer.tsx`](file:///u:/Kumaran-finance/apps/web/src/components/reports/form-xvii-viewer.tsx).

### 2. Form XXI — Ledger of Foreman & Chit Subscribers (`/reports/form-xxi`)
- **Statutory Purpose**: Comprehensive ledger tracking installments due, dividends credited, and amounts paid for every ticket month-by-month.
- **Status**: Implemented in [`apps/web/src/components/reports/form-xxi-table.tsx`](file:///u:/Kumaran-finance/apps/web/src/components/reports/form-xxi-table.tsx).

### 3. Form XXII — Chit Balance Sheet (`/reports/form-xxii`)
- **Statutory Purpose**: Annual balance sheet of the chit group detailing assets, liabilities, subscriber balances, and foreman commission accrued.
- **Status**: Implemented in [`apps/web/src/components/reports/form-xxii-table.tsx`](file:///u:/Kumaran-finance/apps/web/src/components/reports/form-xxii-table.tsx).

---

## 5. Discovered Gaps & Cross-Stage Continuity Findings

During the audit of forms and print workflows, we cross-referenced findings from Prompt 02, 03, and 04:

1. **Reversed PDF Stream Gap (FIN-03 / DB-002)**:
   - *Finding*: While the web HTML/CSS print template ([`receipt-print-template.tsx`](file:///u:/Kumaran-finance/apps/web/src/components/print/receipt-print-template.tsx#L121)) dynamically renders the diagonal "CANCELLED / REVERSED" watermark, the server-side PDF generation endpoint (`GET /api/v1/payments/{id}/pdf`) generates static PDF streams from raw data without watermarking cancelled payments.
   - *Impact*: Downloading a PDF of a reversed transaction via the direct API endpoint could produce an unwatermarked voucher if not intercepted by the BFF.
   - *Status*: Carried over for Stage 06 remediation.
2. **Payout Over-Disbursement Guard (FIN-01 / DB-001)**:
   - *Finding*: The web frontend form sets the disbursement amount to `netPrizeMoney`, but backend DTO accepts arbitrary `disbursedAmount` without asserting `disbursedAmount <= prizeMoney`.
   - *Impact*: Client UI is safe, but backend API requires strict validation.
   - *Status*: Carried over for Stage 06 remediation.
