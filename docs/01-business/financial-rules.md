# Kumaran Chits — Financial Rules & Calculation Engine

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance**  
> **Status**: Working Specification  
> **Applicable Status Labels Used in this Document**:
> - `CONFIRMED-BY-DEVELOPER`: Explicitly confirmed by developer; subject to final company confirmation.
> - `PROPOSED`: Proposed design pattern or working hypothesis for review.
> - `OPEN`: Unresolved question; needs business decision or rule definition.
> - `UNVERIFIED-LEGAL`: Legal or regulatory claim without a verified primary legal citation.
>
> **Integrity Mandate**: No floating-point numbers. All financial values are stored and calculated as whole integer Rupees (₹). Paise are never used in Kumaran Finance operations (`CONFIRMED-BY-DEVELOPER`).

---

## 1. Core Terminology & Math Model

| Term | Symbol | Definition | Status |
|---|---|---|---|
| **Chit Value (Gross Pool)** | $V$ | Total pool amount for the chit group (e.g., ₹1,00,000). Always whole rupees. | `CONFIRMED-BY-DEVELOPER` |
| **Duration (Months)** | $N$ | Total number of installments / months (e.g., 20 months). | `CONFIRMED-BY-DEVELOPER` |
| **Total Tickets / Members** | $M$ | Total number of tickets participating ($M = N$). Dividend is shared equally across **all $M$ tickets**, including the auction winner and past prized winners (`CONFIRMED-BY-DEVELOPER`). | `CONFIRMED-BY-DEVELOPER` |
| **Base Monthly Installment** | $I_{base}$ | Base gross installment per ticket before dividend deduction: $I_{base} = \frac{V}{N}$ (e.g., ₹5,000 or ₹10,000). Always whole rupees. | `CONFIRMED-BY-DEVELOPER` |
| **Foreman Commission Rate** | $r_f$ | Configurable default rate of **4.00%** ($0.04$). Copied from settings when a chit is created; frozen per chit once active. May be changed for future chits. | `CONFIRMED-BY-DEVELOPER` |
| **Foreman Commission Amount** | $C_f$ | Commission retained by company: $C_f = V \times r_f = V \times 0.04$. Always whole rupees. | `CONFIRMED-BY-DEVELOPER` |
| **Auction Bid Discount** | $D$ | Amount forgone by winning bidder to claim prize money early ($C_f \le D \le \frac{V}{4}$). Always whole rupees. | `CONFIRMED-BY-DEVELOPER` |
| **Total Member Dividend** | $Div_{total}$ | Net discount available after commission: $Div_{total} = D - C_f$. Always whole rupees. | `CONFIRMED-BY-DEVELOPER` |
| **Dividend Per Ticket** | $Div_{ticket}$ | Dividend allocated equally per ticket across all $M$ members: $Div_{ticket} = \frac{Div_{total}}{M}$. Always whole rupees. | `CONFIRMED-BY-DEVELOPER` |
| **Net Installment Payable** | $I_{net}$ | Actual amount payable by **all subscribers (including the auction winner)** next month: $I_{net} = I_{base} - Div_{ticket}$ (e.g., base ₹10,000 - dividend ₹2,100 = ₹7,900). Applies uniformly to everyone in the group. Always whole rupees. | `CONFIRMED-BY-DEVELOPER` |
| **Prize Money** | $P$ | Amount payable to winning subscriber before deductions: $P = V - D$. Always whole rupees. | `CONFIRMED-BY-DEVELOPER` |

---

## 1.1 Physical Passbook 6-Column Ledger Specification (`CONFIRMED-BY-DEVELOPER`)

Every subscriber's physical paper passbook at Kumaran Finance maintains strictly this 6-column ledger structure:

| Month # | Payment Date (Cycle Start) | Paid Date (Actual Payment) | Amount Paid ($I_{net}$) | Dividend ($Div$) | Total ($I_{base}$) |
|:---:|:---:|:---:|:---:|:---:|:---:|
| **1** | `22/11/2022` | `15/12/2022` | **₹10,000** | **₹0** | **₹10,000** |
| **2** | `22/12/2022` | `04/01/2023` | **₹7,900** | **₹2,100** | **₹10,000** |
| **3** | `22/01/2023` | `01/02/2023` | **₹7,900** | **₹2,100** | **₹10,000** |
| ... | ... | ... | ... | ... | ... |
| **$N$** | `22/04/2025` | `...` | Net Due | Prior Div | **₹10,000** |

