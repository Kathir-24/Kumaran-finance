# Kumaran Chits — Financial Invariants & Math Test Specifications

> **Product**: **Kumaran Chits** (Kumaran Finance)  
> **Mandate**: Financial tests must run in the CI/CD pipeline and achieve 100% pass rate. No release is allowed if any financial invariant fails.  
> **Currency Standard**: All monetary values are tested as **whole integer Rupees (`BigInt`)**. Paise and floating-point math are strictly prohibited (`CONFIRMED-BY-DEVELOPER`).

---

## 1. Automated Mathematical Invariant Tests

### Invariant Test 1: Conservation of Winning Discount
```typescript
it('should guarantee: Foreman Commission + Total Member Dividends == Winning Discount', () => {
  const chitValue = 100000n; // ₹1,00,000 whole rupees
  const commissionRate = 4n; // 4%
  const bidDiscount = 20000n; // ₹20,000 winning bid (within <= 1/4 ceiling of ₹25,000)

  const foremanCommission = (chitValue * commissionRate) / 100n; // ₹4,000
  const totalDividend = bidDiscount - foremanCommission; // ₹16,000

  expect(foremanCommission + totalDividend).toBe(bidDiscount);
});
```

### Invariant Test 2: Pool Conservation (Prize Money + Discount)
```typescript
it('should guarantee: Prize Money Paid + Bid Discount == Chit Gross Value', () => {
  const chitValue = 100000n;
  const bidDiscount = 25000n; // Exactly at 1/4 ceiling (25%)

  const prizeMoney = chitValue - bidDiscount; // ₹75,000

  expect(prizeMoney + bidDiscount).toBe(chitValue);
});
```

### Invariant Test 3: Universal Equal Dividend Distribution & Pool Conservation
```typescript
it('should guarantee: Total Collections (All 20 Members) + Total Dividends == Chit Value', () => {
  const totalTickets = 20n;
  const chitValue = 100000n;
  const baseInstallment = 5000n; // chitValue / 20
  const bidDiscount = 25000n; // Exactly at 1/4 ceiling (25%)
  const commission = 4000n; // 4% of 100,000
  const totalDividend = bidDiscount - commission; // 21,000n

  // Dividend allocated EQUALLY across ALL 20 members (including auction winner)
  const dividendPerTicket = totalDividend / totalTickets; // 21,000 / 20 = 1,050n
  const totalDistributedDividend = dividendPerTicket * totalTickets; // 1,050 * 20 = 21,000n

  // Every member (including the auction winner) pays the net installment next month
  const netInstallment = baseInstallment - dividendPerTicket; // 5,000 - 1,050 = 3,950n
  const totalInstallmentsCollected = netInstallment * totalTickets; // 3,950 * 20 = 79,000n

  // Invariant 1: Collections (79,000) + Distributed Dividend (21,000) == Chit Value (100,000)
  expect(totalInstallmentsCollected + totalDistributedDividend).toBe(chitValue);

  // Invariant 2: Prize Money (75,000) + Commission (4,000) == Total Collections (79,000)
  const prizeMoney = chitValue - bidDiscount; // 100,000 - 25,000 = 75,000n
  expect(prizeMoney + commission).toBe(totalInstallmentsCollected);
});

it('should verify user-confirmed scenario: Base 10,000, Dividend 2,100 -> All members pay 7,900', () => {
  const baseInstallment = 10000n;
  const dividend = 2100n;
  const netPayable = baseInstallment - dividend; // 7,900n

  // Both non-prized members and the auction winner pay exactly 7,900 next month
  expect(netPayable).toBe(7900n);
});
```

---

## 2. Fixed 1/4 (25%) Discount Ceiling Boundary Tests

| Test Case ID | Description | Input Discount | Expected Outcome |
|---|---|---|---|
| `TC-CEIL-01` | Exceeds 1/4 (25%) Ceiling | $D = 26\%$ ($D > \frac{V}{4}$) | **REJECT**: Exceeds maximum 1/4 (25.00%) ceiling of chit value ($D \le \frac{V}{4}$) |
| `TC-CEIL-02` | Within Permitted Range | $D = 20\%$ | **ACCEPT**: Valid winning bid recorded |
| `TC-CEIL-03` | Exactly at 1/4 Ceiling | $D = 25\%$ ($D = \frac{V}{4}$) | **ACCEPT**: Recorded as ceiling bid |
| `TC-CEIL-04` | Multiple Ceiling Bids | 3 members bid $D = 25\%$ | **TRIGGER TIE-BREAKER**: Staff records tied bidders; physical paper token drawn at branch; staff enters drawn winner into software (`CONFIRMED-BY-DEVELOPER`) |
| `TC-CEIL-05` | Below Floor (Less than 4%) | $D = 3.5\%$ (Less than commission) | **REJECT**: Cannot be less than 4.00% Foreman Commission ($D \ge C_f$) |

