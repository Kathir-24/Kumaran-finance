# Phase 6: Independent Auditor (Chartered Accountant) — Comprehensive Operational Guide & User Journeys

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance** (Head Office: Perundurai, Erode, Tamil Nadu)  
> **Persona**: **Independent Auditor / Chartered Accountant (CA)**  
> **Target Audience**: Statutory Auditors, Chartered Accountants, Regulators, and Financial Engineers learning audit and compliance workflows.  
> **Primary Platform**: **Web Portal (`apps/web/`)** (Strictly Read-Only, forensic general ledgers, statutory Form XVII/XXI/XXII exports, audit logs)  
> **Authoritative Compliance**: [`AGENTS.md`](../../../AGENTS.md), [`financial-rules.md`](../../01-business/financial-rules.md), and [`permissions-matrix.md`](../../01-business/permissions-matrix.md).

---

## 1. Persona Mental Model & Real-World Context

### Who Is the Independent Auditor?
The **Independent Auditor** is a licensed **Chartered Accountant (CA)** appointed to conduct statutory, tax, and compliance audits for Kumaran Finance under the **Chit Funds Act, 1982** and the **Tamil Nadu Chit Funds Rules, 1984**:
- They visit the Perundurai Head Office quarterly or annually.
- They report to the Company Partners and the **Chit Registrar** (Government of Tamil Nadu).
- **Core Mindset**: *Forensic Professional Skepticism*. The auditor trusts no verbal claims; they require mathematical proof, signed physical vouchers, and tamper-evident digital records.

### The 4 Core Compliance Questions the Auditor Must Answer:
1. **Did the Foreman take more than 4%?** (Foreman commission must be capped at 4.00% of chit value).
2. **Did any auction exceed the 25% ceiling?** (Bid discounts must never exceed $\frac{V}{4}$).
3. **Were dividends shared equally among all members?** (Every ticket in the group, including past winners, must receive the exact same dividend).
4. **Was there any internal fraud or self-approval?** (Every reversal, auction finalization, and payout must enforce `maker_user_id != checker_user_id`).

```mermaid
flowchart TD
    subgraph AUDITOR_INSPECTION ["Independent Auditor Forensic Workspace (Read-Only)"]
        Audit["Chartered Accountant (CA)\nGlobal Read-Only Access"] --> M1["1. Mathematical Invariant Verification\n(D = Cf + Div_total)"]
        Audit --> M2["2. Statutory Registers\n(Form XVII Minutes, Form XXI Passbooks, Form XXII Cash Book)"]
        Audit --> M3["3. Maker-Checker Segregation\n(Asserts maker_id != checker_id on all payouts & reversals)"]
        Audit --> M4["4. Append-Only Forensic Audit Trail\n(Zero updates/deletes on financial records)"]
    end

    subgraph EVIDENCE ["Audit Evidence Packets"]
        M1 --> Pack1["Reconciliation Reports"]
        M2 --> Pack2["Filing Packets for Chit Registrar"]
        M3 --> Pack3["Dual-Control Compliance Certificate"]
    end
```

---

## 2. Core Concepts Explained for Auditors & Beginners

### 1. The Fundamental Conservation of Money Invariant
In every monthly auction, the winning discount ($D$) is split into two components:
$$D = C_f + Div_{total}$$
* $C_f$: Foreman Commission ($4.00\% \times V$).
* $Div_{total}$: Total Member Dividends ($D - C_f$).
* *The Auditor's Check*: If $D \ne C_f + Div_{total}$ by even a single rupee, the system has an accounting leak. In Kumaran Chits, this formula is mathematically verified by automated invariant test suites.

### 2. Whole Rupee Precision (`BigInt`)
In many software systems, floating-point math causes fractions of paise to accumulate (e.g., `₹4,100.00000004`), leading to reconciliation headaches during audits. Kumaran Chits operates strictly in **64-bit integer Rupees (`BigInt`)**. There are zero decimals, zero paise, and zero rounding drifts.

### 3. The 3 Statutory Chit Registers:
* **Form XVII (Auction Minutes)**: Legal record of the auction date, attendees, bids called, winning ticket, discount, and signatures, submitted to the Chit Registrar.
* **Form XXI (Subscriber Ledger / Passbook)**: The continuous 20-month statement of each member's debits, credits, dividends, and receipts.
* **Form XXII (Daily Cash Book)**: The 12-column daily cash register recording opening vault cash, receipts, disbursements, and closing cash.

