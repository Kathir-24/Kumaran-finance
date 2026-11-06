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
Missing indexes on high-traffic filtered columns force PostgreSQL to perform sequential disk scans (`Seq Scan`). In Kumaran Chits, two critical indexes protect high-frequency query paths:

1. **`SubscriberTicket(customerId)` B-Tree Index**:
   - **Query Path**: Mobile passbook query (`prisma.subscriberTicket.findMany({ where: { customerId } })`).
   - **Benefit**: Transforms an $O(N)$ sequential table scan across all subscriber tickets into an $O(\log N)$ index scan, reducing query latency from ~45ms to < 2ms.
2. **`InstallmentDue(status, dueDate)` Composite B-Tree Index**:
   - **Query Path**: Midnight Arrears & Defaulter Tagging Cron (`WHERE status = 'UNPAID' AND "dueDate" <= $cutoff`).
   - **Benefit**: Allows the daily midnight worker to immediately identify overdue installments without scanning historic paid dues.

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
```

---

## 4. Concurrency, Deadlock Elimination & Transaction Retries

### 4.1 Deterministic Lock Ordering
When multiple payments or receipts are locked simultaneously (e.g. during cash handover batch confirmation from collection agents to cashier desks), unordered locking causes cyclic wait deadlocks (PostgreSQL error `40P01`):

```
Transaction A: Locks Payment #1 -> Waits for Payment #2
Transaction B: Locks Payment #2 -> Waits for Payment #1
===> PostgreSQL detects deadlock and aborts one transaction
```

**Rule**: Every batch lock operation must sort IDs alphabetically before issuing `SELECT ... FOR UPDATE`:
```typescript
// apps/api/src/collection/collection.service.ts
const sortedPaymentIds = [...new Set(dto.paymentIds)].sort();

const lockedPayments = await tx.$queryRaw<Array<{ id: string; cashHandoverStatus: string }>>`
  SELECT id, "cashHandoverStatus" 
  FROM "Payment" 
  WHERE id = ANY(${sortedPaymentIds}::text[]) 
  ORDER BY id FOR UPDATE
`;
```

### 4.2 Automated Transaction Retry Utility
Transient deadlocks (`40P01`) or serialization failures (`40001`) under high concurrency are automatically retried using exponential backoff with full jitter:
```typescript
// apps/api/src/common/utils/transaction-retry.util.ts
export async function executeWithRetry<T>(
  prisma: PrismaService,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  options: TransactionRetryOptions = {},
): Promise<T>
```
- **Max Retries**: 3 attempts.
- **Backoff Base**: 50ms with randomized jitter ($50\text{ms} \times 2^i \pm \text{rand}$).

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
- **Key Pattern**: `cache:reports:daybook:${branchId}:${date}`
- **TTL**: 60 seconds (guarantees freshness even in case of missed eviction).
- **Instant Event Invalidation**: Whenever a payment is recorded (`PaymentService.recordPayment`), synchronized (`CollectionService.syncOfflineQueue`), or reversed under dual control (`PaymentService.approveReversal`), `invalidateDaybookCache()` purges the cache key immediately.

---

## 7. Storage, Logging & Capacity Safeguards

1. **Docker Container Log Limits**:
   All services in `docker-compose.fullstack.yml` use `json-file` logging with strict limits:
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