### Mathematical Invariants of the Physical Passbook:
1. **The Row Sum Invariant**:
   $$\text{Amount Paid } (I_{net}) + \text{Dividend } (Div) = \text{Total Base Gross Installment } (I_{base})$$
2. **Cycle Date Window (30-day collection frame)**:
   - `Payment Date`: Opening date of the monthly billing cycle (e.g., 22nd of each month).
   - `Paid Date`: Actual calendar date when subscriber paid at doorstep or counter.
   - Collections are valid on **any day** between `Payment Date` and the next cycle date.
3. **Auction Date & Dividend Linkage**:
   - The in-branch auction is conducted on the cycle date (e.g., `22/12/2022`).
   - Its winning discount directly populates the universal dividend for that **immediate upcoming collection cycle** (`22/12/2022` to `22/01/2023`), so members pay the discounted net amount ($I_{base} - Div$) starting right in Month 2.
4. **Dynamic Discount Ceiling**:
   - In every auction month, the discount is **competitive and dynamic**:
     $$4\% \text{ Foreman Commission} \le \text{Bid Discount } (D) \le \frac{1}{4} \text{ Ceiling } \left(\frac{V}{4}\right)$$
   - Discount does not have to be static. In quiet months it may be lower (e.g. ₹30,000 or ₹40,000); when competition hits the 25% ceiling (₹75,000), physical paper token lot draws are conducted in front of members.
5. **Final Month (Month $N$) Settlement (FIN-B & `CONFIRMED-BY-DEVELOPER`)**:
   - No auction in Month $N$. The single remaining unprized subscriber receives the full gross chit pool minus 4.00% Foreman Commission ($C_f$), minus the final month's payable base installment ($I_{\text{base}}$) **if unpaid**, minus any prior unpaid arrears:
     $$\text{Final Net Settlement Payout} = V - C_f - (\text{finalMonthDeduction}) - \text{priorArrears}$$
   - **Double Collection Prohibition (FIN-B)**:
     - Case 1 (Month $N$ Unpaid): $\text{finalMonthDeduction} = I_{base}$. Payout is $100,000 - 4,000 - 5,000 = \mathbf{₹91,000}$. Month $N$ due is marked `PAID`.
     - Case 2 (Month $N$ Already Paid at branch desk): $\text{finalMonthDeduction} = 0n$. Payout is $100,000 - 4,000 - 0 = \mathbf{₹96,000}$. Zero double collection.
   - Executed via `POST /chits/:id/settle-final-month` exclusively by verified Partners (`isPartner: true`). Scheme status transitions to `COMPLETED`.

---

## 2. Walkthrough Example (₹1,00,000 Chit, 20 Months, 4% Commission)

The numbers below illustrate arithmetic relationships based on confirmed rules:
- **Chit Value ($V$)**: ₹1,00,000
- **Duration ($N$) & Tickets ($M$)**: 20 months / 20 tickets
- **Base Monthly Installment ($I_{base}$)**: $\frac{₹1,00,000}{20} = ₹5,000$ per ticket
- **Foreman Commission ($C_f$)**: $4\% \times ₹1,00,000 = ₹4,000$

### Month 1: Initial Installment (`CONFIRMED-BY-DEVELOPER`)
- **Company Representative Ticket**: In each chit group, one company person acts as a customer (holds 1 ticket).
- **First Month Pool**: The entire first-month pool is taken by the company. There is **NO auction** in Month 1.
- **Installment Collection**: All 20 tickets pay the full base installment: **₹5,000 each**.
- **Dividend in Month 1**: **₹0** (no dividend distributed in the first month).

### Month 2: Sample Auction with 1/4 Ceiling Discount (₹25,000)
- Winning bid discount at maximum ceiling (1/4 of ₹1,00,000): **$D = ₹25,000$**
- **Prize Money**:
  $$P = V - D = ₹1,00,000 - ₹25,000 = ₹75,000$$
- **Foreman Commission Retained**:
  $$C_f = 4\% \times ₹1,00,000 = ₹4,000$$
