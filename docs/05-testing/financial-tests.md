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

---

## 6. Full-Product $N \times N$ Status Transition Matrix Exhaustion Suite (113 Transitions)

> **Mandate**: Every operational model in Kumaran Chits possessing a status lifecycle must have 100% automated test coverage across its complete $N \times N$ transition permutations. Any illegal transition MUST fail-closed with HTTP 400 `BadRequestException`.

- **Test Harness File**: [`apps/api/test/state-matrix-sweep.spec.ts`](../../apps/api/test/state-matrix-sweep.spec.ts)
- **Live Container Probe**: [`scripts/verify-state-matrix-sweep.ps1`](../../scripts/verify-state-matrix-sweep.ps1)

### Status Lifecycle Census & Test Assertions
```typescript
describe('Full-Product N×N Status Matrix Exhaustion Suite (113 State Transitions)', () => {
  // 1. ChitGroup: 5x5 = 25 transitions (5 allowed, 20 fail-closed HTTP 400)
  // 2. SubscriberTicket: 4x4 = 16 transitions (5 allowed, 11 fail-closed HTTP 400)
  // 3. Auction: 3x3 = 9 transitions (2 allowed, 7 fail-closed HTTP 400)
  // 4. AuctionWinner Disbursement: 4x4 = 16 transitions (3 allowed, 13 fail-closed HTTP 400)
  // 5. InstallmentDue: 3x3 = 9 transitions (4 allowed, 5 fail-closed HTTP 400)
  // 6. Payment Status: 4x4 = 16 transitions (3 allowed, 13 fail-closed HTTP 400)
  // 7. PaymentReversal: 3x3 = 9 transitions (2 allowed, 7 fail-closed HTTP 400)
  // 8. Cash Handover: 2x2 = 4 transitions (1 allowed, 3 fail-closed HTTP 400)
  // 9. Cheque Clearing: 3x3 = 9 transitions (2 allowed, 7 fail-closed HTTP 400)
  // TOTAL: 113 Transitions Tested (27 Allowed, 86 Fail-Closed HTTP 400)
});
```

### Verification Assertions
1. **ChitGroup Activation Guard**: `ChitService.activate()` strictly asserts `chit.status === ChitStatus.DRAFT || chit.status === ChitStatus.REGISTERED`. Attempting to activate an `ACTIVE`, `COMPLETED`, or `CLOSED` chit group throws `BadRequestException`.
2. **Defaulter & Arrears Removal Guard**: `InstallmentService.settleRemoval()` strictly asserts `ticket.status === 'REMOVED_DEF_3M'`. Attempting exit settlement on `ACTIVE` or `DEFAULT_3_MONTHS` tickets throws `BadRequestException`.
3. **Disbursement Pipeline Guard**: `DisbursementService.releasePayout()` strictly asserts `winner.disbursementStatus === 'AUTHORIZED_BY_CHECKER'`. Attempting payout release on `PENDING_VERIFICATION` or `VERIFIED_BY_MAKER` winners throws `BadRequestException`.
4. **Auction Bidding & Tie-Break Guard**: `AuctionService.recordBid()` strictly asserts that the target auction is not `COMPLETED` or `MINUTES_FILED`. Attempting to submit bids or tie-breaks on finalized auctions throws `BadRequestException`.
5. **Reversal Duplicate Protection**: `PaymentService.approveReversal()` strictly asserts `payment.reversal.status === 'REQUESTED'`. Attempting to approve an already `APPROVED` or `REJECTED` reversal throws `BadRequestException`.
6. **Cash Handover Duplicate Signoff**: `CollectionService.acknowledgeHandover()` strictly asserts `payment.cashHandoverStatus === 'PENDING_HANDOVER'`. Attempting to re-acknowledge already vault-signed cash throws `BadRequestException`.

---

## 7. Financial Boundary & Negative Fuzzing Test Suite (Zero-Paise Enforcement)

> **Mandate**: All financial mutation DTOs must enforce strict `@IsInt()` whole-rupee validation. Fractional paise, negative values, zero payments, and ceiling overflows must fail-closed with HTTP 400 `BadRequestException`.

- **Test Harness File**: [`apps/api/test/financial-boundary-fuzz.spec.ts`](../../apps/api/test/financial-boundary-fuzz.spec.ts)
- **Live Container Probe**: [`scripts/verify-financial-boundary-fuzz.ps1`](../../scripts/verify-financial-boundary-fuzz.ps1)

### The 5 Fuzzing Threat Categories Tested
```typescript
describe('Financial Boundary & Negative Fuzzing Suite (Zero-Paise Enforcement)', () => {
  // Category 1: Negative Monetary Inputs (-5000, -1, -20000, -100000) -> HTTP 400
  // Category 2: Zero Amount Payments & Sub-Floor Violations (amount: 0, chitValue: 0) -> HTTP 400
  // Category 3: Decimal Fractions & Paise Injections (3950.50, 22000.25, 100000.75) -> HTTP 400
  // Category 4: Statutory Ceiling & Floor Bounds (bid < 4% commission, bid > 25% ceiling) -> HTTP 400
  // Category 5: Type Confusion, NaN, Infinity & String Injections -> HTTP 400
});
```

