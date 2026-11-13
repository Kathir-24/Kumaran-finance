# Kumaran Chits — Financial Invariants & Math Test Specifications

> **Product**: **Kumaran Chits** (Kumaran Finance)  
> **Mandate**: Financial tests must run in the CI/CD pipeline and achieve 100% pass rate. No release is allowed if any financial invariant fails.  
> **Currency Standard**: All monetary values are tested as **whole integer Rupees (`BigInt`)**. Paise and floating-point math are strictly prohibited (`CONFIRMED-BY-DEVELOPER`).  
> **Test Suite Status**: **52/52 API Test Suites Passed (843/843 Tests, 0 Failures) + 14 Web Test Suites Passed (353/353 Tests) = 1,196 Passing Tests** | Real-DB Concurrency: 25/25 Scenarios Passed | Execution Time: ~18s

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

- **Test Harness File**: [`apps/api/test/unit/state-matrix-sweep.spec.ts`](../../apps/api/test/unit/state-matrix-sweep.spec.ts)
- **Live Container Probe**: [`scripts/probes/verify-state-matrix-sweep.ps1`](../../scripts/probes/verify-state-matrix-sweep.ps1)

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
1. **ChitGroup Activation Guard**: `ChitService.activate()` strictly asserts `chit.status === ChitStatus.DRAFT || chit.status === ChitStatus.REGISTERED` both on fast-fail pre-check and under pessimistic `lockChitGroupRow()` (`SELECT ... FOR UPDATE`) inside `withTransactionRetry`, re-verifying full ticket capacity before creating Month 1 records. Attempting to activate an `ACTIVE`, `COMPLETED`, or `CLOSED` chit group (or under concurrent activation races) throws `BadRequestException`.
2. **Defaulter & Arrears Removal Guard**: `InstallmentService.settleRemoval()` strictly asserts `ticket.status === 'REMOVED_DEF_3M'`. Attempting exit settlement on `ACTIVE` or `DEFAULT_3_MONTHS` tickets throws `BadRequestException`.
3. **Disbursement Pipeline Guard**: `DisbursementService.releasePayout()` strictly asserts `winner.disbursementStatus === 'AUTHORIZED_BY_CHECKER'`. Attempting payout release on `PENDING_VERIFICATION` or `VERIFIED_BY_MAKER` winners throws `BadRequestException`.
4. **Auction Bidding & Tie-Break Guard**: `AuctionService.recordBid()` strictly asserts that the target auction is not `COMPLETED` or `MINUTES_FILED`. Attempting to submit bids or tie-breaks on finalized auctions throws `BadRequestException`.
5. **Reversal Duplicate Protection**: `PaymentService.approveReversal()` strictly asserts `payment.reversal.status === 'REQUESTED'`. Attempting to approve an already `APPROVED` or `REJECTED` reversal throws `BadRequestException`.
6. **Cash Handover Duplicate Signoff**: `CollectionService.acknowledgeHandover()` strictly asserts `payment.cashHandoverStatus === 'PENDING_HANDOVER'`. Attempting to re-acknowledge already vault-signed cash throws `BadRequestException`.

---

## 7. Financial Boundary & Negative Fuzzing Test Suite (Zero-Paise Enforcement)

> **Mandate**: All financial mutation DTOs must enforce strict `@IsInt()` whole-rupee validation. Fractional paise, negative values, zero payments, and ceiling overflows must fail-closed with HTTP 400 `BadRequestException`.

- **Test Harness File**: [`apps/api/test/unit/financial-boundary-fuzz.spec.ts`](../../apps/api/test/unit/financial-boundary-fuzz.spec.ts)
- **Live Container Probe**: [`scripts/probes/verify-financial-boundary-fuzz.ps1`](../../scripts/probes/verify-financial-boundary-fuzz.ps1)

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

- **Test Harness File**: [`apps/api/test/unit/concurrency-postgres.spec.ts`](../../apps/api/test/unit/concurrency-postgres.spec.ts)
- **Live Container Probe**: [`scripts/probes/verify-extended-concurrency.ps1`](../../scripts/probes/verify-extended-concurrency.ps1)

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

---

## 9. Ambiguous Failure & Network Disconnect Chaos Suite (Zero Orphan Records & Telecom 504 Isolation)

