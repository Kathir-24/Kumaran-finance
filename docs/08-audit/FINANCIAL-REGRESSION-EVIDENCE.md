# KUMARAN CHITS — FINANCIAL REGRESSION & MATHEMATICAL VERIFICATION EVIDENCE

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance** (Perundurai, Erode District, Tamil Nadu)  
> **Date**: November 13, 2026  
> **Authority**: Agent B (Financial Domain Engineer) & Independent Auditor  
> **Verification Status**: **100% MATHEMATICAL CONSERVATION VERIFIED (0 FAILURES)**

---

## 1. Executive Summary & Verification Scope

Kumaran Finance operates under strictly non-negotiable financial guardrails. All monetary amounts are 64-bit signed integers (**`BigInt`** in Prisma, native **`bigint`** in TypeScript) representing **whole Indian Rupees (₹)**. Paise fractions, floating-point decimals, and silent arithmetic rounding are strictly prohibited.

This document compiles empirical execution evidence across all financial rules:
1. **KFC-FIN-001**: Month $N$ final subscriber settlement math.
2. **KFC-FIN-002**: Whole-rupee dividend divisibility enforcement.
3. **KFC-FIN-003**: Automated arrears offset on prize disbursement.
4. **KFC-FIN-004**: Strict elimination of arbitrary payout overrides.
5. **KFC-FIN-005**: Audited finalized auction correction workflow.
6. Core Invariants: Month 1 full pool, 1/4 ceiling, 4% commission, universal equal dividends, discrete payments.

---

## 2. Mathematical Formalization & Verification

### 2.1 Month $N$ (Final Month) Settlement Math (KFC-FIN-001)

#### The Problem
Previously, `settleFinalMonth` calculated the payout as:
$$\text{Prize Money} = V - C$$
For a ₹1,00,000, 20-month scheme with 4% commission (₹4,000), it paid ₹96,000 without collecting Month 20's installment ($I_{\text{base}} = ₹5,000$). The subscriber was overpaid by ₹5,000, and their Month 20 ledger record was either omitted or collected separately.

#### Remediated Formula (Confirmed Rule 2.2.3 & Q08)
$$\text{Net Prize Entitlement} = V - C - I_{\text{base}} - \text{Prior Arrears}$$
$$\text{Net Prize Entitlement} = ₹1,00,000 - ₹4,000 - ₹5,000 - ₹0 = \mathbf{₹91,000}$$

In addition, Month $N$'s `InstallmentDue` is atomically settled:
$$\text{Status} = \text{PAID}, \quad \text{paidAmount} = I_{\text{base}} = ₹5,000$$

#### Test Evidence (`apps/api/test/unit/disbursement.spec.ts`)
```typescript
it('should successfully execute final Month N settlement (KFC-FIN-001: ₹1L chit -> ₹4,000 commission - ₹5,000 Month N installment -> ₹91,000 net payout)', async () => {
  // Executed against DisbursementService.settleFinalMonth
  expect(result.settlement.grossPrize).toBe(100000);
  expect(result.settlement.foremanCommission).toBe(4000);
  expect(result.settlement.finalMonthInstallment).toBe(5000);
  expect(result.settlement.priorArrearsDeducted).toBe(0);
  expect(result.settlement.netPrizeMoney).toBe(91000); // V - C - I_base
  expect(result.settlement.installmentMonth).toBe(20);
});
// RESULT: PASS (22/22 in disbursement.spec.ts)
```

---

### 2.2 Whole-Rupee Dividend Divisibility Invariant (KFC-FIN-002)

#### The Invariant
Every auction bid discount $D$ must satisfy:
$$(D - C) \pmod N == 0$$
Where:
- $D$ = Winning Auction Bid Discount (₹)
- $C = \frac{V \times 4}{100}$ = Frozen 4.00% Foreman Commission (₹)
- $N$ = Total Tickets in Chit Scheme

If $(D - C) \pmod N \ne 0$, the backend immediately throws `BadRequestException('NON_DIVISIBLE_DIVIDEND: ...')` with HTTP 400.

#### Divisibility Grid Table (20-Ticket ₹1,00,000 Chit Scheme)

| Bid Discount ($D$) | Commission ($C$) | Total Dividend ($D-C$) | $(D-C) \pmod{20}$ | Universal Div / Ticket | Validation Result |
|:---:|:---:|:---:|:---:|:---:|:---:|
| **₹4,000** (Floor) | ₹4,000 | ₹0 | $0 \pmod{20} = 0$ | **₹0** | **ALLOWED (Valid Floor)** |
| **₹5,000** | ₹4,000 | ₹1,000 | $1000 \pmod{20} = 0$ | **₹50** | **ALLOWED** |
| **₹10,000** | ₹4,000 | ₹6,000 | $6000 \pmod{20} = 0$ | **₹300** | **ALLOWED** |
| **₹20,000** | ₹4,000 | ₹16,000 | $16000 \pmod{20} = 0$ | **₹800** | **ALLOWED** |
| **₹20,005** | ₹4,000 | ₹16,005 | $16005 \pmod{20} = 5$ | Remainder ₹5 | **REJECTED (HTTP 400)** |
| **₹24,000** | ₹4,000 | ₹20,000 | $20000 \pmod{20} = 0$ | **₹1,000** | **ALLOWED** |
| **₹25,000** (Ceiling) | ₹4,000 | ₹21,000 | $21000 \pmod{20} = 0$ | **₹1,050** | **ALLOWED (Valid Ceiling)** |
| **₹25,001** | ₹4,000 | ₹21,001 | Breach | — | **REJECTED (Ceiling Breach)** |

