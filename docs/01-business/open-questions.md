# Kumaran Chits — Master Open Questions & Unverified Legal Log

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance**  
> **Purpose**: Consolidates every `CONFIRMED-BY-DEVELOPER`, `OPEN`, and `UNVERIFIED-LEGAL` item across business, operational, and technical documentation in one centralized log.  
> **Rule**: No unverified assumption may be implemented in production software without prior written sign-off from the designated responsible party.

---

## 1. Questions & Confirmations for the Company Owner (Kumaran Finance)

| # | Topic | Question / Resolved Decision | Source Document | Status |
|---|---|---|---|---|
| **O-01** | **Staff Roles & Headcount** | Kumaran Finance operates with **4 equal partners** and **2 to 3 field collection agents** from **1 physical branch office**. The 4 partners assign standard software personas (`Super Admin`, `Branch Manager`, `Accountant`, `Collection Agent`, `Customer`, `Auditor`) among themselves as needed. | `permissions-matrix.md` | `CONFIRMED-BY-DEVELOPER` |
| **O-02** | **Accountant Scope & Authority** | The role is simple **"Accountant"**. Accountant verifies collections, day books, cash handovers, bank reconciliations, and prepares vouchers. Final approvals for payment reversals and prize disbursements are strictly reserved for Super Admin / Owner. | `permissions-matrix.md` | `CONFIRMED-BY-DEVELOPER` |
| **O-03** | **"Head Office Accountant"** | Retain simply "Accountant"; no "Head Office Accountant". Single company/branch accountant role applies. | `permissions-matrix.md` | `CONFIRMED-BY-DEVELOPER` |
| **O-04** | **Dividend Settlement Policy** | Deducted directly from that month's installment payable: Customer pays Net = Base Installment minus Dividend (e.g., if base is ₹10,000 and dividend is ₹1,000, customer pays ₹9,000; applies to all schemes). | `financial-rules.md` | `CONFIRMED-BY-DEVELOPER` |
| **O-05** | **Month 1 & Final Month Rules** | **Month 1**: One company person acts as customer (holds 1 ticket); full pool collected and taken by company; **NO auction** in Month 1; dividend is ₹0. **Month $N$**: **NO auction**; company takes 4.00% commission and last month's payable installment, and settles the entire prize money to the final subscriber with a receipt. | `financial-rules.md` | `CONFIRMED-BY-DEVELOPER` |
| **O-06** | **Tie-Breaker Method** | **Option A (Physical Draw)**: When multiple members bid the ceiling discount, the Foreman draws paper tokens physically at the branch in front of members; staff enters the drawn winning ticket number into the software. | `financial-rules.md` | `CONFIRMED-BY-DEVELOPER` |
| **O-07** | **Single Discrete Payment & Zero Advance Balance** | Each installment month accepts strictly one discrete payment matching the net installment due. Double payments for the same month never occur; the concept of "Advance Balance" is completely eliminated. | `decision-log.md` (ADR-07) | `CONFIRMED-BY-DEVELOPER` |
| **O-08** | **Multiple Tickets per Scheme** | A single customer can join multiple chit groups, but **cannot hold 2 or more tickets in the same chit group** (Max 1 ticket per customer per scheme). | `decision-log.md` (ADR-13) | `CONFIRMED-BY-DEVELOPER` |
| **O-09** | **Password Reset Delegation** | Staff credential resets are handled strictly by Super Admin. Customers perform self-resets via verified mobile OTP/MPIN. | `permissions-matrix.md` | `CONFIRMED-BY-DEVELOPER` |
| **O-10** | **Handover & Cloud Terms** | What are the commercial and handover terms under which code, AWS cloud accounts, and domain will transition from Developer to Kumaran Finance? | `decision-log.md` (ADR-10) | `OPEN` |
| **O-11** | **Provider Onboarding** | Has Kumaran Finance initiated merchant onboarding for Indian Telecom DLT SMS and WhatsApp Business API under the financial/chit-fund category? | `decision-log.md` (ADR-12) | `OPEN` |

---

## 2. Questions for the Company Accountant

