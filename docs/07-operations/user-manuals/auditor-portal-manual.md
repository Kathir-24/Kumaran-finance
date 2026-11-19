# Kumaran Chits — Independent Auditor Portal Manual

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance** (Head Office: Perundurai, Erode, Tamil Nadu)  
> **Target Persona**: **Independent Statutory Auditor / Chartered Accountant (CA)** (`AUDITOR`)  
> **Primary Platform**: **Web Portal (`apps/web/`)** (Strictly Read-Only Forensic Console)  
> **Statutory Framework**: **Chit Funds Act, 1982** & **Tamil Nadu Chit Funds Rules, 1984**  
> **Security Guard**: **Global Read-Only Isolation**; all state mutations (`POST`, `PUT`, `PATCH`, `DELETE`) are permanently blocked with `HTTP 403 Forbidden`.

---

## 1. Operating Reality & Professional Mandate

The **Independent Auditor** is a licensed **Chartered Accountant (CA)** appointed to conduct quarterly, annual, and statutory compliance audits for Kumaran Finance:
- Reviewing financial integrity on behalf of the company partners and the **Chit Registrar** (Government of Tamil Nadu).
- Operating under a professional mindset of **Forensic Professional Skepticism**: verifying mathematical proofs, physical vouchers, and tamper-evident digital records.
- Verifying the 4 Core Invariants:
  1. Did the Foreman take more than 4.00% commission?
  2. Did any auction bid exceed the 25% (1/4) statutory ceiling?
  3. Were dividends shared equally among all members (including auction winners)?
  4. Was Maker-Checker segregation enforced on all sensitive actions without self-approval?

```mermaid
flowchart TD
    subgraph AUDITOR_CONSOLE ["Independent Auditor Forensic Workspace (Strictly Read-Only)"]
        CA["Chartered Accountant (CA)\nAssigned Role: AUDITOR"]
        CA --> T1["1. Mathematical Invariant Verification\n(D = Cf + Div_total to the exact rupee)"]
        CA --> T2["2. Statutory Registers\n(Form XVII Minutes, Form XXI Passbooks, Form XXII Cash Book)"]
        CA --> T3["3. Maker-Checker Segregation Audit\n(Form XXII/Day Book offsets, pending-approvals & CA-certified AuditLog extracts)"]
        CA --> T4["4. Document Scrutiny via Presigned S3\n(Inspects signed agreements & blank cheques via read-only API / vouchers)"]
        CA --> T5["5. Statutory Boundary Verification\n(Guardrail 11: Audit Logs & BullMQ queues strictly Super Admin isolated)"]
    end
```

---

## 2. Audit Workflow Index & Action Diagrams

| Section | Audit Procedure | Statutory Scope | Primary Interface |
|---|---|:---:|:---:|
| **§3** | Auditor 2FA Web Login & Workspace Orientation | Access Control | Web Portal (`POST /api/v1/auth/web/login`) |
| **§4** | Forensic Verification of the Conservation Invariant | Chit Math Invariant | Web Portal (`GET /api/v1/auctions/:id`) |
| **§5** | Form XXII Daily Cash Book Audit Against Bank Statements | Cash & Banking | Web Portal (`GET /api/v1/reports/form-xxii`) |
| **§6** | Sampling Prize Disbursements & Presigned S3 Cheques | Safety Proofs | Read-Only API (`GET /api/v1/disbursements/...`) & `/print/voucher/[id]` |
| **§7** | Auditing Payment Reversals & Maker-Checker Segregation | Dual Control | Form XXII / Day Book + Super Admin AuditLog Extract |
| **§8** | Exporting Statutory Filing Packets for Chit Registrar | Compliance Packets | Web Portal (`GET /api/v1/reports/form-xvii`, `form-xxi`, `form-xxii`) |
| **§9** | System Infrastructure & Super Admin Telemetry Boundary | Guardrail 11 Isolation | Super Admin Only (`GET /api/v1/jobs/*`, `audit-logs`) |
| **§10** | Statutory Audit Certification & DPDP Act Checklist | Compliance Sign-off | 11-Guardrail Statutory Checklist |

---

## 3. Auditor 2FA Web Login & Workspace Orientation

