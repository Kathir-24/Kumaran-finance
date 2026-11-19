# Kumaran Chits — Database Concurrency, Performance & Resilience Guide

> **Product**: **Kumaran Chits** (Kumaran Finance, Perundurai, Tamil Nadu)  
> **Database**: PostgreSQL 17 (Port `5433` via Docker / Port `5432` Internal)  
> **ORM**: Prisma ORM  
> **Cache**: Redis 7  
> **Authoritative Invariant**: **PostgreSQL 17 is the sole financial source of truth.** Redis is non-authoritative. Whole-rupee integer math (`BigInt`) and strict Maker $\ne$ Checker separation are enforced at the database level.

---

## 1. Overview & Architectural Principles

Kumaran Chits is an operational financial system handling real-world chit funds, doorstep collections, multi-subscriber auctions, and cash handovers. High concurrency scenarios—such as end-of-month collection synchronizations, simultaneous counter payments, and parallel admin dashboard queries—demand bank-grade database resilience.

This guide codifies the 5 engineering pillars of database resilience in Kumaran Chits:
1. **Connection Pool & Timeout Budgeting**: Guarding against client connection starvation and hung transactions.
2. **Deterministic Indexing**: Eliminating sequential table scans (`Seq Scan`) on customer passbooks and midnight cron jobs.
3. **Deadlock Prevention & Lock Ordering**: Deterministic sorting and atomic row-level pessimistic locking (`SELECT ... FOR UPDATE`).
4. **Optimistic Concurrency Control**: Preventing lost updates on shared administrative records using `version` columns.
5. **Hybrid Hot-Read Caching**: Sub-10ms report aggregation responses with instant event-driven cache invalidation.

---

## 2. Connection Pool Budgeting & Server-Side Timeouts

### 2.1 Connection Sizing Formula
To prevent connection exhaustion (`FATAL: sorry, too many clients already`), the total connections allocated to application instances and background workers must never exceed PostgreSQL's `max_connections`, leaving a reserve buffer for administrative operations, DRP drills, and backups.

$$\text{PostgreSQL Max Connections} \ge \left( \sum_{i=1}^{N} \text{Pool Size}_i \right) + \text{Superuser Buffer (10)}$$

In Kumaran Chits:
- **PostgreSQL Server**: `max_connections = 150`, `shared_buffers = 512MB`.
- **API Instances**: Configured via `DATABASE_URL`:
  ```text
  postgresql://user:pass@host:5432/dbname?schema=public&connection_limit=25&pool_timeout=10
  ```
- **Connection Limit (`connection_limit=25`)**: Ensures up to 4 parallel API replicas consume at most $4 \times 25 = 100$ connections, leaving 50 connections for BullMQ worker tasks, Prisma Studio, and backup cron jobs.
- **Pool Timeout (`pool_timeout=10`)**: If the API pool is saturated, waiting requests fail fast after 10 seconds rather than hanging indefinitely.

### 2.2 Server-Side Timeout Safeguards
Configured in Docker Compose PostgreSQL startup flags:
- `statement_timeout = 15000` (15 seconds): Runaway queries or accidental unindexed join Cartesian products are killed by the PostgreSQL query planner after 15 seconds.
- `lock_timeout = 5000` (5 seconds): If a transaction is blocked waiting for an exclusive row or table lock for more than 5 seconds, it aborts immediately to eliminate cascading pool exhaustion.

---

## 3. Indexing Strategy & EXPLAIN Verification

### 3.1 Composite & Single-Column B-Tree Indexes
Missing indexes on high-traffic filtered columns force PostgreSQL to perform sequential disk scans (`Seq Scan`). In Kumaran Chits, deterministic B-Tree and composite unique indexes protect high-frequency query paths:

1. **`SubscriberTicket(customerId)` B-Tree Index**:
   - **Query Path**: Mobile passbook query (`prisma.subscriberTicket.findMany({ where: { customerId } })`).
   - **Benefit**: Transforms an $O(N)$ sequential table scan across all subscriber tickets into an $O(\log N)$ index scan, reducing query latency from ~45ms to < 2ms.
2. **`InstallmentDue(status, dueDate)` Composite B-Tree Index**:
   - **Query Path**: Midnight Arrears & Defaulter Tagging Cron (`WHERE status = 'UNPAID' AND "dueDate" <= $cutoff`).
   - **Benefit**: Allows the daily midnight worker to immediately identify overdue installments without scanning historic paid dues.