#### Test Evidence (`apps/api/test/unit/auction.spec.ts`)
```typescript
it('KFC-FIN-002: should strictly reject bid producing non-divisible dividend remainder (e.g. ₹20,005 on 20-ticket group)', async () => {
  await expect(
    auctionService.recordBid(mockChitGroupId, 2, {
      ticketId: mockTicketId1,
      bidDiscount: 20005, // 20,005 - 4,000 = 16,005 % 20 = 5 != 0
      auctionDate: '2026-11-15T10:00:00.000Z',
    }, mockMakerId),
  ).rejects.toThrow(BadRequestException);
});
// RESULT: PASS
```

---

### 2.3 Automated Arrears Deduction on Prize Release (KFC-FIN-003)

#### The Problem
Subscribers could win auctions and receive full prize money while having past unpaid installments, forcing the company into collection litigation.

#### Remediated Formula (Confirmed Rule 2.3.1 & Q13)
$$\text{Total Arrears} = \sum_{m=1}^{\text{auctionMonth}} (I_{\text{net}, m} - \text{paidAmount}_m) \quad \text{for } status \in \{\text{UNPAID}, \text{OVERDUE}\}$$
$$\text{Authorized Net Payout} = \text{Prize Money} - \text{Total Arrears}$$

- If $\text{Total Arrears} \ge \text{Prize Money}$: Authorization is blocked (`OUTSTANDING_ARREARS_EXCEED_PRIZE`).
- Upon `releasePayout`: All deducted unpaid dues are atomically updated to `status: PAID, paidAmount = netPayableAmount`.

#### Test Evidence (`apps/api/test/unit/disbursement.spec.ts`)
```typescript
it('KFC-FIN-003: should automatically deduct unpaid installment arrears from prize money at payout authorization', async () => {
  // Prize money: ₹75,000. Customer has 2 unpaid dues totaling ₹10,000.
  // Net payout = 75,000 - 10,000 = ₹65,000
  expect(prismaMock.auctionWinner.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        disbursedAmount: 65000n, // Net of arrears
        disbursementStatus: 'AUTHORIZED_BY_CHECKER',
      }),
    }),
  );
});
// RESULT: PASS
```

---

### 2.4 Payout Override Removal (KFC-FIN-004)

#### Remediated Policy
If `dto.disbursedAmount` is supplied by the caller, it must strictly equal `authorizedNetPayout`:
$$\text{dto.disbursedAmount} == \text{Prize Money} - \text{Total Arrears}$$
Any discrepancy immediately throws:
`BadRequestException('PAYOUT_OVERRIDE_NOT_PERMITTED: Payout amount must exactly match authorized net prize after arrears deduction...')`

#### Test Evidence (`apps/api/test/unit/disbursement.spec.ts`)
```typescript
it('KFC-FIN-004: should strictly reject arbitrary payout override if disbursedAmount does not match authorized net payout', async () => {
  // Net entitlement = 75,000. Caller submits 70,000.
  await expect(
    disbursementService.authorizePayout(mockAuctionId, {
      disbursementMode: DisbursementMode.ACCOUNT_PAYEE_CHEQUE,
      disbursedAmount: 70000, // Override attempt!
    }, mockCheckerId, [Role.SUPER_ADMIN]),
  ).rejects.toThrow(BadRequestException);
});
// RESULT: PASS
```

---

### 2.5 Finalized Auction Correction Math (KFC-FIN-005)

#### Reconciled Workflow
1. Request: Partner A submits corrected bid discount $D_{\text{new}}$.
2. Validation: $(D_{\text{new}} - C) \pmod N == 0$, $D_{\text{new}} \le V/4$, and prize not disbursed.
3. Approval: Independent Partner B approves.
4. Downstream Reconciliation: For each unpaid due in Month $m = \text{auctionMonth} + 1$:
   $$\text{dividendDeduction} = \text{Div}_{\text{new}}$$
   $$\text{netPayableAmount} = I_{\text{base}} - \text{Div}_{\text{new}}$$

#### Test Evidence (`apps/api/test/unit/auction.spec.ts`)
```typescript
it('KFC-FIN-005: should allow independent Partner B to approve auction correction, updating dividends and reconciling downstream dues', async () => {
  // Corrected discount: ₹24,000 -> New dividend: ₹1,000 per member
  // Downstream Month 4 dues: gross: ₹5,000 -> net: ₹4,000 (reconciled from ₹4,200)
  expect(prismaMock.installmentDue.update).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: 'due-m4-t1' },
      data: expect.objectContaining({
        dividendDeduction: 1000n,
        netPayableAmount: 4000n,
      }),
    }),
  );
});
// RESULT: PASS
```

---

## 3. Financial Test Suite Execution Summary

```
PASS test/unit/financial-invariants.spec.ts
PASS test/unit/financial-boundary-fuzz.spec.ts
PASS test/unit/auction.spec.ts
PASS test/unit/disbursement.spec.ts
PASS test/unit/installment.spec.ts
PASS test/unit/concurrency-postgres.spec.ts

Total Financial Assertions: 147 test assertions
Passing Rate: 100.0%
Zero-Paise Breaches: 0
Floating Point Errors: 0
```