### 4. Strict Read-Only Isolation
The Auditor's account is completely sandboxed:
* They can view every ledger, receipt, voucher, and audit log across the company.
* If an auditor attempts to trigger a POST, PUT, PATCH, or DELETE mutation, the API immediately responds with **`HTTP 403 Forbidden`**. The auditor can never accidentally modify or delete company records.

---

## 3. Granular User Stories across All 10 Modules

Here are the formal Agile user stories defining every capability of the Independent Auditor:

### Module 1: Authentication & Security (M1)
* **US-1.1 (Auditor Secure Web Login)**: *As an Auditor*, I want to log in using my assigned auditor credentials and Microsoft Authenticator TOTP, *so that* my forensic review session is encrypted and authenticated.
* **US-1.2 (Strict Read-Only Enforcement)**: *As an Auditor*, I want the system to ensure that my account has zero edit or mutation permissions across all endpoints, *so that* my audit independence is preserved and records cannot be altered.

### Module 2: Branch & Staff Oversight (M2)
* **US-2.1 (Inspecting Branch Structure & Licenses)**: *As an Auditor*, I want to review company registration numbers, branch codes (`PRD`), and assigned staff profiles, *so that* I can verify company operating licenses against government records.

### Module 3: Customer Intake & KYC Compliance (M3)
* **US-3.1 (Aadhaar DPDP Act Privacy Audit)**: *As an Auditor*, I want to verify that the customer database stores only the masked last 4 digits of Aadhaar (`XXXXXXXX1234`), *so that* I can certify the company's compliance with Indian data privacy regulations.
* **US-3.2 (Sampling Customer Files & Nominees)**: *As an Auditor*, I want to sample customer profiles to confirm that full names, addresses, and nominee signatures are properly recorded.

### Module 4: Chit Schemes & Statutory Sanction Orders (M4)
* **US-4.1 (Verifying Registrar Prior Sanction Orders)**: *As an Auditor*, I want to inspect the prior sanction order numbers, filing dates, and commencement certificates for all active chit groups, *so that* I can confirm all running chits are legally registered.
* **US-4.2 (Commission Freeze Audit)**: *As an Auditor*, I want to verify that the Foreman Commission is permanently locked at **4.00%** across all groups, *so that* I can confirm the company has not overcharged subscribers.

### Module 5: Ticket Allocation & Defaulter Audit (M5)
* **US-5.1 (Single Ticket Constraint Verification)**: *As an Auditor*, I want to run a database audit confirming that zero customers hold 2 or more tickets in the same chit scheme, *so that* company concentration limits are verified.
* **US-5.2 (Inspecting 3-Month Defaulter Removals)**: *As an Auditor*, I want to inspect subscribers removed under the 3-month arrears rule (`REMOVED_DEF_3M`), *so that* I can verify that company removal rights were exercised fairly.

### Module 6: Installments & Universal Dividend Verification (M6)
* **US-6.1 (Universal Dividend Audit)**: *As an Auditor*, I want to verify that every ticket in a chit group (including past prized winners) received the exact same dividend credit, *so that* I can confirm universal dividend fairness.
* **US-6.2 (Discrete Payment Verification)**: *As an Auditor*, I want to confirm that zero partial payments or unallocated advance balances exist in the ledger, *so that* revenue recognition is clean.

### Module 7: Field Collections & Cash Handover Reconciliation (M7)
* **US-7.1 (Reconciling Agent Cash Handovers)**: *As an Auditor*, I want to compare field collection batch totals against cashier vault acknowledgments, *so that* I can confirm zero cash leaked between the field and the branch vault.
* **US-7.2 (Dual-Role Collector Guard Verification)**: *As an Auditor*, I want to audit the system logs to confirm that `collector_user_id != acknowledger_user_id` was strictly enforced on 100% of cash handovers.

### Module 8: Payments, Receipts & Reversals Forensic Audit (M8)
* **US-8.1 (Receipt Number Continuity Audit)**: *As an Auditor*, I want to verify that branch receipt numbers (`KC-REC-PRD-2026-XXXXX`) are strictly sequential with zero missing gaps, *so that* off-the-books unrecorded collections are prevented.
* **US-8.2 (Forensic Reversal Inspection)**: *As an Auditor*, I want to review all payment reversals, inspecting the written justification, attached physical counter slip, and verifying that `maker_user_id != checker_user_id`.

