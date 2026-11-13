# FINANCIAL MATHEMATICS & INVARIANTS VERIFICATION — KUMARAN CHITS
**Kumaran Finance — Perundurai Head Office, Erode District, Tamil Nadu**  
**Audit Stage**: Independent Verification & Financial Engineering Audit  
**Date**: November 2026  
**Auditor**: Antigravity Senior Engineering & Audit Swarm  

---

## 1. Core Mathematical Axioms

Financial integrity in Kumaran Chits is governed by 5 non-negotiable mathematical axioms:

1. **Pure Whole-Rupee Math**:
   All monetary amounts are 64-bit signed integers (**`BigInt`** in Prisma, native **`bigint`** in TypeScript). Decimal paise (`.00`), floating-point numbers (`float`, `double`, IEEE 754), and rounding heuristics are strictly prohibited in financial code.
2. **Fixed 1/4 (25%) Discount Ceiling**:
   $$D \le \frac{V}{4}$$
   The bid discount $D$ cannot exceed one-fourth of total chit value $V$.
3. **Commission Rate Freeze**:
   $$C = V \times 0.04$$
   Foreman commission is fixed strictly at 4.00% of chit value, copied and frozen per chit scheme upon activation.
4. **Universal Equal Dividend Deduction**:
   $$\text{Total Dividend} = D - C$$
   $$\text{Dividend per Ticket } (Div) = \frac{D - C}{N}$$
   $$\text{Net Monthly Installment } (I_{net}) = I_{base} - Div$$
   Every member in the chit scheme (including the auction winner and all past prized subscribers) pays the exact same net installment $I_{net}$ next month.
5. **Divisibility Invariant (FIN-C)**:
   $$(D - C) \pmod N = 0$$
   Bids that produce fractional paise dividends are strictly rejected with `NON_DIVISIBLE_DIVIDEND`.

---

## 2. Mathematical Formulas & Invariant Assertions

### Formula 1: Standard Chit Scheme Dimensions
For a standard ₹1,00,000, 20-month chit:
- Total Chit Value ($V$): ₹1,00,000
- Total Tickets ($N$): 20
- Duration in Months: 20
- Base Monthly Installment ($I_{base}$):
  $$I_{base} = \frac{V}{N} = \frac{100000}{20} = ₹5,000$$
- Foreman Commission ($C$):
  $$C = 100000 \times 0.04 = ₹4,000$$
- Maximum Auction Discount Ceiling ($D_{max}$):
  $$D_{max} = \frac{100000}{4} = ₹25,000$$
- Minimum Winning Bid Floor ($D_{min}$):
  $$D_{min} = C = ₹4,000$$

---

### Formula 2: Auction Dividend & Prize Money (Months 2 to $N-1$)
Assuming winning bid discount $D = ₹20,000$:
- Net Prize Money ($P$):
  $$P = V - D = 100000 - 20000 = ₹80,000$$
- Total Dividend Pool:
  $$\text{Pool} = D - C = 20000 - 4000 = ₹16,000$$
- Dividend per Ticket:
  $$Div = \frac{16000}{20} = ₹800$$
- Net Installment for Month 3 (all members):
  $$I_{net} = 5000 - 800 = ₹4,200$$

---

### Formula 3: Month 1 Company Pool
- No auction is conducted.
- Gross pool collected: ₹1,00,000 ($20 \times ₹5,000$).
- Company takes full pool (₹1,00,000) for Ticket #1.
- Dividend: $Div = ₹0$.
- Net Installment for Month 2: ₹5,000 ($I_{net} = I_{base}$).

---

### Formula 4: Month N Final Subscriber Maturity Settlement (FIN-B)
- No auction is conducted.
- The 20th month belongs solely to the final remaining unprized subscriber.
- Gross Prize: ₹1,00,000.
- Foreman Commission: ₹4,000 (4%).
- Case A: Subscriber has NOT yet paid Month 20 installment at branch desk:
  $$\text{Final Month Deduction} = ₹5,000$$
  $$\text{Net Payout} = 100000 - 4000 - 5000 = ₹91,000$$