- **Total Member Dividend Calculated**:
  $$Div_{total} = D - C_f = ₹25,000 - ₹4,000 = ₹21,000$$
- **Dividend Per Ticket (Divided by all 20 members)**:
  $$Div_{ticket} = \frac{₹21,000}{20} = ₹1,050$$

### Installment Calculation Applied to All Schemes (`CONFIRMED-BY-DEVELOPER`):
- **Universal Dividend Eligibility (`CONFIRMED-BY-DEVELOPER`)**:
  - Dividend is shared **equally among ALL members in that chit group, INCLUDING the auction winner and past prized winners**.
- **Monthly Payable Rule (`CONFIRMED-BY-DEVELOPER`)**:
  - **Everyone (including the auction winner) pays the net installment next month**:
    $$I_{net} = I_{base} - Div_{ticket}$$
  - **Confirmed Example**:
    - If base installment is ₹10,000 per month and allocated dividend is ₹2,100, **every customer in that group (including the auction winner) pays ₹7,900 next month**.
  - In this 20-month (₹1 Lakh) walkthrough:
    - Base installment: $I_{base} = ₹5,000$.
    - Dividend: $Div_{ticket} = ₹1,050$.
    - **All 20 tickets (including the winner) pay**: $I_{net} = ₹5,000 - ₹1,050 = ₹3,950$.

### Final Month (Month $N$): Settlement (FIN-B & `CONFIRMED-BY-DEVELOPER`)
- **No Auction**: There is **NO bidding auction** in the final month.
- **Settlement Flow**:
  1. The single remaining non-prized subscriber is entitled to the final prize money.
  2. The company retains the 4.00% foreman commission ($C_f = \text{₹4,000}$).
  3. **FIN-B Check**: If subscriber has NOT yet paid Month $N$ installment, ₹5,000 is deducted and Month $N$ due marked `PAID` ($\text{Net Payout} = \mathbf{₹91,000}$). If subscriber ALREADY paid Month $N$ installment at the branch desk, final month deduction is ₹0 ($\text{Net Payout} = \mathbf{₹96,000}$).
  4. Any prior unpaid arrears are also deducted from the prize snapshot.
  5. The payout is authorized and released via formal settlement voucher by verified Partners (`isPartner: true`). Scheme status transitions to `COMPLETED`.

---

## 3. Dividend Settlement Rules (`CONFIRMED-BY-DEVELOPER`)

The dividend settlement policy is confirmed as follows:

1. **Who Receives Dividend? (`CONFIRMED-BY-DEVELOPER`)**:
   - Dividend is shared **equally among ALL members of the chit group, INCLUDING the auction winner and past prized subscribers**.
   - No subscriber is excluded from receiving dividends after winning.
2. **How is Dividend Settled? (`CONFIRMED-BY-DEVELOPER`)**:
   - The dividend is **deducted directly from the next month’s payable installment**:
     $$I_{net} = I_{base} - Div_{ticket}$$
   - This monthly deduction rule **applies uniformly to every member in the group across all schemes** (`CONFIRMED-BY-DEVELOPER`).
   - Every subscriber (both prized winners and non-prized subscribers) pays the exact same net installment $I_{net}$ for that month.

---

## 4. Rounding, Remainder & Divisibility Gate (`CONFIRMED-BY-DEVELOPER`)

- **Whole Number Mandate (`CONFIRMED-BY-DEVELOPER`)**: All financial values in Kumaran Finance (installments, dividends, commissions, prize payouts, and receipts) are **always whole numbers (Rupees only; paise never comes in)**.
- **Whole-Rupee Dividend Divisibility Gate (`KFC-FIN-002`)**:
  - The total member dividend ($Div_{total} = D - C_f$) must be **cleanly and perfectly divisible** by the total number of tickets ($M$) in the chit group:
    $$(D - C_f) \pmod M == 0$$
  - If a submitted bid discount would produce a fractional rupee or non-zero remainder (e.g., a ₹20,005 bid discount on a 20-ticket chit yields $(20,005 - 4,000) \pmod{20} = 5 \ne 0$), the application **strictly rejects the bid fail-closed** at entry with:
    `HTTP 400 Bad Request: NON_DIVISIBLE_DIVIDEND: Total dividend (₹16005) must be cleanly divisible by 20 tickets.`
  - The system **never silently truncates remainders** via integer division, guaranteeing zero rupee leakage across the lifecycle.

