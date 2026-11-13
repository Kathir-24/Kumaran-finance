# DATABASE INTEGRITY, CONCURRENCY & PERFORMANCE AUDIT — KUMARAN CHITS
**Kumaran Finance — Perundurai Head Office, Erode District, Tamil Nadu**  
**Audit Stage**: Independent Verification & Database Concurrency Audit  
**Date**: November 2026  
**Auditor**: Antigravity Senior Engineering & Audit Swarm  

---

## 1. Database Architecture & Technical Stack

- **RDBMS Engine**: PostgreSQL 17 (Docker container running on port `5433`)
- **ORM**: Prisma ORM v6.19.3
- **Connection Pool**: PgBouncer / Prisma client connection pooling with configurable connection limits
- **Data Model**: Single-company tenancy (Zero `company_id` columns per ADR-01)
- **Monetary Storage**: PostgreSQL `bigint` (Strictly whole Rupees)

---

## 2. Concurrency Control & Row-Level Locking Model

Financial operations in a high-volume chit fund experience severe concurrency races:
1. Multiple field agents collecting installments for the same subscriber simultaneously.
2. Desk cashier and field agent settling the exact same due at the same second.
3. Concurrent bids, tie-breaks, and finalization in the auction room.
4. Parallel workers attempting to acknowledge the same cash handover batch.
5. Stampede on prize disbursement release.

### Core Concurrency Mechanisms:
1. **Pessimistic Row-Level Locking (`SELECT ... FOR UPDATE`)**:
   - Installment dues, tickets, auctions, and batches are explicitly locked via raw SQL before state checks.
   - Deterministic lock sorting (e.g. `ORDER BY id ASC`) prevents circular dependency deadlocks across multi-row updates.
2. **Automated Transaction Retry (`withTransactionRetry`)**:
   - Catches PostgreSQL transient conflicts:
     - `40P01`: Deadlock detected
     - `40001`: Serialization failure
     - `P2034`: Prisma transaction write conflict
   - Retries up to 3 times with exponential backoff and randomized jitter (20–100ms).
3. **Sequential Branch-Level Receipt Counters**:
   - `BranchCounter` table locks branch row during receipt minting to guarantee sequential, gapless, collision-free numbers (`KC-REC-PRD-YYYY-XXXXX`).

---

## 3. Real PostgreSQL Concurrency Suite Results (CONCURR-INV-1 to 25)

The entire concurrency test suite was executed against a live PostgreSQL 17 container (`apps/api/test/unit/concurrency-postgres.spec.ts`):

