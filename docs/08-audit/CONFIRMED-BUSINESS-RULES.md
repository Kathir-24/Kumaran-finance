# KUMARAN CHITS — CONFIRMED BUSINESS REQUIREMENTS REGISTER

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance** (Head Office: Perundurai, Erode District, Tamil Nadu)  
> **Status**: **AUTHORITATIVE BUSINESS OWNER CONFIRMATION**  
> **Baseline Date**: November 13, 2026  
> **Scope Directive**: Flutter Mobile UI and Android implementation are **DEFERRED — OWNER-APPROVED SCOPE EXCLUSION**.  

---

## 1. Statutory & Governance Context

Kumaran Finance operates a registered chit fund under the **Tamil Nadu Chit Funds Rules, 1984** and the **Chit Funds Act, 1982 (Central Act 40 of 1982)**. The business operates from a single head office in Perundurai, managed by 4 equal partners and 2–3 field collection agents.

---

## 2. Confirmed Business Requirements Inventory

### 2.1 Chit Schemes & Membership
1. **Ticket Limitation (ADR-13 / Q01)**: A customer may hold at most **1 ticket per chit group**. (A customer may participate in multiple different chit groups).
2. **Scheme Duration & Ticket Equivalence (Q02)**: In standard chits, **Total Tickets ($N$) must always equal Duration in Months ($M$)**.
3. **Fixed Foreman Commission (ADR-04 / Q03)**: Foreman commission is strictly fixed at **4.00% of chit face value ($V$)** for every scheme ($C = \frac{V \times 4}{100}$).
4. **Maximum Auction Discount Ceiling (ADR-06 / Q04)**: Maximum allowable auction bid discount is fixed at **one-fourth (25%) of chit face value** ($D_{\max} = \frac{V}{4}$).
5. **Full Roster Precondition (Q05)**: A chit group cannot start with vacant tickets. All $N$ tickets must be assigned to verified members before activation.
6. **Single Operating Branch (Q27)**: Currently, only the Perundurai Head Office is operational. The system preserves multi-branch data architecture for future expansion.
7. **Cross-Branch Scoping (Q28)**: Branch managers and field staff are restricted to their own branch. Only authorized Partners (`SUPER_ADMIN`) may view data across branches.

### 2.2 Auction & Dividend Engine
1. **Month 1 Company Entitlement (Q06)**: Month 1 has **NO auction**. The company/foreman takes the full pool ($V$) with ₹0 dividend.
2. **Month N Final Subscriber Maturity (Q07)**: The final month ($N$) has **NO auction**. The single remaining unprized subscriber receives the prize pool.
3. **Month N Installment Deduction (Q08)**: The final-month winner's installment ($I_{\text{base}}$) must be deducted directly from their prize payout ($\text{Net Payout} = V - \text{Commission} - I_{\text{base}}$), and Month $N$'s installment due must be marked settled (`PAID`) exactly once.
4. **Universal Equal Dividend Credit (Q09)**: Dividend is credited equally across **ALL $N$ tickets in the group**, including the auction winner and past prized winners.
5. **Whole-Rupee Dividend Divisibility (Q10)**: Only auction bids that produce an **exactly divisible, whole-rupee dividend** across all members are permitted:
   $$(D_{\text{bid}} - \text{Commission}) \pmod N == 0$$
   Bids producing fractional remainders must be rejected by the backend. Remainders must NEVER be silently truncated or rounded.
6. **Physical Paper Token Tie-Break Draw (Option A / Q11)**: When multiple members bid the maximum 25% discount ceiling, tie resolution is conducted via physical paper token draw at the branch in front of members. The staff enters the drawn winning ticket and token details into the system.
7. **Controlled Finalized Auction Correction (Q12)**: A finalized auction may be corrected only through a controlled, audited workflow requiring approval from a second authorized partner, with compensating ledger adjustments.