---

## 5. Architecture for Foreman Commission Changes (`CONFIRMED-BY-DEVELOPER`)

- **Configurable Default (`CONFIRMED-BY-DEVELOPER`)**: Commission rate defaults to 4.00% in system settings. It is not hard-coded in the database schema; the application copies the active setting at scheme creation.
- **Frozen per Chit (`CONFIRMED-BY-DEVELOPER`)**: Once a chit group becomes active, its commission rate is locked and cannot be retroactively altered for that group.
- **Future Changes (`CONFIRMED-BY-DEVELOPER`)**: If the company changes its default rate to a different percentage in the future, all existing running groups continue calculating at their original locked rate. Newly created groups inherit the updated default setting.
- **Audit Snapshot (`CONFIRMED-BY-DEVELOPER`)**: Every auction record logs the exact commission rate and currency amount retained at that auction.

---

## 6. Offline Auction Recording, Ceilings & Tie-Breaks

### 6.1 Offline Auction Conduct (`CONFIRMED-BY-DEVELOPER`)
- Staff conduct auctions offline at the branch office with participating members.
- The software does not conduct auctions autonomously; it only **records, validates, and stores** the entered results submitted by staff.

### 6.2 Fixed 1/4 (25%) Discount Ceiling (`CONFIRMED-BY-DEVELOPER`)
- **Fixed One-Fourth Ceiling ($D_{max} = \frac{V}{4}$)**: The auction discount ceiling is strictly fixed at **one-fourth (1/4 or 25.00%) of the total chit value ($V$)** across all auction months (`CONFIRMED-BY-DEVELOPER`). There is no dynamic ceiling.
- **Enforced Range**: In every auction (Months 2 to $N-1$), the winning bid discount ($D$) must satisfy:
  $$C_f \le D \le \frac{V}{4}$$
  For example, in a ₹1,00,000 scheme ($V = \text{₹}1,00,000$), the winning discount can never exceed ₹25,000 ($D \le \text{₹}25,000$).
- **Minimum Floor**: The minimum bid discount cannot be lower than the foreman commission ($D \ge C_f$) to prevent negative dividends.

### 6.3 Tie-Break Protocol (`CONFIRMED-BY-DEVELOPER`)
- **Option A — Physical Token Draw (`CONFIRMED-BY-DEVELOPER`)**: When multiple bidders bid the maximum 1/4 discount ceiling:
  - The Foreman draws paper tokens/lots physically at the branch office in the presence of participating members.
  - Branch staff simply enters the winning ticket number drawn into the software.
  - The software records the result without running an autonomous digital RNG draw.

### 6.4 Finalized Auction Correction Workflow (`KFC-FIN-005` / `CONFIRMED-BY-DEVELOPER`)
In the event of a human clerical error during physical auction data entry (e.g. inverted digit on winning ticket or mistyped discount):
1. **Maker Request (`POST /api/v1/auctions/:id/correction/request`)**:
   - Initiated strictly by **Super Admin (Partner A)** with a mandatory justification.
   - Enforces the 25% discount ceiling and whole-rupee divisibility rules on the corrected values.
   - **Immutable Disbursed Prize Guard**: If the prize money has already been disbursed (`disbursementStatus === 'DISBURSED'`), correction is strictly blocked.
2. **Checker Approval (`POST /api/v1/auctions/:id/correction/approve`)**:
   - Approved strictly by **Super Admin (Partner B)** with hard dual control: `maker_user_id != checker_user_id`.
   - Atomically updates auction fields (`winningTicketId`, `bidDiscount`, `prizeMoney`, `dividendPerTicket`).
   - If the winning ticket changes, swaps `isPrized` flags (unmarks old winner, marks new winner).
   - Reconciles downstream month installment dues (`netPayableAmount = baseInstallment - correctedDividend`) for unpaid records. Paid records remain preserved to protect financial auditability.

---

## 7. Mid-Cycle Ongoing Chit Onboarding & Operations (`CONFIRMED-BY-DEVELOPER`)