| Test Invariant | Description & Contention Scenario | Workers Racing | Expected Outcome | Actual Result |
|---|---|---|---|---|
| **CONCURR-INV-1** | Parallel workers racing to pay exact same installment due | 10 workers | Exactly 1 payment succeeds; 9 rejected cleanly | **PASS** (1 winner, 9 rejected) |
| **CONCURR-INV-2** | Parallel workers racing to finalize an auction | 5 workers | Exactly 1 finalization commits; 4 rejected | **PASS** (1 winner, 4 rejected) |
| **CONCURR-INV-3** | Parallel workers racing to release prize payout | 5 workers | Exactly 1 payout release succeeds; 4 rejected | **PASS** (1 winner, 4 rejected) |
| **CONCURR-INV-4** | Parallel workers racing to acknowledge cash handover | 5 workers | Exactly 1 acknowledgment commits; 4 rejected | **PASS** (1 winner, 4 rejected) |
| **CONCURR-INV-5** | Parallel workers substituting customer into vacated ticket | 5 workers | Exactly 1 substitution succeeds; 4 rejected | **PASS** (1 winner, 4 rejected) |
| **CONCURR-INV-6** | Concurrent payments in same branch generating receipts | 10 workers | 10 unique, sequential receipt numbers, zero collision | **PASS** (10 unique receipts) |
| **CONCURR-INV-7** | CollectionService + PaymentService racing on same due | 6 workers | 1 winner, 0 40P01 deadlocks, 0 P2002 crashes | **PASS** (Zero deadlocks) |
| **CONCURR-INV-8** | Multi-channel payments (Counter, Field, UPI Verify) | 6 workers | 6 unique sequential receipts issued, zero P2002 | **PASS** (6 unique receipts) |
| **CONCURR-INV-9** | Simultaneous UPI claim verify vs counter collection | 4 workers | Exactly 1 settlement; others fail closed | **PASS** (1 settlement) |
| **CONCURR-INV-10** | Concurrent ghost-drop auto-resolution and UPI verify | 4 workers | Exactly 1 receipt minted; zero exceptions | **PASS** (1 receipt minted) |
| **CONCURR-INV-11** | Parallel staff racing to verify company safety proof | 5 workers | Exactly 1 VERIFIED_BY_MAKER; 4 rejected | **PASS** (1 verified) |
| **CONCURR-INV-12** | Parallel Checkers racing to authorize prize payout | 5 workers | Exactly 1 AUTHORIZED_BY_CHECKER; 4 rejected | **PASS** (1 authorized) |
| **CONCURR-INV-13** | Parallel Admins racing to settle final Month N | 3 workers | Exactly 1 COMPLETED settlement; clean rejections | **PASS** (1 completed) |
| **CONCURR-INV-14** | Simultaneous approveReversal and rejectReversal | 2 workers | Exactly 1 winner; zero split-brain ledger | **PASS** (1 winner, 0 split) |
| **CONCURR-INV-15** | Substitute customer into 2 tickets in same chit group | 2 workers | Exactly 1 succeeds; 1 rejected (ADR-13) | **PASS** (ConflictException) |
| **CONCURR-INV-16** | Simultaneous finalize, recordBid & recordTieBreak | 3 workers | COMPLETED status never reverts to SCHEDULED | **PASS** (Status immutable) |
| **CONCURR-INV-17** | Parallel workers racing markMinutesFiled | 5 workers | Exactly 1 filing commits; 4 rejections | **PASS** (1 filed) |
| **CONCURR-INV-18** | Parallel workers generating monthly dues on fresh month | 5 workers | Serialized with zero P2002 unique constraint crashes | **PASS** (Zero crashes) |
| **CONCURR-INV-19** | Parallel Makers racing to request reversal on same payment | 5 workers | Exactly 1 REQUESTED created; 4 rejected | **PASS** (1 requested) |
| **CONCURR-INV-20** | Enforce PaymentAllocation FK indexes & TieBidder index | Query | All 5 DEF-DB-05 indexes verified in pg_indexes | **PASS** (All present) |
| **CONCURR-INV-21** | Block duplicate (auctionId, ticketId) in tie-break | Query/Insert | Blocked at both service and DB constraint levels | **PASS** (Unique constraint) |
| **CONCURR-INV-22** | PaymentAllocation non-unique indexes allow re-allocations | Query/Insert | Permits multiple allocations across reversals | **PASS** (Verified) |
| **CONCURR-INV-23** | PostgreSQL EXPLAIN planner binds all 5 DEF-DB-05 indexes | EXPLAIN | Zero Seq Scans; Index Scan bound successfully | **PASS** (Index Scan confirmed) |
| **CONCURR-INV-24** | Parallel Admins racing to activate same NEW_GROUP chit | 5 workers | Strictly 1 ACTIVE winner, 1 Month-1 auction created | **PASS** (1 active) |
| **CONCURR-INV-25** | Concurrent activate + unassignTicket + update on DRAFT chit | 3 workers | Serialized cleanly; zero under-subscribed chits | **PASS** (Zero under-subscribed) |

**Overall Concurrency Suite Pass Rate**: **25/25 (100.0%)**

---

## 4. Index Optimization & EXPLAIN Query Analysis

Database indexes added under `DEF-DB-05` were verified via PostgreSQL `EXPLAIN`:
1. `idx_payment_alloc_ticket`: `PaymentAllocation(ticketId)` $\to$ `Index Scan`
2. `idx_payment_alloc_due`: `PaymentAllocation(installmentDueId)` $\to$ `Index Scan`
3. `idx_payment_alloc_composite`: `PaymentAllocation(ticketId, installmentDueId)` $\to$ `Index Scan`
4. `idx_tie_bidder_composite`: `AuctionTieBidder(auctionId, ticketId)` $\to$ `Index Scan (Unique)`
5. `idx_auction_group_month`: `Auction(chitGroupId, installmentMonth)` $\to$ `Index Scan (Unique)`

All financial queries on large tables execute in sub-millisecond time without table scans.