| # | Topic | Question / Resolved Decision | Source Document | Status |
|---|---|---|---|---|
| **A-01** | **Dividend Distribution Eligibility** | Dividend is shared ONLY among NON-PRIZED (remaining non-winning) members. Once a subscriber wins, they do NOT receive dividends in subsequent months; they pay full base installment. | `financial-rules.md` | `CONFIRMED-BY-DEVELOPER` |
| **A-02** | **Rounding and Remainder Handling** | All financial values (installments, dividends, prizes, commissions) are **always whole numbers (Rupees only; paise never comes in)**. Kumaran Finance maintains a standard dividend amount so clean whole numbers are maintained without fractional remainder issues. | `financial-rules.md` | `CONFIRMED-BY-DEVELOPER` |
| **A-03** | **Statutory Registers Format** | What are the exact ledger column layouts currently used by Kumaran Finance for the Subscribers' Ledger (Form XXI) and Day Book/Cash Book (Form XXII)? *(Obtain physical sample sheets).* | `compliance-checklist.md` | `UNVERIFIED-LEGAL` |
| **A-04** | **Income Tax Cash Payout Limits** | What are the current Income Tax limits (e.g., Section 269ST) for cash prize payouts, and should the software enforce a hard block on cash disbursements exceeding statutory limits? | `decision-log.md` (ADR-14) | `UNVERIFIED-LEGAL` |
| **A-05** | **PAN Collection Thresholds** | At what transaction value or aggregate annual subscription threshold is PAN collection legally required for chit subscribers? | `compliance-checklist.md` | `UNVERIFIED-LEGAL` |

---

## 3. Questions for a Qualified Tamil Nadu Legal / Chit-Fund Professional

| # | Topic | Question | Source Document | Status |
|---|---|---|---|---|
| **L-01** | **Chit Funds (Amendment) Act, 2019 Status in Tamil Nadu** | Has the 2019 Central Amendment Act (raising the foreman commission cap from 5% to 7%) been formally notified and brought into force in Tamil Nadu? (Kumaran Chits operates at 4.00%). | `compliance-checklist.md` | `UNVERIFIED-LEGAL` |
| **L-02** | **Auction Discount Ceiling** | Kumaran Finance fixes the auction discount ceiling at strictly 1/4 (25.00%) of the total chit value across all months ($D \le \frac{V}{4}$). (Any broader state-wide statutory questions remain `UNVERIFIED-LEGAL`). | `financial-rules.md`, `decision-log.md` (ADR-06) | `CONFIRMED-BY-DEVELOPER` (Kumaran 1/4 Rule) / `UNVERIFIED-LEGAL` |
| **L-03** | **Foreman Security Deposit Requirements** | What percentage and type of security deposit (e.g., 100% FDR pledged to Registrar) is mandated by the Tamil Nadu Chit Funds Rules before a certificate of commencement is issued? | `compliance-checklist.md` | `UNVERIFIED-LEGAL` |
| **L-04** | **Auction Minutes Filing Timeline** | What is the mandatory statutory timeframe (e.g., within 21 days) for filing signed auction minutes with the Registrar of Chits? | `compliance-checklist.md` | `UNVERIFIED-LEGAL` |
| **L-05** | **Company Safety Proof & Collateral Checklist** | Software implements a flexible safety checklist: signed agreement with winner & nominee [Yes/No], signed blank cheques [Yes/No], promissory notes, and scanned uploads (`CONFIRMED-BY-DEVELOPER`). Property documents are eliminated; collateral is evaluated case-by-case and is **NOT mandatory** (`CONFIRMED-BY-DEVELOPER`). Legal validity questions remain `UNVERIFIED-LEGAL`. | `compliance-checklist.md`, `decision-log.md` (ADR-15) | `CONFIRMED-BY-DEVELOPER` |
| **L-06** | **Record Retention Periods** | What is the statutory record retention mandate (e.g., 8 years) for paper chit ledgers, auction minutes, and surety documents? | `compliance-checklist.md` | `UNVERIFIED-LEGAL` |
| **L-07** | **Digital Personal Data Protection (DPDP) Act, 2023** | What specific consent notices, data correction mechanisms, and grievance redressal channels must be included in the software for customer KYC and Aadhaar handling? | `compliance-checklist.md` | `OPEN` / `UNVERIFIED-LEGAL` |
| **L-08** | **Tamil Nadu Chit Rules & G.O. References** | Are citations such as "G.O. Ms. No. 343" current and applicable to private chit fund companies operating in the relevant district? | `compliance-checklist.md` | `UNVERIFIED-LEGAL` |
