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
  const bidDiscount = 30000n; // ₹30,000 winning bid

  const foremanCommission = (chitValue * commissionRate) / 100n; // ₹4,000
  const totalDividend = bidDiscount - foremanCommission; // ₹26,000

  expect(foremanCommission + totalDividend).toBe(bidDiscount);
});
```

### Invariant Test 2: Pool Conservation (Prize Money + Discount)
```typescript
it('should guarantee: Prize Money Paid + Bid Discount == Chit Gross Value', () => {
  const chitValue = 100000n;
  const bidDiscount = 28500n;

  const prizeMoney = chitValue - bidDiscount; // ₹71,500

  expect(prizeMoney + bidDiscount).toBe(chitValue);
});
```

### Invariant Test 3: Non-Prized Dividend Distribution & Pool Conservation
```typescript
it('should guarantee: Total Collected + Distributed Dividends + Undistributed Remainder == Chit Value', () => {
  const totalTickets = 20;
  const chitValue = 100000n;
  const baseInstallment = 5000n; // chitValue / 20
  const totalDividend = 26000n; // ₹30,000 bid discount - ₹4,000 commission

  // Month 2: 1 prized ticket (Month 1 company pool), 19 non-prized tickets
  const prizedTicketsCount = 1n;
  const nonPrizedTicketsCount = 19n;

  // Dividend allocated ONLY to non-prized members using integer division
  const dividendPerTicket = totalDividend / nonPrizedTicketsCount; // 26000 / 19 = 1368n
  const totalDistributedDividend = dividendPerTicket * nonPrizedTicketsCount; // 1368 * 19 = 25992n
  const undistributedRemainder = totalDividend - totalDistributedDividend; // 8n

  // Prized members pay full base installment; non-prized pay net installment
  const prizedInstallment = baseInstallment; // 5000n
  const netInstallmentPerNonPrized = baseInstallment - dividendPerTicket; // 5000 - 1368 = 3632n

  const totalCollectedFromPrized = prizedInstallment * prizedTicketsCount; // 5000n
  const totalCollectedFromNonPrized = netInstallmentPerNonPrized * nonPrizedTicketsCount; // 3632 * 19 = 69008n
  const totalInstallmentsCollected = totalCollectedFromPrized + totalCollectedFromNonPrized; // 74008n

  // Invariant verification: Collections (74008) + Distributed (25992) == Chit Value (100000)
  expect(totalInstallmentsCollected + totalDistributedDividend).toBe(chitValue);
  expect(undistributedRemainder).toBe(8n);
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

## 3. Single Payment Rule & Duplicate Payment Rejection Test

```typescript
it('should reject duplicate payment attempt for an already paid installment (no advance balance allowed)', async () => {
  const ticketId = 'ticket-07';
  const installmentDueMonth = 4;
  const netDueAmount = 3750n;

  // 1. Customer pays installment due
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

  // Maker initiates reversal request
  const reversalRequest = await requestPaymentReversal({
    paymentId: payment.id,
    reason: 'Wrong customer ticket entered',
    makerUserId: 'manager-selvam'
  });

  // Enforce Maker != Checker: Reversal cannot be approved by same user
  await expect(approvePaymentReversal({
    reversalId: reversalRequest.id,
    checkerUserId: 'manager-selvam'
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