3. **`PaymentAllocation` Foreign-Key B-Tree Indexes (`paymentId`, `ticketId`, `installmentDueId`)**:
   - **Query Path**: Daybook/receipt allocation joins (`WHERE "paymentId" = ...`), defaulter account settlement sums (`WHERE "ticketId" = ...`), and pending UPI claim checks (`WHERE "installmentDueId" = ...`).
   - **Invariant**: Strictly non-unique (`@@index`) rather than unique, preserving append-only ledger multiplicity when an earlier payment is reversed (`REVERSED`) and paid again later.
4. **`AuctionTieBidder` Composite Unique (`auctionId, ticketId`) & Ticket B-Tree (`ticketId`)**:
   - **Query Path**: Tie-break uniqueness enforcement, cascade cleanup (`WHERE "auctionId" = ...` served by the composite leftmost prefix), and reverse subscriber ticket tie lookups (`WHERE "ticketId" = ...`).
   - **Benefit**: Eliminates duplicate tie-bid rows for the same subscriber ticket alongside pre-transaction uniqueness validation in [`AuctionService.recordTieBreak`](file:///u:/Kumaran-finance/apps/api/src/auction/auction.service.ts).

### 3.2 Prisma Schema Reference
```prisma
model SubscriberTicket {
  id           String    @id @default(uuid())
  chitGroupId  String
  customerId   String
  ticketNumber Int
  ...
  @@unique([chitGroupId, ticketNumber])
  @@unique([chitGroupId, customerId])
  @@index([customerId]) // Fast lookup for customer mobile passbooks
}

model InstallmentDue {
  id               String    @id @default(uuid())
  chitGroupId      String
  ticketId         String
  installmentMonth Int
  dueDate          DateTime
  status           DueStatus @default(UNPAID)
  ...
  @@unique([ticketId, installmentMonth])
  @@index([chitGroupId, installmentMonth])
  @@index([status, dueDate]) // Optimizes midnight arrears and defaulter batch processing
}

model PaymentAllocation {
  id               String   @id @default(uuid())
  paymentId        String
  ticketId         String
  installmentDueId String
  amountAllocated  BigInt
  ...
  @@index([paymentId])
  @@index([ticketId])
  @@index([installmentDueId])
}

model AuctionTieBidder {
  id          String  @id @default(uuid())
  auctionId   String
  ticketId    String
  bidDiscount BigInt
  tokenNumber Int?
  isWinner    Boolean @default(false)
  ...
  @@unique([auctionId, ticketId])
  @@index([ticketId])
}
```

---

## 4. Concurrency, Deadlock Elimination & Transaction Retries

### 4.1 Deterministic Lock Ordering & Pessimistic Row Locking
When multiple payments, receipts, or ticket arrears are mutated concurrently, uncoordinated locking causes race conditions, duplicate receipts, lost updates, and cyclic wait deadlocks (PostgreSQL error `40P01`):

```
Transaction A: Locks Payment #1 -> Waits for Payment #2
Transaction B: Locks Payment #2 -> Waits for Payment #1
===> PostgreSQL detects deadlock and aborts one transaction
```

To eliminate deadlocks and guarantee serializability across high-concurrency write paths, Kumaran Chits enforces a strict **4-Tier Global Lock Ordering DAG** implemented cleanly in [`receipt-sequence.util.ts`](file:///u:/Kumaran-finance/apps/api/src/common/utils/receipt-sequence.util.ts) (`acquirePaymentConcurrencyLocks` + `generateNextReceiptNumber`):

$$\text{Tier 1: } \texttt{"Branch"} \;\longrightarrow\; \text{Tier 2: } \texttt{"SubscriberTicket"} \;\longrightarrow\; \text{Tier 3: } \texttt{"InstallmentDue"} \;\longrightarrow\; \text{Tier 4: } \texttt{"Payment"}$$

1. **Tier 1 — Branch Row Lock for Collision-Free Sequential Receipts**:
   All 4 receipt-minting paths ([`PaymentService.recordPayment`](file:///u:/Kumaran-finance/apps/api/src/payment/payment.service.ts), [`CollectionService.recordCollection`](file:///u:/Kumaran-finance/apps/api/src/collection/collection.service.ts), [`PaymentService.verifyUpiClaim`](file:///u:/Kumaran-finance/apps/api/src/payment/payment.service.ts), and [`ReconciliationService.executeReconcileSettlement`](file:///u:/Kumaran-finance/apps/api/src/jobs/services/reconciliation.service.ts)) lock the chit group's owning `"Branch"` row FIRST (`chitGroup.branchId`, matching the branch code prefix `KC-REC-{BRANCH}-{YYYY}-`), then compute the next sequence **strictly inside the locked transaction** via `generateNextReceiptNumber(tx, prefix)`:
   ```typescript
   await tx.$queryRaw`SELECT id FROM "Branch" WHERE id = ${branchId} FOR UPDATE`;
   const finalReceiptNumber = await generateNextReceiptNumber(tx, prefix);
   ```
   Inside PostgreSQL, `generateNextReceiptNumber` executes an $O(1)$ numeric aggregate (`MAX(CAST(substr("receiptNumber", startPos) AS BIGINT))` restricted by regex `^[0-9]{1,18}$`) rather than naive ASCII `ORDER BY "receiptNumber" DESC`, ensuring legacy prefixed formats (`-REV-`, `-PEN-`, `-FLD-`, `-1L-M1-`) or >5-digit overflows never poison sequence sorting or cause repeated `findUnique` probes while holding the Branch lock. Running under `PAYMENT_TRANSACTION_OPTIONS` (`{ maxWait: 10000, timeout: 15000 }`) prevents premature 5s timeout expiry under burst serialization.

2. **Tier 2 — Subscriber Ticket Row Lock for Arrears Serialization**:
   Consecutive arrears updates (`consecutiveUnpaidMonths`) lock affected `"SubscriberTicket"` rows immediately after `"Branch"`. Multi-ticket paths deduplicate and sort IDs lexicographically (`ORDER BY id`):
   ```typescript
   // Single-ticket paths (recordPayment, recordCollection):
   await tx.$queryRaw`SELECT id FROM "SubscriberTicket" WHERE id = ${ticket.id} FOR UPDATE`;

   // Multi-ticket paths (verifyUpiClaim, executeReconcileSettlement, approveReversal):
   await tx.$queryRaw`
     SELECT id FROM "SubscriberTicket" WHERE id = ANY(${sortedTicketIds}::text[]) ORDER BY id FOR UPDATE
   `;
   ```

3. **Tier 3 & Tier 4 — InstallmentDue & Payment Locks (Double-Settlement Prevention)**:
   - **Tier 3 (`"InstallmentDue"`)**: Locked before status mutation; counter cash, field collections, UPI claim verification, and ghost-drop reconciliation all re-verify locked `status !== 'PAID'` inside the transaction to prevent double settlements.
   - **Tier 4 (`"Payment"`) & Tier 5 (`"PaymentReversal"`)**: Locked in strict order (`"Payment"` $\to$ `"PaymentReversal"` via [`lockPaymentAndReversalRows`](file:///u:/Kumaran-finance/apps/api/src/common/utils/state-transition-lock.util.ts) — or after Tier 2 `"SubscriberTicket"` inside `PaymentService.approveReversal`), preventing duplicate reversal requests and split-brain state overwrites when `approveReversal` and `rejectReversal` race simultaneously:
   ```typescript
   // apps/api/src/collection/collection.service.ts (acknowledgeHandover)
   const sortedPaymentIds = [...new Set(dto.paymentIds)].sort();

   const lockedPayments = await tx.$queryRaw<Array<{ id: string; cashHandoverStatus: string }>>`
     SELECT id, "cashHandoverStatus" 
     FROM "Payment" 
     WHERE id = ANY(${sortedPaymentIds}::text[]) 
     ORDER BY id FOR UPDATE
   `;
   ```

4. **State Machine Lock Hierarchy (Scheme Activation, Auction, Disbursement & Subscriber Substitution)**:
   Shared helpers in [`state-transition-lock.util.ts`](file:///u:/Kumaran-finance/apps/api/src/common/utils/state-transition-lock.util.ts) enforce monotonic locking across critical lifecycle transitions without conflicting with payment paths:
   $$\texttt{"ChitGroup"} \;\longrightarrow\; \texttt{"Auction"} \;\longrightarrow\; \texttt{"AuctionMinutes"} \;/\; \texttt{"AuctionWinner"} \;\longrightarrow\; \texttt{"SubscriberTicket"} \;\longrightarrow\; \texttt{"InstallmentDue"}$$
   - `ChitService.activate` / `assignTicket` / `unassignTicket` / `update` / `register` / `cancel` / `close` (`DEF-DB-07`): lock `"ChitGroup" FOR UPDATE` via `lockChitGroupRow` inside `withTransactionRetry` and re-verify authoritative locked `status` and `SubscriberTicket` roster (`tickets.length === totalTickets`) prior to Month 1 initialization, ticket assignment/unassignment (`P2002` mapped cleanly to `ConflictException`), registration, cancellation, or closure.
   - `AuctionService.recordBid` / `recordTieBreak`: lock `"ChitGroup" FOR UPDATE` before upserting Auction/Winner.
   - `AuctionService.finalizeAuction` & finalized auction correction (`correction/{request,approve,reject}`, `KFC-FIN-005`): lock `"ChitGroup" FOR UPDATE` strictly *before* `"Auction" FOR UPDATE` (monotonic `"ChitGroup" -> "Auction"` DAG alignment) and refresh state snapshot under both locks, eliminating `COMPLETED -> SCHEDULED` regressions against concurrent bids.
   - `AuctionService.markMinutesFiled`: locks `"Auction"` then `"AuctionMinutes" FOR UPDATE` in DAG order ([`auction.service.ts:1690-1706`](file:///u:/Kumaran-finance/apps/api/src/auction/auction.service.ts#L1690-L1706)) before committing filing status (`filedAtRegistrar === true -> MINUTES_ALREADY_FILED`).
   - `DisbursementService.verifySafetyProof` / `authorizePayout` / `releasePayout` (route `/disburse`): lock `"AuctionWinner" FOR UPDATE`.
   - `DisbursementService.settleFinalMonth` / `prepareFinalSettlement` / `approveFinalSettlement` (Month $N$ 2-stage dual-control maturity, `CR-DISB-02`): lock `"ChitGroup" FOR UPDATE` then `"SubscriberTicket" FOR UPDATE`.
   - `InstallmentService.generateMonthlyDues`: locks `"ChitGroup" FOR UPDATE` before querying/creating dues, serializing concurrent schedule runs and eliminating `P2002` collisions on `@@unique([ticketId, installmentMonth])`.
   - `InstallmentService.substituteSubscriber` & ticket removal dual-control (`requestRemoval` / `approveRemoval` / `rejectRemoval`): lock `"SubscriberTicket" FOR UPDATE` and translate concurrent duplicate-customer `P2002` (`@@unique([chitGroupId, customerId])`) cleanly into `ConflictException` (ADR-13).

### 4.2 Automated Transaction Retry Utility
Transient deadlocks (`40P01`), serialization failures (`40001`), Prisma write conflicts (`P2034`), or edge-case receipt number conflicts are transparently retried using exponential backoff with randomized jitter:
```typescript
// apps/api/src/common/utils/transaction-retry.util.ts
export async function withTransactionRetry<T>(
  prisma: { $transaction: (action: any, options?: any) => Promise<any> },
  action: (tx: any) => Promise<T>,
  options?: RetryOptions,
  txOptions?: { maxWait?: number; timeout?: number; isolationLevel?: any },
): Promise<T>
```
- **Max Retries**: 3 attempts (default).
- **Backoff Algorithm**: $(50\text{ms} \times 2^{\text{attempt}}) + \text{rand}(0, 50\text{ms})$ capped at 1,000ms.
- **Classification Filter**: `isTransientTransactionError` catches `40P01`, `40001`, `P2034`, write conflicts, and `P2002` on `receiptNumber` (matching both message substrings and `err.meta.target`). Application validation errors (`BadRequestException`, `ForbiddenException`, `P2025`, non-receipt `P2002`) fail fast on the first attempt without unnecessary retries.
- **Integration Points**:
  - **Payment, Collections & Reconciliation**: [`PaymentService.recordPayment`](file:///u:/Kumaran-finance/apps/api/src/payment/payment.service.ts), [`PaymentService.verifyUpiClaim`](file:///u:/Kumaran-finance/apps/api/src/payment/payment.service.ts), [`CollectionService.recordCollection`](file:///u:/Kumaran-finance/apps/api/src/collection/collection.service.ts), [`CollectionService.acknowledgeHandover`](file:///u:/Kumaran-finance/apps/api/src/collection/collection.service.ts), and [`ReconciliationService.executeReconcileSettlement`](file:///u:/Kumaran-finance/apps/api/src/jobs/services/reconciliation.service.ts).
  - **Reversals**: [`PaymentService.requestReversal`](file:///u:/Kumaran-finance/apps/api/src/payment/payment.service.ts), [`PaymentService.approveReversal`](file:///u:/Kumaran-finance/apps/api/src/payment/payment.service.ts), and [`PaymentService.rejectReversal`](file:///u:/Kumaran-finance/apps/api/src/payment/payment.service.ts).
  - **Scheme Lifecycle, Auction, Disbursement & Installment State Machines**: [`ChitService`](file:///u:/Kumaran-finance/apps/api/src/chit/chit.service.ts) (`activate`, `assignTicket`, `unassignTicket`, `update`, `register`, `cancel`, `close`), [`AuctionService`](file:///u:/Kumaran-finance/apps/api/src/auction/auction.service.ts) (`recordBid`, `recordTieBreak`, `finalizeAuction`, `markMinutesFiled`, `correction/*`), [`DisbursementService`](file:///u:/Kumaran-finance/apps/api/src/disbursement/disbursement.service.ts) (`verifySafetyProof`, `authorizePayout`, `releasePayout`, `settleFinalMonth`, `prepareFinalSettlement`, `approveFinalSettlement`), and [`InstallmentService`](file:///u:/Kumaran-finance/apps/api/src/installment/installment.service.ts) (`generateMonthlyDues`, `substituteSubscriber`, `removal/*`).

---

## 5. Optimistic Concurrency Control (Lost Updates Prevention)

To prevent lost updates when two administrative users concurrently update the same customer profile or branch settings without row locks:

1. **Schema Column**: `version Int @default(1)` on `Customer` and `Branch`.
2. **DTO Contract**: Optional `version?: number` in mutation request payloads.
3. **Application Verification**:
   ```typescript
   // apps/api/src/customer/customer.service.ts
   if (dto.version !== undefined && customer.version !== dto.version) {
     throw new ConflictException(
       'CONCURRENT_MODIFICATION: Customer profile was updated by another user. Please reload.',
     );
   }

   await this.prisma.customer.update({
     where: { id },
     data: {
       ...data,
       version: { increment: 1 },
     },
   });
   ```

---

## 6. Hybrid Hot-Read Caching (Daybook & Registers)

Real-time aggregate calculations (Daybook, Daily Collections, Arrears Registers) execute complex joins and sums across `Payment`, `PaymentAllocation`, and `Receipt` tables.

### 6.1 Architecture
- **Engine**: Redis 7 `String` with 64-bit integer BigInt replacer/reviver schema.
- **Key Pattern** ([`report.service.ts:469,631-645`](file:///u:/Kumaran-finance/apps/api/src/report/report.service.ts#L469)): `report:daybook:${branchId || 'ALL'}:${dateStr}` (plus `report:daybook:ALL_BRANCHES:${dateStr}`).
- **TTL**: 60 seconds (guarantees freshness even in case of missed eviction).
- **Instant Event Invalidation**: Whenever a payment is recorded (`PaymentService.recordPayment`), synchronized (`CollectionService.syncOfflineQueue`), or reversed under dual control (`PaymentService.approveReversal`), [`ReportService.invalidateReportCaches()`](file:///u:/Kumaran-finance/apps/api/src/report/report.service.ts#L631-L645) purges the branch and aggregate daybook cache keys immediately.

---

## 7. Storage, Logging & Capacity Safeguards

1. **Docker Container Log Limits**:
   All services in [`infra/docker/docker-compose.fullstack.yml`](file:///u:/Kumaran-finance/infra/docker/docker-compose.fullstack.yml) use `json-file` logging with strict limits:
   ```yaml
   x-logging: &default-logging
     driver: "json-file"
     options:
       max-size: "50m"
       max-file: "5"
   ```
   Limits maximum host log storage per container to $250\text{MB}$.
2. **80% Disk Capacity Monitoring**:
   Host storage is monitored by [`infra/scripts/disk-monitor.sh`](file:///u:/Kumaran-finance/infra/scripts/disk-monitor.sh) (or `.ps1`). Alerts are emitted before disk space reaches critical thresholds, ensuring zero database crashes due to `ENOSPC`.

---

## 8. Schema Evolution (23 Migrations), Index Inventory & Scaling Roadmap

### 8.1 Complete Linear Migration History (23 PostgreSQL 17 Migrations)
All migrations in [`apps/api/prisma/migrations/`](file:///u:/Kumaran-finance/apps/api/prisma/migrations/) are linear, additive, and forward-compatible across **18 Prisma models** and **8 enums** (zero `company_id` columns per ADR-01; all financial FKs enforce `ON DELETE RESTRICT`; cascades limited strictly to `Nominee`, `CustomerDocument`, and `AuctionTieBidder`):

| # | Migration Directory | Purpose & Structural Guarantee |
|:---:|---|---|
| 1–7 | `20261018110459_init_kumaran_schema` .. `20261022205000_remove_user_email` | Core chit-fund schema, auth credentials, payment reversal maker-checker, Form XVII registrar filing, FCM tokens, payment notes, phone-only identity (ADR-18). |
| 8–11 | `20261023095606_add_cycle_date_windows` .. `20261029140029_add_customer_refresh_token_hash` | Cycle date windows, financial reporting B-tree indexes, `Payment.transactionRef @unique`, customer refresh hash. |
| 12–14 | `20261106170415_add_concurrency_and_performance_indexes` .. `20261112115900_add_allocation_and_tie_bidder_indexes` | Concurrency/reporting composite indexes, optimistic locking `version` columns (`Customer`, `Branch`), `PaymentAllocation` & `AuctionTieBidder` FK/unique indexes (`DEF-DB-05`). |
| 15–17 | `20261113200000_add_partner_identity_and_removal_approval` .. `20261114010000_audit_log_complete_immutability` | Historical Partner flag (`User.isPartner`, ADR-21; superseded by ADR-27), ticket removal approval fields, PostgreSQL `AuditLog` append-only immutability triggers (`BEFORE UPDATE/DELETE/TRUNCATE`). |
| 18–20 | `20261115030000_auth_revocation_and_session_vault` .. `20261115060000_complete_maker_checker_constraints` | PostgreSQL `Session` vault (`F04`), database-level `CHECK` constraints enforcing `maker_user_id <> checker_user_id` across reversals, auctions, disbursements, and removals. |
| 21–24 | `20261117170000_add_ticket_removal_maker_checker` .. `20261119130000_remove_is_partner_boolean` | Ticket removal maker-checker columns, hardened auction/disbursement monetary `CHECK` constraints, case-insensitive payout ref index, and ADR-27 complete removal of `isPartner` column in favor of first-class `Role.PARTNER`. |

### 8.2 Index Inventory & EXPLAIN Plan Verification
- **51+ Active PostgreSQL 17 Indexes**: Primary keys on all 18 models, 19+ unique constraints (`SubscriberTicket @@unique([chitGroupId, customerId])`, `InstallmentDue @@unique([ticketId, installmentMonth])`, `Receipt.receiptNumber`, `Payment.idempotencyKey`, `Payment.transactionRef`, `AuctionWinner.auctionId/ticketId`, `AuctionTieBidder(auctionId, ticketId)`, `uq_auction_winner_non_cash_payment_ref`), plus 16+ dedicated B-tree reporting/concurrency indexes.
- **Planner Proof (`CONCURR-INV-20` & `CONCURR-INV-23`)**: Live PostgreSQL `EXPLAIN (FORMAT JSON)` verification confirms `Index Scan` / `Bitmap Index Scan` binding across all high-frequency payment allocation, tie-bidder, customer phone, arrears, and Day Book lookups with zero forced `Seq Scan`.

### 8.3 1-Branch to 50-Branch Capacity Scaling Roadmap
| Scale Tier | Footprint | Concurrency & Storage Architecture |
|---|---|---|
| **1–5 Branches (Current Launch)** | 1–10k customers, <100k payments/yr | Single Flat-Fee Linux VPS + Docker PostgreSQL 17 + Redis 7 (`noeviction`) + PgBouncer (`max_client_conn=200`). Sub-10ms P95 writes. |
| **6–20 Branches (Regional Growth)** | ~50k customers, ~600k payments/yr | Separate `chitflow-api` (`ENABLE_BULLMQ_WORKERS=false`) & `chitflow-worker` (`ENABLE_BULLMQ_WORKERS=true`) containers; PgBouncer transaction pooling; read-through Redis Day Book caching. |
| **21–50 Branches (Enterprise Scale)** | 100k+ customers, 2M+ rows/yr | Range-partition `Payment` and `AuditLog` by calendar year (`PARTITION BY RANGE ("createdAt")`); dedicated PostgreSQL streaming read replica for Form XXI / XXII & CA Auditor exports. |

---

## 9. Complete Financial Transaction & 5-Tier Lock DAG Inventory

All **16+ financial mutation workflows** execute inside `withTransactionRetry(this.prisma, async (tx) => ...)` at `READ COMMITTED` paired with explicit pessimistic row locks (`SELECT ... FOR UPDATE`) strictly obeying the acyclic lock DAG:
$$\text{Tier 1: Branch} \prec \text{Tier 2: SubscriberTicket} \prec \text{Tier 3: InstallmentDue} \prec \text{Tier 4: Payment} \prec \text{Tier 5: PaymentReversal}$$

| Domain | Workflows Covered | Exact Lock Acquisition Order | Atomicity & Idempotency Guard |
|---|---|---|---|
| **Payments & Counter** | `recordPayment`, `verifyUpiClaim`, `requestReversal`, `approveReversal`, `rejectReversal` | `Branch` $\to$ `SubscriberTicket` $\to$ `InstallmentDue` $\to$ `Payment` $\to$ `PaymentReversal` | `idempotencyKey @unique`, `transactionRef @unique`, `Receipt.receiptNumber @unique`, DB `CHECK (maker <> checker)`. |
| **Field Collections & Handover** | `recordCollection`, `syncOfflineQueue`, `acknowledgeHandover` | `Branch` $\to$ `SubscriberTicket` $\to$ `InstallmentDue`; handover locks sorted `Payment` IDs (`ORDER BY id FOR UPDATE`) | Offline idempotency key deduplication; zero double vault credit (`CONCURR-INV-4`, `CONCURR-INV-7`). |
| **Bank Reconciliation** | `executeReconcileSettlement` (ADR-19 KVB settlement matching) | `DistributedLockService` mutex (`lock:reconciliation-settlement`) + `Branch` $\to$ `InstallmentDue` | Single atomic receipt mint even racing against live `verifyUpiClaim` (`CONCURR-INV-10`). |
| **Schemes & Tickets** | `activate`, `assignTicket`, `unassignTicket`, `update`, `register`, `cancel`, `close`, `generateMonthlyDues`, `substituteSubscriber`, `removal/*` | `ChitGroup` $\to$ `SubscriberTicket` $\to$ `InstallmentDue` | Prevents under-subscribed activations (`CONCURR-INV-24..25`) and duplicate customer tickets (`ADR-13`, `CONCURR-INV-15`). |
| **Auctions & Minutes** | `recordBid`, `recordTieBreak`, `finalizeAuction`, `markMinutesFiled`, `correction/{request,approve,reject}` | `ChitGroup` $\to$ `Auction` $\to$ `AuctionMinutes` / `AuctionWinner` | Prevents `COMPLETED -> SCHEDULED` regression (`CONCURR-INV-16`), double finalization (`CONCURR-INV-2`), and double filing (`CONCURR-INV-17`). |
| **Prize Payouts & Maturity** | `verifySafetyProof`, `authorizePayout`, `releasePayout`, `settleFinalMonth`, `prepareFinalSettlement`, `approveFinalSettlement` | `ChitGroup` $\to$ `AuctionWinner` / `SubscriberTicket` | Enforces `disbursedAmount <= prizeMoney`, arrears netting, unique payout ref (`uq_auction_winner_non_cash_payment_ref`), and zero double payout (`CONCURR-INV-3`, `11..13`). |

---

## 10. Real PostgreSQL 17 Concurrency Verification & Audit Closure (`26 / 26 PASS`)

### 10.1 Critical Race Scenarios (`C01–C12`) & Live Test Matrix
Executed directly against real PostgreSQL 17 Docker (`port 5433`) via [`apps/api/test/unit/concurrency-postgres.spec.ts`](file:///u:/Kumaran-finance/apps/api/test/unit/concurrency-postgres.spec.ts) (**26/26 PASS**), [`concurrency-locking.spec.ts`](file:///u:/Kumaran-finance/apps/api/test/unit/concurrency-locking.spec.ts) (**11/11 PASS**), [`transaction-retry.spec.ts`](file:///u:/Kumaran-finance/apps/api/test/unit/transaction-retry.spec.ts) (**11/11 PASS**), and [`distributed-lock.spec.ts`](file:///u:/Kumaran-finance/apps/api/test/unit/distributed-lock.spec.ts):

| Scenario | Contention Pattern | Proof IDs | Verified PostgreSQL 17 Outcome |
|:---:|---|---|---|
| **C01** | Duplicate payment on same due | `CONCURR-INV-1` | 10 parallel workers $\to$ **1 Winner, 9 Rejected (`INSTALLMENT_ALREADY_PAID`)** |
| **C02** | Concurrent same-branch receipt numbering | `CONCURR-INV-6, 8` | 6 parallel workers (Counter + Field + UPI) $\to$ **6 distinct sequential receipts, 0 `P2002`** |
| **C03** | Concurrent monthly due generation | `CONCURR-INV-18` | 5 parallel workers $\to$ **0 duplicate dues, 0 `P2002` crashes** |
| **C04** | Concurrent auction finalization & bid race | `CONCURR-INV-2, 16, 17` | 5 parallel Checkers $\to$ **1 Winner, 4 Rejected; 0 `COMPLETED -> SCHEDULED` regressions** |
| **C05** | Concurrent prize payout / safety verification / Month $N$ maturity | `CONCURR-INV-3, 11, 12, 13` | 5 parallel callers $\to$ **1 Winner, 4 Rejected (`PRIZE_ALREADY_DISBURSED`)** |
| **C06** | Concurrent reversal request / approve / reject | `CONCURR-INV-14, 19` | 5 parallel callers $\to$ **1 Winner, 4 Rejected; 0 split-brain ledgers** |
| **C07** | Payment vs UPI verify vs reconciliation race | `CONCURR-INV-7, 9, 10` | **1 settlement, 0 `40P01` deadlocks, 0 `P2002` crashes** |
| **C08** | Ticket substitution & ADR-13 duplicate-customer race | `CONCURR-INV-5, 15` | 5 parallel workers $\to$ **1 Winner, duplicates cleanly rejected (`409 Conflict`)** |
| **C09** | Offline sync vs counter settlement race | `CONCURR-INV-7, 9` | **1 Winner, 1 flagged conflict/rejected; zero double payment** |
| **C10** | Cash handover acknowledgment race | `CONCURR-INV-4` | 5 parallel managers $\to$ **1 Winner, 4 Rejected (`NO_PENDING_PAYMENTS`)** |
| **C11** | Scheme activation vs roster modification race | `CONCURR-INV-24, 25` | 5 parallel admins $\to$ **1 `ACTIVE` winner, 0 under-subscribed schemes** |
| **C12** | Overlapping midnight/morning cron batches | `distributed-lock.spec.ts` | Redis `NX PX` mutex + atomic Lua release serializes workers safely |
| **DB-IMM** | Append-only `AuditLog` PostgreSQL trigger integrity | `CONCURR-INV-26` | Permits `INSERT`/`SELECT`; blocks `UPDATE`, `DELETE`, and `TRUNCATE` at engine level |
| **DB-IDX** | `pg_indexes` + `EXPLAIN` index binding + tie-bidder uniqueness | `CONCURR-INV-20..23` | Confirms all `DEF-DB-05` indexes bound without `Seq Scan` |

### 10.2 Prompt 04 Database Audit Gap Closure (`DB-001` through `DB-005`)
All 5 database findings raised during Stage 04 auditing have been permanently remediated in subsequent migrations (`15`–`23`) and services:
- **`DB-001` (Prize Disbursement Ceiling)**: Remediated — `authorizePayout` validates `amountToDisburse <= auction.prizeMoney` (net of arrears) backed by migration `20261118110000_harden_auction_disbursement_constraints` and `uq_auction_winner_non_cash_payment_ref`.
- **`DB-002` (Reversed Receipt Cancellation Watermark)**: Remediated — `pdf.service.ts` stamps prominent bilingual `CANCELLED / REVERSED` watermarks on PDFs for reversed payments.
- **`DB-003` (Whole-Rupee Dividend Clean-Divisibility Guard)**: Remediated — bid recording enforces `totalDividend % totalTickets === 0n` (`NON_DIVISIBLE_DIVIDEND`), preventing fractional paise truncation.
- **`DB-004` (Dual-Control Auction Correction & Payout Cancellation)**: Remediated — partner dual-control auction correction (`correction/{request,approve,reject}`, `KFC-FIN-005`) and disbursement cancellation flows implemented.
- **`DB-005` (PostgreSQL Engine-Level `CHECK` Constraints)**: Remediated — **8 PostgreSQL 17 `CHECK` constraints** enforce positive monetary amounts and `maker_user_id <> checker_user_id` directly at the storage engine level (`15/15` DB constraint E2E tests PASS).