Kumaran Finance currently tracks active chits in physical notebooks and paper receipts (`CONFIRMED-BY-DEVELOPER`).
- **Initial Month Offset (`CONFIRMED-BY-DEVELOPER`)**: The software records the active running month (e.g., Month 7) and sets past months (1 to 6) as completed historical records based on paper notebook entries.
- **Historical Past Winners (`CONFIRMED-BY-DEVELOPER`)**: Recorded with winner ticket, winning discount, and prize payout status from ledger entries.
- **Single Discrete Payment & Zero Advance Balance (`CONFIRMED-BY-DEVELOPER`)**:
  - Each installment month accepts strictly one payment matching the net installment amount.
  - **Double payments for the same specified month will never happen** in business operations.
  - The concept of "Advance Balance" is completely eliminated. No advance ledger or carry-forward balance exists.
- **Flexible Company Safety Proof & Collateral Checklist (`CONFIRMED-BY-DEVELOPER`)**:
  - Property documents and property deeds are completely eliminated from the workflow.
  - Collateral / security proof is **not mandatory** across the board; it is requested strictly if required by Kumaran Finance for company safety on a case-by-case basis.
  - The software functions as a flexible safety checklist & recordkeeper:
    - Is safety proof required for this winner? [Yes / No]
    - Agreement signed with auction winner & nominee signatures? [Yes / No]
    - Signed blank cheque(s) with signatures submitted? [Yes / No, with cheque details]
    - Promissory note / personal guarantee submitted? [Yes / No]
    - Upload scanned copies of submitted papers / cheques to secure private storage.
- **Receipts & Notifications (`CONFIRMED-BY-DEVELOPER`)**:
  - The customer's physical paper passbook signed with pen by the agent/cashier is the primary physical proof.
  - Generation of bilingual (English + Tamil) digital PDF receipts (for company ledger and dispute backup) is in V1 scope (`CONFIRMED-BY-DEVELOPER`).
  - Notifications follow a Smart Hierarchy: Free In-App Push Notifications for smartphone app users, and DLT SMS fallback for keypad phone users. WhatsApp Business API is parked in V1 (`CONFIRMED-BY-DEVELOPER`).
  - Payout vouchers support Cheque, NEFT/RTGS/IMPS, and Cash (`CONFIRMED-BY-DEVELOPER`).

---

## 8. Defaulter Rules & Auction Bidding Ineligibility (`CONFIRMED-BY-DEVELOPER`)

1. **Auction Bidding Ineligibility for Unpaid Dues (`CONFIRMED-BY-DEVELOPER`)**:
   - Any subscriber who has not paid their installment due for a specific month is **strictly ineligible to participate or bid in that month's auction**.
   - The software enforces this condition automatically: staff cannot select an unpaid subscriber as an active bidder or auction winner for that installment month.

2. **3-Month Consecutive Arrears & Company Removal Rights (`CONFIRMED-BY-DEVELOPER`)**:
   - If a subscriber fails to pay their monthly installment for **3 continuous (consecutive) months**, the company has the full right and authority to **remove the customer from the chit group**.
   - The software tracks consecutive missed installments, flags the ticket with status `DEFAULT_3_MONTHS`, and provides an authorized workflow for company management / partners to formally remove the customer and reassign or settle the ticket according to company policy.

---

## 9. Whole-Rupee Input Boundary Invariants & Zero-Paise Enforcement (`CONFIRMED-BY-DEVELOPER`)

> **Architectural Law (Rule 2 in AGENTS.md)**: All monetary values in Kumaran Finance exist strictly in 64-bit whole integer Rupees (`BigInt`). Paise, decimal fractions (`.00`), and IEEE-754 floating-point numbers (`float`, `number`) are strictly prohibited in financial code and rejected at the HTTP DTO boundary.

### Invariant Rules Enforced at the Input Gateway:
1. **Zero-Paise Integer Enforcement (`@IsInt`)**:
   - Any financial payload containing fractional decimals (e.g., `amount: 3950.50`, `bidDiscount: 22000.25`, or `chitValue: 100000.75`) is rejected immediately at the `ValidationPipe` boundary with `HTTP 400 Bad Request`.
   - The system **never** silently truncates paise via `Math.floor()` without failing closed.
2. **Negative Value Elimination (`@IsPositive` / `@Min(1)`)**:
   - Negative monetary inputs (`-5000`, `-1n`) are rejected at the DTO boundary with `HTTP 400 Bad Request`.