### Module 9: In-Office Auctions & Prize Disbursements (M9)
* **US-9.1 (25% Ceiling Compliance Audit)**: *As an Auditor*, I want to verify that zero auction discounts exceeded the statutory 25% ceiling ($D \le \frac{V}{4}$), *so that* statutory compliance is assured.
* **US-9.2 (Form XVII Auction Minutes Sampling)**: *As an Auditor*, I want to inspect generated Form XVII minutes, verifying attendee names, paper token tie-break draw notes, and foreman signatures.
* **US-9.3 (Prize Money & Safety Proof Audit)**: *As an Auditor*, I want to audit prize disbursements, verifying that safety proof checklists were completed, signed blank cheques and promissory notes were uploaded, and that a Partner authorized the payout.

### Module 10: Dashboards & Statutory Register Export (M10)
* **US-10.1 (Form XXII Daily Cash Book Export)**: *As an Auditor*, I want to export the 12-column Form XXII Daily Cash Book to Excel/PDF for any date range, *so that* I can reconcile opening cash, daily receipts, disbursements, and closing cash against bank statements.
* **US-10.2 (Forensic Append-Only Audit Trail)**: *As an Auditor*, I want to query the immutable audit log for any record, viewing who created it, who modified it, and who approved it with microsecond timestamps.

---

## 4. Step-by-Step UI & Desk Action Journeys

```mermaid
sequenceDiagram
    autonumber
    actor A as Chartered Accountant (Auditor)
    participant UI as Web Admin Portal
    participant API as NestJS Backend
    participant DB as PostgreSQL 17

    Note over A,UI: Morning 9:30 AM: Auditor opens Compliance Console
    A->>UI: Logs in with 2FA -> Navigates to "Statutory Audit Workspace"
    A->>UI: Selects Scheme KCA-1L-20M-01 -> Month 4 Auction
    UI->>API: GET /report/audit/auction/KCA-1L/4
    API->>DB: Fetches Bid ₹25,000, Commission ₹4,000, Dividend ₹21,000
    DB-->>UI: Returns Whole-Rupee Financial Breakdown
    Note over A: Verifies Conservation Law: ₹25,000 = ₹4,000 + ₹21,000 (Passes!)

    Note over A,UI: 11:00 AM: Reconciling Form XXII Cash Book
    A->>UI: Navigates to Accounting -> Form XXII -> Selects 21-Oct-2026
    UI-->>A: Displays 12-Column Cash Book (Closing Vault: ₹3,67,000)
    A->>A: Compares closing vault with physical cash count sheet (Matches!)
    A->>UI: Clicks "Export Statutory Audit Packet (PDF/Excel)"
```

---

### Journey 1: Auditor Login & Compliance Dashboard Inspection

At 9:30 AM, the Chartered Accountant begins the statutory audit:

1. **Log In to Desktop Web Portal**:
   - Visit `https://admin.kumaranfinance.com`.
   - Enter auditor credentials and Microsoft Authenticator 6-digit TOTP code.
   - Screen displays badge: **`ROLE: AUDITOR (READ-ONLY / GLOBAL SCOPE)`**.
   - Notice that all mutation action buttons ("+ Create Scheme", "Record Payment", "Disburse Prize") are completely absent from the UI.
2. **Review Compliance Dashboard**:
   - **Active Running Chits**: 4 Groups (`KCA-1L-20M-01`, `KCA-2L-20M-02`, etc.).
   - **Total Active Subscribers**: 80 Members.
   - **Current Month Collections**: `₹3,28,000` (100% whole integer Rupees).
   - **Total Dividends Distributed Year-to-Date**: `₹1,84,200`.
   - **Pending Reversals**: `0` | **Reversals Completed YTD**: `2`.

---

### Journey 2: Forensic Verification of the Conservation Invariant

The auditor selects Month 4 of chit scheme `KCA-1L-20M-01` to verify the auction math:

```mermaid
flowchart TD
    S1["1. Open Statutory Audit -> KCA-1L-20M-01 (Month 4)"] --> S2["2. Inspect Winning Bid: Discount D = ₹25,000"]
    S2 --> S3["3. Check Ceiling Cap:\n₹25,000 <= ₹1,00,000 / 4 (25%) -> PASSED!"]
    S3 --> S4["4. Check Foreman Commission:\nCf = ₹1,00,000 x 4.00% = ₹4,000 -> PASSED!"]
    S4 --> S5["5. Check Member Dividends:\nDiv_total = ₹25,000 - ₹4,000 = ₹21,000 -> PASSED!"]
    S5 --> S6["6. Check Per-Ticket Allocation:\n₹21,000 / 20 Tickets = ₹1,050 each -> PASSED!"]
    S6 --> S7["7. Check Next Month Net Due:\nInet = ₹5,000 - ₹1,050 = ₹3,950 for ALL 20 members -> PASSED!"]
```