- Case B: Subscriber has ALREADY paid Month 20 installment at branch desk:
  $$\text{Final Month Deduction} = ₹0$$
  $$\text{Net Payout} = 100000 - 4000 - 0 = ₹96,000$$
  *FIN-B verification: Zero double collection guaranteed.*

---

### Formula 5: Prize Arrears Offset Integrity (FIN-A & FIN-D)
When subscriber #7 wins auction in Month 4 ($P = ₹80,000$):
- Unpaid dues up to Month 4:
  - Month 2 due: ₹4,200
  - Month 3 due: ₹4,400
  - Total Arrears: ₹8,600
- Net Disbursed Payout:
  $$\text{Net Payout} = 80000 - 8600 = ₹71,400$$
- Inside transaction lock:
  - System verifies: `currentArrears === expectedArrears` (₹8,600).
  - Month 2 due updated: `status: PAID`, `paidAmount: 4200n`.
  - Month 3 due updated: `status: PAID`, `paidAmount: 4400n`.
  - Audit log recorded: `PRIZE_ARREARS_OFFSET_ALLOCATED`.
  - Subscriber receives ₹71,400 via cheque/bank transfer/cash.
  - Arrears eliminated with zero double collection.

---

## 3. Financial Test Suite Assertions

| Test Suite | File Path | Assertions Verified | Result |
|---|---|---|---|
| Financial Invariants | `test/unit/financial-invariants.spec.ts` | Pure whole-rupee math, BigInt conversion, no decimal fraction errors | **PASS** |
| Chit Scheme Math | `test/unit/chit.spec.ts` | Whole-rupee divisibility ($V \pmod N = 0$), 4% commission lock, $D \le V/4$ ceiling | **PASS** |
| Auction Math | `test/unit/auction.spec.ts` | Divisibility remainder check (`NON_DIVISIBLE_DIVIDEND`), Month 1 & N block, tie-break ceiling check | **PASS** |
| Disbursement Math | `test/unit/disbursement.spec.ts` | Month N no double deduction (FIN-B), arrears offset TOCTOU (FIN-D), commission deduction | **PASS** |
| Concurrency Math | `test/unit/concurrency-postgres.spec.ts` | Real DB row locking on installment dues, zero duplicate payment, zero double payout | **PASS** |

---

## 4. Edge Case & Adversarial Proofs

1. **Fractional Remainder Attack**:
   - An operator attempts to record bid $D = ₹20,005$ on a 20-ticket scheme ($C = ₹4,000$).
   - Net dividend: $20,005 - 4,000 = ₹16,005$.
   - Divisibility check: $16,005 \pmod{20} = 5 \ne 0$.
   - **Result**: Rejected immediately with `BadRequestException('NON_DIVISIBLE_DIVIDEND')`. Zero fractional paise leaks into database.

2. **Ceiling Breach Attempt**:
   - Operator attempts to record bid $D = ₹26,000$ on ₹1,00,000 chit ($V/4 = ₹25,000$).
   - **Result**: Rejected immediately with `BadRequestException('BID_EXCEEDS_CEILING')`.

3. **Commission Floor Breach**:
   - Operator attempts to record bid $D = ₹3,000$ on ₹1,00,000 chit ($C = ₹4,000$).
   - **Result**: Rejected immediately with `BadRequestException('BID_BELOW_COMMISSION_FLOOR')`.

4. **Stale Arrears Release Race (TOCTOU)**:
   - Partner A authorizes payout with ₹8,600 arrears deduction.
   - Before release, subscriber pays ₹4,200 at branch counter.
   - Release worker attempts payout with stale ₹8,600 offset.
   - **Result**: Inside transaction lock, `currentArrears` (₹4,400) $\ne$ `expectedArrears` (₹8,600).
   - Throws `BadRequestException('ARREARS_STATE_CHANGED')`. Payout blocked until re-authorized.