```mermaid
flowchart TD
    Visit["Open Web Portal: https://admin.kumaranfinance.in"] --> Creds["Enter Assigned CA Credentials & Password"]
    Creds --> TOTP["Enter Microsoft Authenticator 6-digit TOTP Code"]
    TOTP --> Console["Access Global Read-Only Forensic Console"]
    Console --> Sandboxed["Sandboxed Security Guard:\n• Full read visibility across all groups, ledgers & vouchers\n• Any mutation attempt (POST/PUT/PATCH/DELETE) yields HTTP 403 Forbidden"]
```

### Step-by-Step Instructions:
1. Open Chrome/Edge and navigate to `https://admin.kumaranfinance.in`.
2. Enter your assigned statutory auditor credentials and password.
3. Complete 2-Factor Authentication using Microsoft Authenticator.
4. **Strict Read-Only Enforcement**:
   - The auditor account is completely sandboxed.
   - You have global read access across all chit groups, customer folders, ledgers, and cash books.
   - If you attempt to trigger any state change, the backend immediately returns **`HTTP 403 Forbidden: Read-Only Auditor Access`**. Company financial truth cannot be modified.

---

## 4. Forensic Verification of the Conservation Invariant

```mermaid
flowchart TD
    SelectScheme["Open: Chit Schemes -> Group KCA-1L-20M-01 -> Auctions"] --> OpenMonth["Select Month 4 Auction"]
    OpenMonth --> PullData["Extract Key Parameters from Screen:\n• Chit Value (V) = ₹1,00,000\n• Winning Bid Discount (D) = ₹22,000\n• Foreman Commission (Cf) = ₹4,000 (4.00% locked)\n• Member Dividend (Div_total) = ₹18,000\n• Tickets (M) = 20\n• Per-Ticket Dividend (Div_ticket) = ₹900"]
    PullData --> FormulaCheck{"Audit Formula Check:\nDoes D == Cf + Div_total\n(₹22,000 == ₹4,000 + ₹18,000)?"}
    FormulaCheck -- No --> FlagLeak["CRITICAL AUDIT LEAK DETECTED!"]
    FormulaCheck -- Yes --> CeilingCheck{"Ceiling Check:\nIs D <= V / 4 (₹22,000 <= ₹25,000)?"}
    CeilingCheck -- Yes --> Pass["INVARIANT CERTIFIED: Zero Accounting Drift"]
```

### Step-by-Step Instructions:
1. Navigate to **Chit Schemes $\to$ Group KCA-1L-20M-01 $\to$ Auctions $\to$ Month 4**.
2. Scrutinize the mathematical breakdown:
   - Winning Bid Discount ($D$): `₹22,000`
   - Foreman Commission ($C_f$): `₹4,000` (locked permanently at 4.00% of $V$)
   - Total Member Dividend ($Div_{total}$): `₹18,000` (`₹22,000 - ₹4,000`)
   - Net Installment Payable ($I_{net}$): `₹4,100` (`₹5,000 - ₹900`) across all 20 tickets.
3. **The Conservation Invariant Check**: Verify that:
   $$D = C_f + Div_{total}$$
   If there is a mismatch by even a single rupee, flag an accounting leak.
4. **Whole-Rupee Math (`BigInt`) Verification**: Verify that all figures are discrete integers without decimal fractions (`.00`), floating-point drift, or paise.

---

## 5. Form XXII Daily Cash Book Audit Against Bank Statements

```mermaid
flowchart TD
    SelectDate["Navigate: Reports -> Form XXII Daily Cash Book"] --> PickDate["Select Date for Audit (e.g. 15-May-2026)"]
    PickDate --> Display12["Screen Renders Official 12-Column Statutory Cash Register:\n• Col 1-6: Receipts (Opening Cash, Walk-ins, Agent Handovers)\n• Col 7-12: Disbursements (Prize Payouts, Petty Cash, Closing Cash)"]
    Display12 --> CompareBank["Compare Bank Remittance Column with Official Bank Statement"]
    CompareBank --> CompareVault["Compare Safe Vault Column with Physical Vault Register"]
    CompareVault --> Reconciled["Verify: Opening + Receipts - Disbursements == Closing\nPrint Form XXII with CA Auditor Stamp"]
```

### Step-by-Step Instructions:
1. Navigate to **Reports $\to$ Form XXII Daily Cash Book**.
2. Select the audit date range (e.g., Month of May 2026).
3. The screen renders the statutory 12-column cash book mandated by the Tamil Nadu Chit Funds Rules:
   - **Receipt Columns**: Opening cash, subscriber monthly installments, field agent batch handovers, bank withdrawals.
   - **Disbursement Columns**: Prize payouts, foreman commission withdrawals, bank cash deposits, closing cash.