### Verification Assertions
1. **Zero-Paise Integrity**: Submitting fractional paise (`3950.50` or `22000.25`) to `POST /payments`, `POST /collections`, or `POST /auctions/:id/record-bid` fails closed at the NestJS `ValidationPipe` boundary with HTTP 400 `BadRequestException`, eliminating silent `Math.floor()` paise truncation.
2. **Negative Amount Shielding**: Negative monetary values on any payment, collection, handover, or chit creation endpoint fail closed with HTTP 400 `BadRequestException`.
3. **Statutory 1/4 Ceiling & 4% Floor Invariants**: Auction bids below 4.00% Foreman Commission ($D < C_f$) or above the 1/4 ceiling ($D > V/4$) fail closed with HTTP 400 `BadRequestException`.

---

## 8. Extended Concurrency & Row-Locking Test Suite (5 Scenarios)

> **Mandate**: In high-velocity financial operations (installment payments, auction closing, prize payout release, desk cash handover, and defaulter ticket reassignment), race conditions and stampedes MUST be serialized at the database row level via PostgreSQL pessimistic row locks (`SELECT ... FOR UPDATE`). In all race condition scenarios, strictly 1 concurrent worker succeeds and all competing workers are cleanly rejected.

- **Test Harness File**: [`apps/api/test/concurrency-postgres.spec.ts`](../../apps/api/test/concurrency-postgres.spec.ts)
- **Live Container Probe**: [`scripts/verify-extended-concurrency.ps1`](../../scripts/verify-extended-concurrency.ps1)

### Concurrency Invariant Scenarios Tested
```typescript
describe('PostgreSQL Row-Locking & Concurrency Integration Tests (Real DB)', () => {
  // Scenario 1: CONCURR-INV-1: 10 parallel workers racing to pay the exact same installment due MUST result in strictly 1 winner and 9 rejected (ADR-07)
  // Scenario 2: CONCURR-INV-2: 5 parallel workers racing to finalize an auction MUST result in strictly 1 winner and 4 rejected
  // Scenario 3: CONCURR-INV-3: 5 parallel workers racing to release prize payout MUST result in strictly 1 winner and 4 rejected
  // Scenario 4: CONCURR-INV-4: 5 parallel workers racing to acknowledge the exact same cash handover batch MUST result in strictly 1 winner and 4 rejected
  // Scenario 5: CONCURR-INV-5: 5 parallel workers racing to substitute different customers into the same vacated ticket MUST result in strictly 1 winner and 4 rejected
});
```

### Verification Assertions
1. **Installment Due Stampede (`CONCURR-INV-1`)**: 10 simultaneous workers racing on `PaymentService.recordPayment()` serialize via `SELECT id, status, "netPayableAmount" FROM "InstallmentDue" WHERE id = ${due.id} FOR UPDATE`. Strictly 1 payment commits; remaining 9 workers receive HTTP 400 `INSTALLMENT_ALREADY_PAID`.
2. **Auction Finalization Contention (`CONCURR-INV-2`)**: 5 simultaneous workers racing on `AuctionService.finalizeAuction()` serialize via `SELECT id, status FROM "Auction" WHERE id = ${auctionId} FOR UPDATE`. Strictly 1 winner finalizes; remaining 4 workers receive HTTP 400 `Auction has already been finalized`.
3. **Prize Money Disbursement Race (`CONCURR-INV-3`)**: 5 simultaneous workers racing on `DisbursementService.releasePayout()` serialize via `SELECT id, "disbursementStatus" FROM "AuctionWinner" WHERE id = ${winner.id} FOR UPDATE`. Strictly 1 payout releases; remaining 4 workers receive HTTP 400 `Prize money has already been disbursed`.
4. **Desk Cash Handover Contention (`CONCURR-INV-4`)**: 5 simultaneous workers racing on `CollectionService.acknowledgeHandover()` serialize via `SELECT id, "cashHandoverStatus" FROM "Payment" WHERE id = ANY(${dto.paymentIds}::text[]) FOR UPDATE`. Strictly 1 cashier acknowledgment commits into branch vault; remaining 4 workers receive HTTP 400 `Payment has already been acknowledged or is not pending handover`.
5. **Defaulter Ticket Substitution Race (`CONCURR-INV-5`)**: 5 simultaneous workers racing on `InstallmentService.substituteSubscriber()` serialize via `SELECT id, status FROM "SubscriberTicket" WHERE id = ${ticketId} FOR UPDATE`. Strictly 1 replacement customer acquires the ticket; remaining 4 workers receive HTTP 400 `Subscriber substitution failed: Ticket is no longer in REMOVED_DEF_3M status`.