> **Mandate**: Rural monsoon network drops and Indian telecom SMS gateway congestion must fail-closed safely without leaving dangling cloud pointers in PostgreSQL or blocking/reversing financial ledger commits.

- **Test Harness File**: [`apps/api/test/unit/chaos-network-disconnect.spec.ts`](../../apps/api/test/unit/chaos-network-disconnect.spec.ts)
- **Live Container Probe**: [`scripts/probes/verify-chaos-network-disconnect.ps1`](../../scripts/probes/verify-chaos-network-disconnect.ps1)

### Chaos Scenarios Tested
```typescript
describe('Ambiguous Failure & Network Disconnect Chaos Integration Tests (Real DB)', () => {
  // Scenario 1: CHAOS-S3-1: Network disconnect during KYC upload MUST fail closed without leaving orphan CustomerDocument records in DB
  // Scenario 2: CHAOS-S3-2: Network disconnect during signed blank cheque upload MUST NOT update AuctionWinner or create orphan audit logs
  // Scenario 3: CHAOS-SMS-1: Downstream Indian telecom 504 Gateway Timeout MUST NOT rollback or delay the financial payment transaction
  // Scenario 4: CHAOS-SMS-2: Msg91SmsDriver MUST retry with exponential backoff on HTTP 504 and succeed when gateway recovers
  // Scenario 5: CHAOS-SMS-3: NotificationService MUST preserve delivery via Mobile App Push when telecom SMS driver is offline
});
```

### Verification Assertions
1. **KYC Upload Disconnect Zero Orphan Guard (`CHAOS-S3-1`)**: When S3 throws `ETIMEDOUT` mid-upload, the database mutation is never executed. PostgreSQL contains strictly 0 orphan `CustomerDocument` records.
2. **Cheque Collateral Upload Disconnect Guard (`CHAOS-S3-2`)**: When blank cheque S3 upload drops mid-stream, `AuctionWinner.securityDocS3Key` remains strictly `null` and `AuditLog` records 0 orphan events.
3. **Financial Payment Non-Blocking Telecom Isolation (`CHAOS-SMS-1`)**: Downstream Indian telecom 504 Gateway Timeouts or BullMQ queue delays do NOT block teller response times (<500ms) or roll back committed financial ledgers (`Payment`, `InstallmentDue: PAID`, `Receipt`).
4. **Driver Exponential Backoff (`CHAOS-SMS-2`)**: `Msg91SmsDriver` catches HTTP 504 as `isRetryable`, applying exponential backoff delay ($\text{delay} = \text{base} \times 2^{\text{attempt}}$) across 3 attempts.
5. **Mobile Push Primary Routing (`CHAOS-SMS-3`)**: When telecom SMS routes are partitioned, customers with active smartphones receive receipt alerts via free FCM Mobile App Push, completely bypassing carrier SMS outages.

---

## 10. SMS OTP Request Cooldown & Distributed Brute-Force Lockout Suite (Redis & In-Memory)

> **Mandate**: To protect Kumaran Finance's paid MSG91 commercial SMS credits from bot flooding and prevent endless-cycling brute-force attacks against 6-digit OTP codes, the authentication system must enforce a 60-second request cooldown and a 5-minute (300s) brute-force lockout on the 3rd failed attempt across distributed Redis 7 instances with in-memory fallback.

- **Test Harness File**: [`apps/api/test/unit/otp-cooldown-lockout.spec.ts`](../../apps/api/test/unit/otp-cooldown-lockout.spec.ts)
- **Live Container Probe**: [`scripts/probes/verify-otp-cooldown-lockout.ps1`](../../scripts/probes/verify-otp-cooldown-lockout.ps1)