4. Compare bank inward/outward entries against the corporate current account bank statement.
5. Confirm that the physical safe vault balance reconciles to the last rupee without discrepancies.

---

## 6. Sampling Prize Disbursements & Presigned S3 Cheques

> [!NOTE]
> **Web Desk vs. Read-Only API Boundary**: In `apps/web/src/lib/route-permissions.ts`, the interactive `/disbursements` operational desk is scoped to staff (`PARTNER`, `BRANCH_MANAGER`, `ACCOUNTANT`), whereas the backend read-only disbursement endpoints (`GET /api/v1/disbursements`, `GET /api/v1/disbursements/auction/:auctionId`, `GET /api/v1/disbursements/auction/:auctionId/safety-proof-url`) and printable `/print/voucher/[id]` view explicitly grant read-only access to `Role.AUDITOR`.

```mermaid
flowchart TD
    OpenDisb["Inspect Disbursement Sample via\nGET /api/v1/disbursements & /print/voucher/[id]"] --> Sample["Select Sample Payout: Ticket #5 (M. Kandasamy - ₹75,000)"]
    Sample --> ReviewVoucher["1. Verify Server-Computed Net Payout Math (KFC-FIN-003/004):\nV (₹1L) - D (₹25,000) - Unpaid Arrears Offset (₹0) = ₹75,000"]
    ReviewVoucher --> InspectSafety["2. Inspect Company Safety Proof Checklist (ADR-15):\n• Winner Agreement signed with nominee?\n• Blank bank cheques collected?"]
    InspectSafety --> ViewS3["3. Request Presigned URL\n(GET /api/v1/disbursements/auction/:auctionId/safety-proof-url)\nGenerates temporary 15-minute presigned S3 URL"]
    ViewS3 --> VerifyScans["4. Auditor visually verifies scanned cheque & agreement\nConfirms Canara Bank Cheque #004128 on file"]
```