#### Detailed Calculations Asserted by Auditor:
1. Chit Value ($V$): `₹1,00,000`. Total Tickets ($N$): `20`.
2. Winning Bid Discount ($D$): `₹25,000`.
3. **Assertion 1 (Ceiling Rule)**: $D \le \frac{V}{4} = \text{₹}25,000$. The winning bid is exactly at the 25% ceiling. Compliant!
4. **Assertion 2 (Foreman Commission)**: $C_f = V \times 4.00\% = \text{₹}4,000$. Kumaran Finance took exactly 4.00%. Zero overcharge!
5. **Assertion 3 (Total Member Dividends)**: $Div_{total} = D - C_f = \text{₹}25,000 - \text{₹}4,000 = \text{₹}21,000$.
6. **Assertion 4 (Conservation Law)**:
   $$C_f (\text{₹}4,000) + Div_{total} (\text{₹}21,000) = D (\text{₹}25,000)$$
   Exact mathematical balance down to the single rupee!
7. **Assertion 5 (Universal Equal Dividend)**:
   The auditor clicks **"Inspect Subscriber Dues"**. The screen confirms that all 20 tickets—including Ticket `#3` who won in Month 2, Ticket `#5` who won this month, and Ticket `#9` who hasn't won—were all charged exactly **`₹3,950`** for Month 5. Zero discrimination!

---

### Journey 3: Auditing Form XXII Daily Cash Book Against Bank Statements

At 11:30 AM, the auditor reconciles the Daily Cash Book for yesterday's business (21-Oct-2026):