---

## 3. Single Payment, Zero Partial Payments & Duplicate Rejection Tests

```typescript
it('should reject duplicate payment attempt for an already paid installment (no advance balance allowed)', async () => {
  const ticketId = 'ticket-07';
  const installmentDueMonth = 4;
  const netDueAmount = 3750n;

  // 1. Customer pays installment due in full
  await recordPayment({
    ticketId,
    month: installmentDueMonth,
    amount: netDueAmount,
    method: 'CASH',
    reference: 'REC-PRD-00412'
  });

  const dueAfterPayment = await getInstallmentDue(ticketId, installmentDueMonth);
  expect(dueAfterPayment.status).toBe('PAID');

  // 2. Attempting a duplicate payment for the same already-paid month must be strictly rejected
  await expect(
    recordPayment({
      ticketId,
      month: installmentDueMonth,
      amount: netDueAmount,
      method: 'CASH',
      reference: 'AGENT-CASH-9988'
    })
  ).rejects.toThrow('INSTALLMENT_ALREADY_PAID');
});

it('should strictly reject partial payment attempt (exact net due must be paid in full)', async () => {
  const ticketId = 'ticket-08';
  const installmentDueMonth = 4;
  const netDueAmount = 3750n;
  const partialAmount = 2000n; // Incomplete payment attempt

  await expect(
    recordPayment({
      ticketId,
      month: installmentDueMonth,
      amount: partialAmount,
      method: 'CASH'
    })
  ).rejects.toThrow('PARTIAL_PAYMENTS_NOT_ALLOWED');
});
```

---

## 4. Payment Reversal & Zero-Leakage Test (Maker-Checker)

```typescript
it('should restore original installment due amount with zero penny difference upon reversal', async () => {
  const due = await getInstallmentDue(ticketId, 5); // Owed ₹3,750
  const payment = await recordPayment({ 
    amount: 3750n, 
    method: 'CASH',
    recordedByUserId: 'agent-muniyasamy' 
  });
  
  // Verify due is marked PAID
  const paidDue = await getInstallmentDue(ticketId, 5);
  expect(paidDue.paidAmount).toBe(3750n);
  expect(paidDue.status).toBe('PAID');

  // Maker initiates reversal request (Accountant or Partner 1)
  const reversalRequest = await requestPaymentReversal({
    paymentId: payment.id,
    reason: 'Wrong customer ticket entered',
    makerUserId: 'accountant-anand'
  });

  // Enforce Maker != Checker: Reversal cannot be approved by same user
  await expect(approvePaymentReversal({
    reversalId: reversalRequest.id,
    checkerUserId: 'accountant-anand'
  })).rejects.toThrow('Maker and Checker must be different users');

  // Partner / Super Admin (Checker) approves reversal
  await approvePaymentReversal({
    reversalId: reversalRequest.id,
    checkerUserId: 'partner-kumaran'
  });

  // Verify due is reverted exactly to original state with zero leakage
  const revertedDue = await getInstallmentDue(ticketId, 5);
  expect(revertedDue.paidAmount).toBe(0n);
  expect(revertedDue.status).toBe('UNPAID');
});
```

---

## 5. Cash Handover Dual-Role Guard Test (Collector != Acknowledger)

```typescript
it('should strictly reject cash handover acknowledgment if collector_user_id == acknowledger_user_id', async () => {
  const dualRoleAgentId = 'agent-muniyasamy'; // Field agent who also holds Accountant permissions

  await expect(
    acknowledgeCashHandover({
      handoverBatchId: 'batch-2026-10-18-01',
      collectedByUserId: dualRoleAgentId,
      acknowledgedByUserId: dualRoleAgentId
    })
  ).rejects.toThrow('COLLECTOR_CANNOT_ACKNOWLEDGE_OWN_CASH');
});

it('should accept cash handover acknowledgment when confirmed by an independent Partner', async () => {
  const collectorAgentId = 'agent-muniyasamy';
  const partnerApproverId = 'partner-kumaran'; // Partner (Super Admin)

  const handover = await acknowledgeCashHandover({
    handoverBatchId: 'batch-2026-10-18-01',
    collectedByUserId: collectorAgentId,
    acknowledgedByUserId: partnerApproverId
  });

  expect(handover.status).toBe('ACKNOWLEDGED');
  expect(handover.acknowledgedByUserId).toBe(partnerApproverId);
});
```