### Step-by-Step Instructions:
1. Pull a random sample of disbursed prize vouchers via read-only `GET /api/v1/disbursements` and inspect printable voucher packets at `/print/voucher/[id]` (e.g., Ticket #5, Kandasamy, ₹75,000).
2. Verify the server-computed net prize calculation (`KFC-FIN-003` / `KFC-FIN-004`): $V - D - \text{Arrears Auto-Offset} = \text{₹}1,00,000 - \text{₹}25,000 - \text{₹}0 = \text{₹}75,000$ (with zero manual payout overrides permitted).
3. Review the attached **Company Safety Proof Checklist (ADR-15)** (signed agreement with nominee, signed blank cheques, promissory note; zero property deeds).
4. Fetch the temporary 15-minute presigned viewing URL via **`GET /api/v1/disbursements/auction/:auctionId/safety-proof-url`**.
   - Visually inspect the high-resolution scanned copy of the winner's agreement, nominee signature, and signed blank cheque.
   - Confirm that bank details match disbursement records and Form XXII cash/bank outflows.

---

## 7. Auditing Payment Reversals & Maker-Checker Segregation

> [!IMPORTANT]
> **Guardrail 11 (`ADR-21` / `report.controller.ts`) — `AuditLog` Access Boundary**: Direct access to `/reports/audit-logs` (`GET /api/v1/reports/audit-logs`) is restricted strictly to **`Role.SUPER_ADMIN`** (`HTTP 403 Forbidden` for `AUDITOR`). Independent CA Auditors verify reversal integrity and dual-control segregation through the statutory financial books (`Form XXII`, `Day Book`, `Form XXI`, `Form XVII`, and `GET /api/v1/reports/pending-approvals`), supplemented by signed `AuditLog` exports supplied by a Managing Partner (`SUPER_ADMIN`) during statutory audit reviews.

```mermaid
flowchart TD
    OpenBooks["Auditor Opens Statutory Books:\nForm XXII Cash Book, Day Book & Form XXI Ledger"] --> Locate["Locate Reversal Offsetting Entry:\nReceipt #KC-REC-PRD-2026-00412 (REVERSED)"]
    Locate --> CheckPDF["Verify Cancelled Receipt PDF:\nDiagonal red 'ரத்து செய்யப்பட்டது / CANCELLED' watermark (KFC-PDF-001)"]
    CheckPDF --> ReqExtract["Obtain Super Admin Certified AuditLog Export\n(GET /api/v1/reports/audit-logs is SUPER_ADMIN-only)"]
    ReqExtract --> AssertDual{"Verify Statutory Partner Dual Control:\n• initiatedByUserId (Partner A, Role.PARTNER)\n• approvedByUserId (Partner B, Role.PARTNER)\n• maker != checker enforced by DB CHECK constraint?"}
    AssertDual -- No --> Violation["CRITICAL COMPLIANCE VIOLATION"]
    AssertDual -- Yes --> Certified["Dual-Control & Ledger Reconciliation Verified"]
```

### Step-by-Step Instructions:
1. Open **Reports $\to$ Form XXII Cash Book** (`/reports/cash-book`) and **Day Book** (`GET /api/v1/reports/day-book`) to identify offsetting reversal entries for the audit period.
2. Verify that reversed payments reverted the subscriber's Form XXI installment due to `UNPAID` and that any receipt PDF download renders the mandatory diagonal red **`ரத்து செய்யப்பட்டது / CANCELLED`** watermark (`KFC-PDF-001`).
3. Request a period-filtered certified `AuditLog` export from an IT Administrator (`SUPER_ADMIN` via `/reports/audit-logs`) covering `PAYMENT_REVERSAL`, `AUCTION_FINALIZATION`, `PRIZE_DISBURSEMENT`, and `DEFAULTER_REMOVAL`.
4. **The Maker-Checker & Verified Partner Verification (Guardrails 10 & 11)**:
   - Verify that `maker_user_id` and `checker_user_id` are two distinct, non-identical **Statutory Partners (`Role.PARTNER`)**, backed by PostgreSQL engine-level `CHECK` constraints.
   - Verify that a mandatory written justification is documented and that an offsetting balancing entry appears in the Form XXII Cash Book.

---

## 8. Exporting Statutory Filing Packets for Chit Registrar

```mermaid
flowchart TD
    NavStatutory["Navigate: Reports -> Statutory Registers"] --> SelectScheme["Select Scheme: KCA-1L-20M-01"]
    SelectScheme --> Packets["Select Statutory Filing Packet:"]
    Packets --> Form17["1. Form XVII (Auction Minutes & Attendance)\nFiling with Registrar within statutory period"]
    Packets --> Form21["2. Form XXI (Subscriber 20-Month Ledger)\nAnnual ledger filing"]
    Packets --> Form22["3. Form XXII (Daily Cash Book Balance Sheet)"]
    Form17 --> ExportPDF["Click 'Export Certified PDF / CSV'\nSystem compiles certified statutory filing packet"]
    Form21 --> ExportPDF
    Form22 --> ExportPDF
```

### Step-by-Step Instructions:
1. Open **Reports $\to$ Statutory Registers** (or directly access `/reports/minutes`, `/reports/ledger`, or `/reports/cash-book`).
2. Select the chit group and export the required statutory forms:
   - **Form XVII (Auction Minutes Register)**: Navigate to `/reports/minutes`. For any finalized auction month, click **"Download PDF"** to receive the official Form XVII statutory PDF (`application/pdf`) streamed securely as an authenticated blob via the Next.js BFF proxy. Click **"Print Sheet"** for high-contrast print layout without dashboard chrome.
   - **Form XXI (Subscriber Ledgers & Passbook)**: Navigate to `/reports/ledger`. Filter by subscriber ticket number and click the **"PDF"** button on any subscriber ledger card (`downloadPassbookPdf`) to download their continuous 20-month schedule (A4 Landscape). Alternatively, click **"Print Passbook"** to print directly or **"Export CSV"** for external spreadsheet import.
   - **Form XXII (Day Book / Cash Book)**: Navigate to `/reports/cash-book`. Review the 12-column ledger for any operational date and click **"Print Sheet"** or **"Export CSV"** to reconcile against physical bank statements.
3. All statutory PDFs are delivered directly to the browser as binary blobs with zero pop-up blocker warnings, zero CORS headers, and zero internal Docker DNS resolution errors.

---

## 9. System Infrastructure Administration & Telemetry Boundary

> [!NOTE]
> **Super Admin Infrastructure Boundary (Guardrail 11 / `ADR-21`)**:  
> In accordance with Kumaran Finance's zero-trust security policy, background queue telemetry (`GET /api/v1/jobs/*`, `/admin/queues`, `/admin/jobs`) and internal system audit logs (`GET /api/v1/reports/audit-logs`, `/reports/audit-logs`) are restricted strictly to **`SUPER_ADMIN`** users (IT Administrators & Managing Partners).  
> The CA Auditor portal focuses exclusively on **independent financial books and statutory registers** (Form XXII Cash Book, Day Book, Form XXI Subscriber Ledgers, Form XVII Minutes, and Defaulters Aging), ensuring forensic audit separation from internal IT operations.

### Super Admin Maintenance Scrutiny:
Super Admin administrators oversee background queues and automated schedules directly:
1. Verify active cron schedules via **System $\to$ Background Jobs & Schedules** (`GET /api/v1/jobs/repeatable-schedules`):
   - **Daily Arrears Calculation**: Stamped at **00:01 AM IST (`1 0 * * *`)** to recompute arrears balances and tag 3-month defaulters (`DEFAULT_3_MONTHS`).
   - **Direct KVB UPI Claim Reconciliation (`ADR-19`)**: Stamped at **06:00 AM IST (`0 6 * * *`)** to sweep stale `INITIATED` UPI claims against direct Karur Vysya Bank settlement expectations (zero third-party payment gateway).
2. Inspect **Notification Delivery Audit Logs** (`GET /api/v1/jobs/notification-audit-logs`):
   - Verify bilingual **TRAI DLT SMS** delivery logs via MSG91 (Phase 1 primary channel per `ADR-23`; zero automated WhatsApp API per `Q34` / `KFC-NOT-001`).
   - Review Android FCM push notification delivery logs once Phase 2 mobile rollout activates (`ADR-26`).
3. Auditors verify financial ledger entries produced by these jobs directly within Form XXII and Form XXI without requiring direct infrastructure-level queue access.

---

## 10. Statutory Audit Certification & DPDP Act Checklist

```mermaid
flowchart TD
    AuditComplete["Forensic Scrutiny Complete"] --> Checklist["CA Signs 11-Guardrail Statutory Audit Certificate:"]
    Checklist --> C1["1. Single Company Tenancy: 0 external company_id columns"]
    Checklist --> C2["2. Whole Rupee Precision: BigInt only; 0 paise drift; whole-rupee dividend divisibility (KFC-FIN-002)"]
    Checklist --> C3["3. Commission Freeze: All active chits locked at 4.00%"]
    Checklist --> C4["4. Universal Dividends: All members received equal deductions"]
    Checklist --> C5["5. Month 1 & Month N Rules: No auctions in Month 1 & Month N (FIN-B)"]
    Checklist --> C6["6. 25% Ceiling & Option A Tie-Break: D <= V/4; physical lot draws verified"]
    Checklist --> C7["7. Ticket Limit: 0 duplicate tickets held in same group"]
    Checklist --> C8["8. Binary Dues: UNPAID / PAID / OVERDUE (0 partial dues or late fees)"]
    Checklist --> C9["9. Safety Proofs: Agreements & blank cheques verified (no property deeds)"]
    Checklist --> C10["10. Dual Control: Asserted maker_user_id != checker_user_id (8 DB CHECK constraints)"]
    Checklist --> C11["11. Verified Partner Exclusivity & Separation: Role.PARTNER on financial approvals; SUPER_ADMIN-only audit/queues"]
    C11 --> DPDP["DPDP Act Verification: Aadhaar masked to last 4 digits (XXXXXXXX1234)"]
    DPDP --> SignCert["Certify Audit Report for Chit Registrar & Partners"]
```

### Statutory Auditor Formal Sign-Off:
1. **Mathematical Conservation Invariant**: Confirmed $D = C_f + Div_{total}$ and exact whole-rupee dividend divisibility (`KFC-FIN-002`) across all completed auctions without a single rupee variance.
2. **Whole Rupee Arithmetic (`BigInt`)**: Confirmed all ledger values in PostgreSQL are 64-bit integer Rupees (`BigInt`) with server-computed prize payouts and automatic arrears offsets (`KFC-FIN-003` / `KFC-FIN-004`).
3. **DPDP Act 2023 Compliance**: Verified that zero unmasked 12-digit Aadhaar numbers are stored in plain text. All customer identity records store strictly masked numbers (`XXXXXXXX1234`), with scanned documents secured under AES-256 encrypted private S3/R2 storage with 15-minute presigned access.
4. **Dual-Control & Partner Exclusivity Enforcement (Guardrails 10 & 11)**: Certified that all high-risk financial mutations (reversals, activations, auction finalizations, prize payouts, defaulter removals, handovers) enforced non-identical Maker and Checker signatures and Statutory Partner (`Role.PARTNER`) identity where mandated.