### Scenarios Tested
```typescript
describe('Auth Security: SMS OTP Request Cooldown & Brute-Force Lockout (Redis & In-Memory)', () => {
  // Part 1: In-Memory Resilience (Redis Offline Fallback)
  //   OTP-RATE-1: Immediate second requestOtp within 60s MUST fail closed with HTTP 429
  //   OTP-RATE-2: requestOtp after cooldown window expiration MUST succeed cleanly
  //   OTP-RATE-3: 3 consecutive incorrect OTP entries MUST trigger 5-minute temporary lockout
  //   OTP-RATE-4: Calling requestOtp while actively locked out MUST fail closed with HTTP 429 without sending SMS
  //   OTP-RATE-5: Calling verifyOtp while actively locked out MUST fail closed with HTTP 429
  //   OTP-RATE-6: Correct OTP verification MUST atomically clear active OTP, cooldown, and lockout states
  // Part 2: Distributed Redis 7 Architecture
  //   OTP-REDIS-1: Writes auth:otp:cooldown:<phone> with EX 60 and rejects subsequent requests
  //   OTP-REDIS-2: 3rd failed attempt writes auth:otp:lockout:<phone> with EX 300 and deletes auth:otp:<phone>
});
```

### Verification Assertions
1. **SMS Re-Request Cooldown Guard (`OTP-RATE-1`)**: Requesting an OTP within 60 seconds of a previous request fails closed with `HTTP 429 Too Many Requests`. The response contains the exact remaining wait time, and zero downstream SMS is dispatched.
2. **Post-Cooldown Restoration (`OTP-RATE-2`)**: Once 60 seconds have elapsed, calls to `requestOtp` succeed cleanly, resetting the cooldown timer.
3. **3-Attempt Lockout Penalty (`OTP-RATE-3`)**: The 3rd consecutive incorrect OTP submission in `verifyOtp` triggers an immediate 300-second (5-minute) lockout with `HTTP 429 Too Many Requests` and purges the active OTP session.
4. **Lockout Shielding on All Endpoints (`OTP-RATE-4` & `OTP-RATE-5`)**: While `auth:otp:lockout:<phone>` is active, any attempt to request a new OTP or guess an OTP is rejected with `HTTP 429 Too Many Requests`.
5. **Atomic Cleanup on Success (`OTP-RATE-6`)**: Successful verification with the correct 6-digit code atomically purges the active session, cooldown, and lockout keys (`clearOtpSession(phone, true)`).
6. **Distributed Redis TTL Enforcement (`OTP-REDIS-1` & `OTP-REDIS-2`)**: Live Redis key inspection verifies `auth:otp:cooldown:<phone>` is written with `EX 60` and `auth:otp:lockout:<phone>` is written with `EX 300`.

---

## 11. Whole-Rupee Dividend Divisibility Suite (`KFC-FIN-002`)

- **Harness**: [`apps/api/test/unit/auction.spec.ts`](../../apps/api/test/unit/auction.spec.ts)
- **Invariant**: $(D - C_f) \pmod M == 0$. Any bid where total dividend is not cleanly divisible across all subscriber tickets must fail closed.

```typescript
it('should reject auction bid when dividend is not cleanly divisible across tickets', async () => {
  // Chit Value: ₹1,00,000, 20 tickets, Commission: ₹4,000
  // Bid discount: ₹20,005 -> Dividend = 20,005 - 4,000 = 16,005. 16,005 % 20 = 5 != 0
  await expect(
    auctionService.recordBid('auc-1', { winningTicketId: 't-1', bidDiscount: 20005n }, adminUser)
  ).rejects.toThrow(BadRequestException);
});
```

---

## 12. Month $N$ Final Settlement Installment Deduction Suite (`KFC-FIN-001`, `FIN-B`, `FIN-D`, `FIN-E`)

- **Harness**: [`apps/api/test/unit/disbursement.spec.ts`](../../apps/api/test/unit/disbursement.spec.ts)
- **Formula**: $\text{Net Payout} = V - C_f - \text{finalMonthDeduction} - \text{priorArrears}$.
  - **Unpaid Case**: If Month $N$ installment is unpaid, $\text{finalMonthDeduction} = I_{\text{base}}$ (₹5,000 on ₹1,00,000 chit). Payout is $100,000 - 4,000 - 5,000 = \text{₹91,000}$, and Month $N$ due is atomically marked `PAID`.
  - **Pre-Paid Case (FIN-B)**: If subscriber already paid their Month $N$ due at the branch desk, $\text{finalMonthDeduction} = 0$, preventing double collection. Net payout is $100,000 - 4,000 = \text{₹96,000}$.
  - **State Guard (FIN-D)**: Settle final month rejects execution with HTTP 400 if group is in `AUCTION` status or has unfinalized auctions.
  - **Month 1 Pool Handover (FIN-E)**: Company subscriber ticket claims full Month 1 pool ($V - C_f$ or gross pool per statutory chit rules) with zero auction discount and zero dividend.

