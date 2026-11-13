# PROMPT 04 — CONCURRENCY TEST EVIDENCE & SCENARIO AUDIT

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance** (Head Office: Perundurai, Erode, Tamil Nadu)  
> **Target Scope**: Verification of 12 Critical Race-Condition Scenarios & Live PostgreSQL 17 Execution Results  
> **Test Harness**: Jest with real PostgreSQL 17 Docker container (`port 5433`) + Mocked Unit Verification  
> **Auditor**: Senior PostgreSQL Database Architect & Lead Technical Auditor  

---

## 1. Evaluation of the 12 Critical Race-Condition Scenarios

Every scenario mandated in Section 13 of Prompt 04 was investigated in code, mapped to database row locks and constraints, and validated with automated test execution:

| # | Concurrency Scenario | Relevant Code Implementation | Database Lock / Constraint | Test Suite & ID | Live DB Result | Verdict |
|:---:|---|---|---|---|:---:|:---:|
| **C01** | **Duplicate Payment**<br>Two cashiers submit payment for same due simultaneously | [`payment.service.ts:187-197`](file:///u:/Kumaran-finance/apps/api/src/payment/payment.service.ts#L187-L197) | `InstallmentDue` row `SELECT ... FOR UPDATE` | `concurrency-postgres.spec.ts`<br>`CONCURR-INV-1` | 10 parallel workers $\to$ **1 Winner, 9 Rejected (`INSTALLMENT_ALREADY_PAID`)** | `PROTECTED` |
| **C02** | **Duplicate Receipt Number**<br>Two cashiers in same branch issue receipts simultaneously | [`receipt-sequence.util.ts:59-62`](file:///u:/Kumaran-finance/apps/api/src/common/utils/receipt-sequence.util.ts#L59-L62) | `Branch` row `FOR UPDATE` + `Receipt.receiptNumber @unique` | `concurrency-postgres.spec.ts`<br>`CONCURR-INV-6` & `CONCURR-INV-8` | 6 parallel workers $\to$ **6 distinct sequential receipts, zero P2002** | `PROTECTED` |
| **C03** | **Duplicate Due Generation**<br>Two background jobs generate dues for same group & month | [`installment.service.ts:75-95`](file:///u:/Kumaran-finance/apps/api/src/installment/installment.service.ts#L75-L95) | `InstallmentDue @@unique([ticketId, installmentMonth])` | `concurrency-postgres.spec.ts`<br>`CONCURR-INV-18` | 5 parallel workers $\to$ **Zero duplicates, zero P2002 crashes** | `PROTECTED` |
| **C04** | **Concurrent Auction Finalize**<br>Two checkers finalize the same auction simultaneously | [`auction.service.ts:482-493`](file:///u:/Kumaran-finance/apps/api/src/auction/auction.service.ts#L482-L493) | `ChitGroup` $\to$ `Auction` row `FOR UPDATE` | `concurrency-postgres.spec.ts`<br>`CONCURR-INV-2` & `CONCURR-INV-16` | 5 parallel workers $\to$ **1 Winner, 4 Rejected (`AUCTION_ALREADY_FINALIZED`)** | `PROTECTED` |
| **C05** | **Concurrent Payout Release**<br>Two staff attempt to release same prize payout simultaneously | [`disbursement.service.ts:691-698`](file:///u:/Kumaran-finance/apps/api/src/disbursement/disbursement.service.ts#L691-L698) | `AuctionWinner` row `FOR UPDATE` | `concurrency-postgres.spec.ts`<br>`CONCURR-INV-3` & `CONCURR-INV-12` | 5 parallel workers $\to$ **1 Winner, 4 Rejected (`PRIZE_ALREADY_DISBURSED`)** | `PROTECTED` |
| **C06** | **Concurrent Reversal**<br>Two authorized partners approve same reversal simultaneously | [`payment.service.ts:747-764`](file:///u:/Kumaran-finance/apps/api/src/payment/payment.service.ts#L747-L764) | `Payment` $\to$ `PaymentReversal` `FOR UPDATE` | `concurrency-postgres.spec.ts`<br>`CONCURR-INV-14` & `CONCURR-INV-19` | 5 parallel workers $\to$ **1 Winner, 4 Rejected, zero ledger split-brain** | `PROTECTED` |
| **C07** | **Payment & Reversal Race**<br>User records/verifies payment while another reverses payment | [`payment.service.ts:747`](file:///u:/Kumaran-finance/apps/api/src/payment/payment.service.ts#L747) & [`1145`](file:///u:/Kumaran-finance/apps/api/src/payment/payment.service.ts#L1145) | Shared DAG lock order (`Ticket` $\prec$ `Due` $\prec$ `Payment`) | `concurrency-postgres.spec.ts`<br>`CONCURR-INV-9` & `CONCURR-INV-10` | Simultaneous operations $\to$ **Zero deadlocks, consistent final ledger** | `PROTECTED` |
| **C08** | **Ticket Allocation Race**<br>Two staff assign same ticket or same customer twice | [`chit.service.ts:430-450`](file:///u:/Kumaran-finance/apps/api/src/chit/chit.service.ts#L430-L450) | `@@unique([chitGroupId, ticketNumber])` & `@@unique([chitGroupId, customerId])` | `concurrency-postgres.spec.ts`<br>`CONCURR-INV-5` & `CONCURR-INV-15` | Simultaneous assignments $\to$ **1 Winner, 1 Rejected (409 Conflict)** | `PROTECTED` |
| **C09** | **Offline Sync vs Counter**<br>Field agent syncs offline payment after counter already settled | [`collection.service.ts:680-720`](file:///u:/Kumaran-finance/apps/api/src/collection/collection.service.ts#L680-L720) | `InstallmentDue` `FOR UPDATE` + `Payment.idempotencyKey @unique` | `concurrency-postgres.spec.ts`<br>`CONCURR-INV-7` & `CONCURR-INV-9` | Parallel sync vs counter $\to$ **1 Winner, 1 Flagged as Conflict/Rejected** | `PROTECTED` |
| **C10** | **Cash Handover Race**<br>Two branch managers acknowledge same handover batch | [`collection.service.ts:420-435`](file:///u:/Kumaran-finance/apps/api/src/collection/collection.service.ts#L420-L435) | `SELECT FOR UPDATE` on all pending cash payment rows | `concurrency-postgres.spec.ts`<br>`CONCURR-INV-4` | 5 parallel workers $\to$ **1 Winner, 4 Rejected (`NO_PENDING_PAYMENTS`)** | `PROTECTED` |
| **C11** | **Scheme Activation Race**<br>Two partners activate scheme or modify roster concurrently | [`chit.service.ts:245-265`](file:///u:/Kumaran-finance/apps/api/src/chit/chit.service.ts#L245-L265) | `ChitGroup` row `FOR UPDATE` | `concurrency-postgres.spec.ts`<br>`CONCURR-INV-24` & `CONCURR-INV-25` | 5 parallel workers $\to$ **1 Winner (ACTIVE), 4 Rejected, zero under-subscribed chits** | `PROTECTED` |
| **C12** | **Month-End Job Race**<br>Scheduled due generation, reporting & payments overlap | [`jobs/services/distributed-lock.service.ts`](file:///u:/Kumaran-finance/apps/api/src/jobs/services/distributed-lock.service.ts) | Redis Distributed Mutex (`NX PX`) + atomic Lua release | `distributed-lock.spec.ts`<br>`reconciliation-ledger.spec.ts` | Overlapping cron jobs $\to$ **Acquires mutex or skips gracefully** | `PROTECTED` |

---

## 2. Real PostgreSQL 17 Execution Proof (`concurrency-postgres.spec.ts`)

The integration test suite was executed directly against PostgreSQL 17 running on port 5433 with live parallel threads:

```
$ node --experimental-vm-modules ./node_modules/jest/bin/jest.js test/unit/concurrency-postgres.spec.ts --runInBand

PASS test/unit/concurrency-postgres.spec.ts
  PostgreSQL Row-Locking & Concurrency Integration Tests (Real DB)
    √ CONCURR-INV-1: 10 parallel workers racing to pay the exact same installment due MUST result in strictly 1 winner and 9 rejected (ADR-07) (411 ms)
    √ CONCURR-INV-2: 5 parallel workers racing to finalize an auction MUST result in strictly 1 winner and 4 rejected (190 ms)
    √ CONCURR-INV-3: 5 parallel workers racing to release prize payout MUST result in strictly 1 winner and 4 rejected (74 ms)
    √ CONCURR-INV-4: 5 parallel workers racing to acknowledge the exact same cash handover batch MUST result in strictly 1 winner and 4 rejected (56 ms)
    √ CONCURR-INV-5: 5 parallel workers racing to substitute different customers into the same vacated ticket MUST result in strictly 1 winner and 4 rejected (101 ms)
    √ CONCURR-INV-6: Concurrent payments in the same branch MUST acquire branch lock and issue collision-free, distinct receipt numbers (151 ms)
    √ CONCURR-INV-7: parallel CollectionService + PaymentService workers racing on the exact same due MUST have 1 winner, 0 40P01 deadlocks, and 0 P2002 crashes (139 ms)
    √ CONCURR-INV-8: 6 parallel workers across Collection, Counter Payment, and UPI Verify in same branch MUST issue 6 unique sequential receipts with zero P2002 (399 ms)
    √ CONCURR-INV-9: simultaneous verifyUpiClaim checks and verifyUpiClaim vs recordCollection MUST allow strictly 1 settlement (264 ms)
    √ CONCURR-INV-10: concurrent ReconciliationService ghost-drop auto-resolution and verifyUpiClaim MUST mint strictly 1 receipt with 0 exceptions (125 ms)
    √ CONCURR-INV-11: 5 parallel workers racing verifySafetyProof MUST result in strictly 1 VERIFIED_BY_MAKER and 4 rejected (DEF-DB-02) (82 ms)
    √ CONCURR-INV-12: 5 parallel Checkers racing authorizePayout MUST result in strictly 1 AUTHORIZED_BY_CHECKER and 4 rejected (DEF-DB-02) (71 ms)
    √ CONCURR-INV-13: 3 parallel Super Admins racing settleFinalMonth MUST result in strictly 1 COMPLETED settlement and clean rejections (107 ms)
    √ CONCURR-INV-14: simultaneous approveReversal and rejectReversal MUST result in 1 winner, 1 rejection, and zero ledger split-brain (86 ms)
    √ CONCURR-INV-15: simultaneous substituteSubscriber onto 2 vacated tickets in the SAME chitGroup with the SAME customerId MUST reject 1 with ConflictException (ADR-13) (150 ms)
    √ CONCURR-INV-16: simultaneous finalizeAuction, recordBid & recordTieBreak MUST never revert COMPLETED back to SCHEDULED (DEF-DB-02) (240 ms)
    √ CONCURR-INV-17: 5 parallel workers racing markMinutesFiled MUST result in strictly 1 filing and 4 rejections (DEF-DB-02) (67 ms)
    √ CONCURR-INV-18: 5 parallel workers calling generateMonthlyDues on a fresh month MUST serialize with zero P2002 crashes (135 ms)
    √ CONCURR-INV-19: 5 parallel Makers racing requestReversal on the same payment MUST create strictly 1 REQUESTED reversal and reject 4 (67 ms)
    √ CONCURR-INV-20: PostgreSQL pg_indexes MUST enforce all PaymentAllocation FK indexes and AuctionTieBidder unique/FK indexes (DEF-DB-05) (8 ms)
    √ CONCURR-INV-21: AuctionTieBidder MUST block duplicate (auctionId, ticketId) at both service and PostgreSQL unique constraint levels (33 ms)
    √ CONCURR-INV-22: PaymentAllocation non-unique indexes MUST permit multiple allocations per (ticketId, installmentDueId) across reversed + re-paid payments (41 ms)
    √ CONCURR-INV-23: PostgreSQL EXPLAIN planner MUST bind all 5 DEF-DB-05 indexes without requiring Seq Scan (29 ms)
    √ CONCURR-INV-24: 5 parallel Admins racing to activate same NEW_GROUP chit MUST yield strictly 1 ACTIVE winner, 4 BadRequestExceptions, and 1 Month-1 Auction (DEF-DB-07) (114 ms)
    √ CONCURR-INV-25: concurrent activate + unassignTicket + update on same DRAFT chit MUST serialize with zero unhandled crashes and zero under-subscribed ACTIVE chits (114 ms)

Test Suites: 1 passed, 1 total
Tests:       25 passed, 25 total
Snapshots:   0 total
Time:        4.656 s
```

---

## 3. Summary of Concurrency Findings

1. **Zero Split-Brain Vulnerability**: Under maximum asynchronous contention across 10 parallel threads, PostgreSQL 17 row locks reliably serialized every operation.
2. **Zero Deadlocks Encountered**: The strict 5-tier global lock order DAG prevented deadlock cycles (`40P01`), and multi-row queries sorted IDs lexicographically before acquiring row locks.
3. **Collision-Proof Sequential Receipts**: Serializing receipt issuance on the owning `Branch` row eliminated duplicate receipt numbers across counter payments, field agent syncs, and online UPI claim verifications.