3. **Zero Payment Rejection**:
   - Zero-rupee payments or collections (`amount: 0`) are prohibited on positive settlement endpoints.
4. **Statutory Ceiling & Floor Enforcement**:
   - Winning discount bids must strictly satisfy $C_f \le D \le \frac{V}{4}$.
   - Sub-floor bids ($D < 4.00\%$ Foreman Commission) and super-ceiling bids ($D > 25\%$ total chit value) are rejected fail-closed with `HTTP 400 Bad Request`.
5. **Discrete Net Due Exact Match (ADR-07)**:
   - Payment amount must identically equal `due.netPayableAmount` ($I_{net} = I_{base} - Div_{ticket}$).
   - Partial payments, advance overpayments, and floating credit balances are rejected with `HTTP 400 Bad Request`.

---

## 10. Prize Disbursement Arrears Offset & TOCTOU Guard (FIN-A, FIN-D, `KFC-FIN-003`, `KFC-FIN-004`)

1. **Automatic Arrears Offsetting (FIN-A & `KFC-FIN-003`)**:
   - When authorizing a prize payout (`POST /auctions/:id/authorize-payout`), the system queries all unpaid installment dues for the winning subscriber up to the auction month.
   - Total outstanding arrears are automatically deducted from the gross prize money:
     $$\text{Authorized Net Payout} = \text{Prize Money } (P) - \text{Total Arrears}$$
   - **Insolvency Guard**: If total unpaid arrears are greater than or equal to the prize money ($\text{Arrears} \ge P$), authorization is rejected fail-closed.
2. **Time-Of-Check-To-Time-Of-Use (TOCTOU) Arrears Verification (FIN-D)**:
   - Upon release (`POST /auctions/:id/release-payout`), inside the row-locked database transaction:
     - The system re-queries all unpaid dues $\le$ auction month.
     - Validates `currentArrears === expectedArrears`.
     - If arrears changed (e.g. subscriber made an intervening payment between authorization and release), the transaction fails closed immediately:
       `HTTP 400 Bad Request: ARREARS_STATE_CHANGED: Outstanding arrears no longer match authorized arrears offset. Payout must be re-authorized.`
3. **Atomic Due Settlement & Allocation Audit Log (FIN-A)**:
   - For every unpaid due offset from the prize payout, the system sets `status: PAID`, records `paidAmount`, and emits an immutable audit log: `PRIZE_ARREARS_OFFSET_ALLOCATED`.
   - Guaranteed zero double deduction and zero double collection.
4. **Staff Payout Override Prohibition (`KFC-FIN-004`)**:
   - Any attempt by staff to manually override or alter the payout amount is rejected with:
     `HTTP 400 Bad Request: PAYOUT_OVERRIDE_NOT_PERMITTED: Manual override of authorized payout is prohibited.`

---

## 11. Finalized Auction Correction Downstream Integrity Guard (FIN-E & KFC-FIN-005)

1. **Dual Control Requirement**: Partner A requests (`POST /auctions/:id/request-correction`); independent Partner B approves (`POST /auctions/:id/approve-correction`).
2. **Disbursed Prize Immutability**: If prize money has already been disbursed to the winner, correction is strictly rejected: `DISBURSED_PRIZE_IMMUTABLE`.
3. **Settled Financial History Preservation (FIN-E)**:
   - If ANY subscriber has already paid their installment due for downstream Month $N+1$, correction fails closed:
     `HTTP 400 Bad Request: ALREADY_PAID_DUES_EXIST: Cannot request/approve correction because downstream dues have already been paid. Correction would invalidate settled financial history.`

---

## 12. Defaulter & Early Exit Settlement Policy Guard (FIN-F & Q25)

1. **Statutory Status**: Policy regarding damage deduction percentages (4% commission vs 5% damages under Section 30 Chit Funds Act) remains **UNCONFIRMED** by Kumaran Finance partners and legal counsel.
2. **Fail-Closed Execution Guard**:
   - Calling `POST /tickets/:id/settle-removal` strictly fails closed with:
     `HTTP 400 Bad Request: UNAPPROVED_SETTLEMENT_POLICY: Early exit and defaulter settlement policy (Q25) has not been confirmed by business owner and legal counsel. Automatic settlement execution is blocked.`
   - Prevents illegal or unauthorized forfeiture of subscriber capital.