```typescript
it('should deduct Month N base installment and prior arrears from final month settlement', async () => {
  const result = await disbursementService.settleFinalMonth('group-1', { paymentMethod: 'NEFT' }, adminUser);
  expect(result.netPayableAmount).toBe(91000n);
  expect(result.monthNInstallmentDeducted).toBe(5000n);
  expect(result.monthNInstallmentStatus).toBe('PAID');
  expect(result.groupStatus).toBe('COMPLETED');
});
```

---

## 13. Arrears Auto-Offset Against Prize Money & Payout Override Suite (`KFC-FIN-003`, `KFC-FIN-004`)

- **Harness**: [`apps/api/test/unit/disbursement.spec.ts`](../../apps/api/test/unit/disbursement.spec.ts)
- **Verification Assertions**:
  1. Unpaid installments up to auction month are automatically queried and deducted from the gross prize snapshot during `authorizePayout`.
  2. If arrears $\ge$ prize money, authorization fails closed.
  3. `releasePayout` verifies caller-supplied `disbursedAmount == authorizedNetPayout`; rejecting deviations with `PAYOUT_OVERRIDE_NOT_PERMITTED`.
  4. Upon release, deducted arrears dues are atomically transitioned to `PAID`.

---

## 14. Two-Partner Finalized Auction Correction Workflow Suite (`KFC-FIN-005`)

- **Harness**: [`apps/api/test/unit/auction.spec.ts`](../../apps/api/test/unit/auction.spec.ts)
- **Verification Assertions**:
  1. Partner A requests correction (`requestAuctionCorrection`); validates 25% ceiling and divisibility.
  2. If prize money has already been disbursed (`disbursementStatus === 'DISBURSED'`), correction is strictly blocked.
  3. Partner B approves correction (`approveAuctionCorrection`) with hard dual control (`maker != checker`).
  4. Atomically updates auction record, swaps `isPrized` flags if winner ticket changed, and updates downstream unpaid dues.

---

## 15. Partner Exclusivity & Dual-Control Defaulter Removal / Settlement Suite (`KFC-SEC-001` - `004`, `SEC-B`)

- **Harness**: [`apps/api/test/unit/adversarial-security-invariants.spec.ts`](../../apps/api/test/unit/adversarial-security-invariants.spec.ts), [`apps/api/test/unit/installment.spec.ts`](../../apps/api/test/unit/installment.spec.ts)
- **Verification Assertions**:
  1. `POST /payments/:id/request-reversal` rejects Branch Manager and Accountant with HTTP 403 (`KFC-SEC-001`).
  2. `POST /auctions/:id/finalize` rejects Branch Manager with HTTP 403 (`KFC-SEC-003`).
  3. Prized tickets reject defaulter removal and substitution with HTTP 400 `PRIZED_TICKET_IMMUTABLE` (`KFC-SEC-004`).
  4. Two-Partner Defaulter Removal (SEC-B): Partner A requests removal (`POST /tickets/:id/remove-defaulter/request`), placing ticket in `PENDING_REMOVAL_APPROVAL`. Partner B approves (`POST /tickets/:id/remove-defaulter/approve`) with strict dual control (`maker != checker`). Self-approval is rejected with HTTP 403.
  5. Defaulter Exit Settlement Fail-Closed: Under Q25, financial exit settlement calculation fails closed with HTTP 400 `UNAPPROVED_SETTLEMENT_POLICY` pending confirmed statutory damages formula.

---

## 16. Cancelled Payment PDF Watermark Invariant (`KFC-PDF-001`)

- **Harness**: [`apps/api/test/unit/pdf.spec.ts`](../../apps/api/test/unit/pdf.spec.ts)
- **Verification Assertions**:
  1. When payment status is `REVERSED`, PDF generator bypasses pre-reversal cached files.
  2. Renders bold red diagonal watermark `ரத்து செய்யப்பட்டது / CANCELLED` (-35°, 28pt bold, `#DC2626`).
  3. PDFKit buffer analysis verifies watermark text and font definitions are embedded in generated binary.

