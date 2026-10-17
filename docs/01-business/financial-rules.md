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
| **Total Tickets / Members** | $M$ | Total number of tickets participating ($M = N$). A single customer can join multiple chits, but cannot hold 2 or more tickets in the same chit group (`CONFIRMED-BY-DEVELOPER`). | `CONFIRMED-BY-DEVELOPER` |
| **Base Monthly Installment** | $I_{base}$ | Base gross installment per ticket before dividend deduction: $I_{base} = \frac{V}{N}$ (e.g., ₹5,000). Always whole rupees. | `CONFIRMED-BY-DEVELOPER` |
| **Foreman Commission Rate** | $r_f$ | Configurable default rate of **4.00%** ($0.04$). Copied from settings when a chit is created; frozen per chit once active. May be changed for future chits. | `CONFIRMED-BY-DEVELOPER` |
| **Foreman Commission Amount** | $C_f$ | Commission retained by company: $C_f = V \times r_f = V \times 0.04$. Always whole rupees. | `CONFIRMED-BY-DEVELOPER` |
| **Auction Bid Discount** | $D$ | Amount forgone by winning bidder to claim prize money early. Always whole rupees. | `CONFIRMED-BY-DEVELOPER` |
| **Total Member Dividend** | $Div_{total}$ | Net discount available after commission: $Div_{total} = D - C_f$. Always whole rupees. | `CONFIRMED-BY-DEVELOPER` |
| **Eligible Non-Prized Tickets** | $M_{non-prized}$ | Number of non-winning tickets eligible to receive dividend in that month. | `CONFIRMED-BY-DEVELOPER` |
| **Dividend Per Non-Prized Ticket** | $Div_{ticket}$ | Dividend allocated per eligible non-prized ticket: $Div_{ticket} = \lfloor \frac{Div_{total}}{M_{non-prized}} \rfloor$. Always whole rupees. | `CONFIRMED-BY-DEVELOPER` |
| **Net Installment Payable** | $I_{net}$ | Actual amount payable by a non-prized subscriber in that month: $I_{net} = I_{base} - Div_{ticket}$ (e.g., if base is ₹10,000 and dividend is ₹1,000, subscriber pays ₹9,000). Applies across all schemes. Always whole rupees. | `CONFIRMED-BY-DEVELOPER` |
| **Prized Subscriber Installment** | $I_{prized}$ | Subscribers who have already won previous auctions pay the **full base installment** ($I_{base}$) with no dividend deduction. Always whole rupees. | `CONFIRMED-BY-DEVELOPER` |
| **Prize Money** | $P$ | Amount payable to winning subscriber before deductions: $P = V - D$. Always whole rupees. | `CONFIRMED-BY-DEVELOPER` |

---

## 2. Walkthrough Example (₹1,00,000 Chit, 20 Months, 4% Commission)

The numbers below illustrate arithmetic relationships based on confirmed rules:
- **Chit Value ($V$)**: ₹1,00,000
- **Duration ($N$)**: 20 months
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

### Installment Calculation Applied to All Schemes (`CONFIRMED-BY-DEVELOPER`):
- **Dividend Eligibility (`CONFIRMED-BY-DEVELOPER`)**: Dividend is shared **only among non-prized (remaining non-winning) members**. Once a subscriber wins the prize money, they do not receive dividends in subsequent months.
- **Monthly Payable Rule (`CONFIRMED-BY-DEVELOPER`)**:
  - If a customer’s base installment is ₹10,000 per month and their allocated dividend is ₹1,000, **they pay ₹9,000 on that month**.
  - In this 20-month example:
    - Non-prized members pay: $I_{net} = I_{base} - Div_{ticket}$.
    - Prized past winners pay the full base installment: $I_{base} = ₹5,000$.

### Final Month (Month $N$): Settlement (`CONFIRMED-BY-DEVELOPER`)
- **No Auction**: There is **NO bidding auction** in the final month.
- **Settlement Flow**:
  1. The single remaining non-prized subscriber is entitled to the final prize money.
  2. The company takes the 4.00% foreman commission ($C_f$) and the final month's payable installment.
  3. The company settles the entire remaining prize amount directly to the final subscriber with a formal settlement payout receipt.

---

## 3. Dividend Settlement Rules (`CONFIRMED-BY-DEVELOPER`)

The dividend settlement policy is confirmed as follows:

1. **Who Receives Dividend? (`CONFIRMED-BY-DEVELOPER`)**:
   - Dividend is shared **ONLY among NON-PRIZED (remaining non-winning) members**.
   - Once a subscriber wins an auction and claims the prize money, they become "prized" and **do not receive dividends in subsequent months**.
2. **How is Dividend Settled? (`CONFIRMED-BY-DEVELOPER`)**:
   - The dividend is **deducted directly from that month’s payable installment**:
     $$I_{net} = I_{base} - Div_{ticket}$$
   - This monthly deduction rule **applies across all schemes** (`CONFIRMED-BY-DEVELOPER`).
   - Prized members pay the full base installment amount ($I_{base}$) with no dividend deduction.

---

## 4. Rounding and Remainder Handling (`CONFIRMED-BY-DEVELOPER`)

- **Whole Number Mandate (`CONFIRMED-BY-DEVELOPER`)**: All financial values in Kumaran Finance (installments, dividends, commissions, prize payouts, and receipts) are **always whole numbers (Rupees only; paise never comes in)**.
- **Standard Dividend Policy (`CONFIRMED-BY-DEVELOPER`)**: Kumaran Finance maintains standard dividend amounts across chit groups, ensuring clean whole numbers are maintained without fractional rupee accumulation or division issues.

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
  - Generation of bilingual (English + Tamil) receipts (physical and digital PDF) is in V1 scope (`CONFIRMED-BY-DEVELOPER`).
  - SMS & WhatsApp payment notifications are in V1 scope (`CONFIRMED-BY-DEVELOPER`).
  - Payout vouchers support Cheque, NEFT/RTGS/IMPS, and Cash (`CONFIRMED-BY-DEVELOPER`).

---

## 8. Defaulter Rules & Auction Bidding Ineligibility (`CONFIRMED-BY-DEVELOPER`)

1. **Auction Bidding Ineligibility for Unpaid Dues (`CONFIRMED-BY-DEVELOPER`)**:
   - Any subscriber who has not paid their installment due for a specific month is **strictly ineligible to participate or bid in that month's auction**.
   - The software enforces this condition automatically: staff cannot select an unpaid subscriber as an active bidder or auction winner for that installment month.

2. **3-Month Consecutive Arrears & Company Removal Rights (`CONFIRMED-BY-DEVELOPER`)**:
   - If a subscriber fails to pay their monthly installment for **3 continuous (consecutive) months**, the company has the full right and authority to **remove the customer from the chit group**.
   - The software tracks consecutive missed installments, flags the ticket with status `DEFAULT_3_MONTHS`, and provides an authorized workflow for company management / partners to formally remove the customer and reassign or settle the ticket according to company policy.