### 2.3 Prize Payout & Obligations
1. **Automated Arrears Deduction (Q13)**: All outstanding unpaid installments for the winner's ticket must be automatically deducted from the prize payout snapshot.
2. **No Arbitrary Payout Overrides (Q14)**: Partners cannot arbitrarily reduce or increase the payout amount. The payout must exactly equal:
   $$\text{Authorized Net Payout} = \text{Prize Money} - \text{Outstanding Arrears}$$
3. **Supported Prize Payment Methods (Q15)**: Cash, Bank Transfer (NEFT/RTGS/IMPS), and Account Payee Cheque. Cash disbursements $> ₹10,000$ display statutory IT Act Section 40A(3) / 269ST advisories.
4. **Flexible Security Proof Checklist (Q16)**: On-demand security documents (signed agreement, promissory notes, signed blank cheques, or property records) recorded per company decision. Universal property submission is NOT mandatory.

### 2.4 Collections, Payments & Reversals
1. **Zero Partial Payments (Q17)**: Only full installment payments matching exact $I_{\text{net}} = I_{\text{base}} - Div$ are accepted.
2. **Zero Advance Payments (Q18)**: Payments for future ungenerated months are rejected. Payments must follow sequential due order.
3. **Zero Overpayments (Q19)**: Any payment amount exceeding $I_{\text{net}}$ is rejected.
4. **Supported Collection Modes (Q20)**: Cash, UPI (Deep-link & UTR claim), and Bank Transfer.
5. **Dual-Partner Payment Reversal (Q21)**: Payment reversals must be initiated by one Partner and approved by a different authorized Partner (`maker_partner_id != checker_partner_id`).
6. **Receipt Preservation & Cancelled PDF Watermark (Q22)**: Cancelled receipts retain their sequential receipt number (never deleted or reused). The server-generated PDF must prominently display a bold red bilingual watermark: `ரத்து செய்யப்பட்டது / CANCELLED`.

### 2.5 Defaults, Penalties & Exits
1. **Zero Late Fees or Penalties (Q23)**: Kumaran Finance charges strictly ₹0 late fee and ₹0 penalty interest.
2. **3-Month Arrears Default & Dual-Partner Removal (Q24)**: Missing 3 consecutive monthly installments tags the ticket as default. Subscriber removal requires formal dual-partner approval (`maker_partner_id != checker_partner_id`).
3. **Early Exit Settlement Policy (Q25)**: Subscribers may exit subject to company settlement rules. (Exact forfeiture percentage is pending owner/legal confirmation).
4. **Winning Ticket Immutability (Q26)**: A winning subscriber can NEVER transfer, substitute, or surrender their prized ticket.

### 2.6 Administration & Maker-Checker Separation of Duties
1. **Single Super Admin Administrative Authority (Q29.1–3)**: A single authorized Super Admin may perform ordinary administrative setup (creating staff, configuring schemes, KYC verification).
2. **Auction Finalization Authority (Q29.7–8)**: An auction must be finalized strictly by an authorized Partner (`SUPER_ADMIN`). The recorder (Maker) and finalizer (Checker) must be different individuals.
3. **Dual-Partner Defaulter Removal & Settlement (Q29.4–5)**: Removing a subscriber or issuing an exit refund voucher requires two distinct Partners.
4. **Cash Handover & UPI Verification (Q29.11)**: Field Collector $\ne$ Cashier (Handover); Submitter $\ne$ Bank Credit Verifier (UPI).

### 2.7 Receipts, Language & Communication
1. **Digital PDF Primary Delivery (Q31)**: Standard A5 portrait PDF layout with presigned secure URLs.
2. **Bilingual Requirement (Q32)**: Tamil and English appear together across all receipts, vouchers, and web screens with embedded Unicode fonts.
3. **Customer Notifications (Q34)**: SMS via Indian Telecom DLT only. WhatsApp is strictly out of scope. Push notifications are deferred with the mobile app.