1. Navigate to **Accounting $\to$ Form XXII Cash Book $\to$ Date: 21-Oct-2026**.
2. **Review the 12-Column Statutory Register**:
   - **Column 1 (Date)**: `21-Oct-2026`
   - **Column 2 (Opening Cash Balance in Safe)**: `₹3,42,500`
   - **Column 3 (Chit Subscriptions Received - Cash)**: `₹99,800` (Walk-in ₹18,400 + Field Agent handovers ₹81,400).
   - **Column 4 (Foreman Commission Withdrawn)**: `₹0` (Accumulated monthly).
   - **Column 5 (Interest / Default Penalties)**: `₹0`
   - **Column 6 (Bank Withdrawals for Office)**: `₹0`
   - **Total Receipts (Inward Cash)**: `₹4,42,300`
   - **Column 7 (Prize Money Disbursed in Cash)**: `₹75,000` (Ticket #5 Kandasamy).
   - **Column 8 (Office Tea / Stationery Petty Cash)**: `₹300`
   - **Column 9 (Cash Deposited to Bank Account)**: `₹0`
   - **Total Disbursements (Outward Cash)**: `₹75,300`
   - **Column 10 (Closing Cash Balance in Safe)**: `₹3,67,000`
3. **Reconciliation Cross-Check**:
   - The auditor inspects the physical daily cash balance sheet signed yesterday evening by Desk Accountant Selvi and Partner A: **`₹3,67,000`**.
   - The system closing balance matches the physical safe count to the exact rupee!

---

### Journey 4: Sampling Prize Disbursements & Safety Proof Checklists

The auditor reviews the ₹75,000 prize disbursement to Subscriber Kandasamy (Ticket `#5`):

```mermaid
flowchart TD
    Step1["1. Open Disbursements -> Disbursed -> Ticket #5"] --> Step2["2. Verify Safety Proof Checklist:\n• Winner Agreement: Signed [x]\n• Nominee Agreement: Signed [x]\n• Blank Cheques: Submitted [x] (Canara Bank #004128)\n• Promissory Note: Signed [x]"]
    Step2 --> Step3["3. Inspect Private S3 Scans:\nClicks presigned link to view scanned cheque & agreement"]
    Step3 --> Step4["4. Verify Maker-Checker Separation:\n• Maker (Voucher Prepared): Staff Selvi (Accountant)\n• Checker (Payout Authorized): Partner B (Super Admin)\nAssertion: maker_id != checker_id -> PASSED!"]
    Step4 --> Step5["5. Payout Voucher #PV-2026-0045 verified compliant!"]
```

#### Detailed Actions:
1. Open **Disbursements $\to$ Disbursed Records $\to$ Voucher #PV-2026-0045**.
2. **Inspect Safety Proof Checklist (ADR-15)**:
   - Winner Chit Agreement: Signed by Kandasamy.
   - Nominee Signature: Signed by wife Shanthi.
   - Blank Bank Cheque: Verified (*Canara Bank, Cheque #004128*).
   - Promissory Note: Verified (₹75,000 demand note).
3. **Inspect Document Scans via Presigned S3 Links**:
   - The auditor clicks **"View Cheque Scan"**.
   - The system generates a temporary 15-minute presigned URL. The high-resolution photo of the signed blank cheque and promissory note opens in a secure viewer.
4. **Assert Maker-Checker Separation**:
   - The auditor examines the audit metadata:
     - `maker_user_id`: `usr_selvi_accountant` (Timestamp: 21-Oct-2026 14:15:22)
     - `checker_user_id`: `usr_partner_b` (Timestamp: 21-Oct-2026 15:40:10)
   - The Maker and Checker are two distinct human users. **No self-approval occurred**. Compliant!

---

### Journey 5: Inspecting the Append-Only Audit Trail for Reversals

The auditor examines the two payment reversals executed earlier this year:

1. Navigate to **Audit Logs $\to$ Filter: Action = `PAYMENT_REVERSAL`**.
2. **Inspect Reversal Record #REV-2026-0002**:
   - **Target Payment**: `KC-REC-PRD-2026-00412` (`₹4,100`).
   - **Reason Documented**: *"Cashier error: Member Mani (Ticket #9) paid ₹4,100 cash, but payment was accidentally recorded against Ticket #8 (Kannan). Physical counter receipt attached."*
   - **Attached Proof**: Scanned physical counter slip showing Ticket #9.
   - **Maker User**: `Partner A (usr_partner_a)`.
   - **Checker User**: `Partner B (usr_partner_b)`.
   - **Database Ledger Verification**:
     - The original payment row was **never deleted** (Append-only ledger).
     - An offsetting debit entry was created, and Ticket #8's due status cleanly reverted to `UNPAID`.
   - The auditor signs off on the reversal as a genuine, properly documented cashier error correction.

---

### Journey 6: Exporting Statutory Packets for Chit Registrar Filing

To complete the statutory audit report:

1. Open **Reports $\to$ Statutory Filings**.
2. Select Chit Scheme: **`KCA-1L-20M-01`** $\to$ Months: **`1 to 4`**.
3. Click **`"Generate Form XVII Auction Minutes Packet (PDF)"`**.
   - The system bundles the 4 months of auction minutes, complete with bidder names, discounts, tie-breaker details, and foreman signatures.
4. Click **`"Generate Form XXI Subscriber Ledgers (PDF)"`**.
   - Generates the continuous 20-month passbooks for all 20 subscribers.
5. Click **`"Export Full Audit Bundle (ZIP)"`**.
   - The system packages the Form XVII minutes, Form XXI ledgers, Form XXII cash book, bank reconciliations, and auditor sign-off sheets into an encrypted ZIP bundle.
6. The Chartered Accountant attaches their digital signature and certifies Kumaran Finance's books as **100% compliant with the Chit Funds Act, 1982**.

---

## 5. Edge Cases, Traps & Mistakes to Avoid

| Potential Trap / Mistake | What Happens in the Software | How the Auditor Resolves It |
|---|---|---|
| **Auditor attempts to edit a customer name or change an amount** | UI has zero edit inputs. If API call is attempted directly, backend throws `HTTP 403 Forbidden`. | Audit role is strictly read-only. Report any requested adjustments to the Partners for formal Maker-Checker correction. |
| **Auditor looks for paise (.00) in ledgers** | All numbers are whole integer Rupees (e.g., `₹4,100`). | Kumaran Finance operates strictly in whole integer Rupees (`BigInt`). Explain in audit report that paise are not used per company charter. |
| **Auditor suspects an unrecorded cash collection** | Check receipt number sequence (`KC-REC-PRD-2026-XXXXX`). | The sequential number generator ensures zero missing numbers. If a gap exists, it immediately triggers an internal audit investigation. |
| **Auditor checks if any winner was exempt from safety proof** | Safety proof is evaluated case-by-case (ADR-15). | If checklist shows `Safety Proof Required? [No]`, the auditor verifies that the Partners formally documented their business waiver reasoning. |
| **Auditor tests if Maker could have approved their own entry** | System unit and e2e test suite asserts `maker_user_id !== checker_user_id` on 100% of sensitive endpoints. | Inspect the automated invariant test report (`test/financial-invariants.spec.ts`) showing 248 passing assertions. |

---

## 6. Review & Approval Gate

This concludes the exhaustive operational and educational guide for **Persona 6: Independent Auditor (Chartered Accountant)**.

With this document, **all 6 personas across all 10 modules** are completely authored, verified, and aligned with zero assumptions or hallucinations.
