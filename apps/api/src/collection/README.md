# Collection & Cash Handover Module (`apps/api/src/collection`)

> **Module**: `apps/api/src/collection/`  
> **Company**: **Kumaran Finance** (Perundurai, Erode, Tamil Nadu)  
> **Guiding ADRs**: [ADR-01, ADR-07, ADR-08, ADR-11, ADR-19, ADR-21, ADR-23, ADR-25, ADR-26](../../../../docs/01-business/decision-log.md)

---

## 1. Overview
The **Collection & Cash Handover** module handles doorstep field collections, offline queue synchronization, and end-of-day vault cash handovers for **Kumaran Chits**. Engineered for rural Tamil Nadu operating realities where field agents work across intermittent network zones, it enforces strict whole-rupee discrete payment invariants, sequential installment ordering, collision-proof bilingual receipting, and database-backed dual-control vault handovers.

---

## 2. Core Architectural Invariants

| Guardrail | Invariant Rule | Live Implementation |
|---|---|---|
| **Exact $I_{net}$ Matching (`ADR-07`)** | Collection must identically match $I_{net} = I_{base} - Div$ | Rejects with `PARTIAL_PAYMENTS_NOT_ALLOWED` if amount $\ne$ `due.netPayableAmount`; zero partials, overpayments, or advance balances |
| **Sequential Installment Order (`DEF-08`)** | Older unpaid months must settle first | Rejects out-of-order payments with `PRIOR_INSTALLMENT_UNPAID` (pre-tx and intra-tx checks under row locks) |
| **Zero Double Payments (`ADR-07`)** | Installment cannot be paid twice | Rejects with `INSTALLMENT_ALREADY_PAID` if `due.status === PAID` |
| **Whole Rupee Math (`Guardrail 2`)** | All currency stored in 64-bit integer rupees | Native TypeScript `bigint`, Prisma `BigInt`, and 64-bit Dart `int` (`_parseWholeRupeeInt`) |
| **Canonical Contiguous Arrears (`DEF-10`)** | Accurate 3-month consecutive default tracking | Uses shared `computeMaxConsecutiveUnpaidMonths` & `deriveTicketArrearsStatus` (`apps/api/src/common/utils/arrears.util.ts`); transitions `DEFAULT_3_MONTHS` $\to$ `ACTIVE` when arrears drop below 3 while preserving `REMOVED_DEF_3M` / `PENDING_REMOVAL_APPROVAL` |
| **Idempotency & Same-Branch Isolation (`F09`)** | Safe retry without cross-agent sniffing or cross-branch posting | Unique `idempotencyKey` UUID per payment (`existingPayment.recordedByUserId === userId`); locks accounting branch to `ticket.chitGroup.branchId` (`CROSS_BRANCH_FORBIDDEN`) |
| **Dual-Control Vault Handover (`Guardrail 10` / `ADR-25`)** | Agent cannot acknowledge own cash; reversed cash blocked; single-branch enforced | Enforces `collectorUserId != acknowledgerUserId` in service & DB `CHECK` constraint `chk_payment_cash_handover_maker_checker`, requires `paymentStatus === SUCCESS` (`DEF-11`), deduplicates IDs via `Set` (`DEF-M8-REV-05`), and blocks cross-branch acknowledgment (`DEF-M8-REV-03`) |
| **Async Receipt & S3 PDF Pre-Render (`XR-M8-PAY-01`)** | Non-blocking post-commit receipt delivery & PDF archive | Enqueues `JOB_DISPATCH_PAYMENT_RECEIPT` with `paymentId` onto BullMQ `notification-queue` (fire-and-forget with Redis offline safety) |

---

## 3. Endpoints Matrix (`CollectionController` — 6 Live Routes)

All 6 routes are served by `apps/api/src/collection/collection.controller.ts` under global prefix `/api/v1`:

| HTTP Method | Route | Description | Authorized Roles |
|---|---|---|---|
| `GET` | `/api/v1/collections/agent-dues` | Fetch pending/overdue subscriber dues for field collection rounds (branch-scoped) | `COLLECTION_AGENT`, `ACCOUNTANT`, `BRANCH_MANAGER`, `SUPER_ADMIN`, `AUDITOR` |
| `POST` | `/api/v1/collections/record` | Record single real-time collection with exact $I_{net}$ & `PRIOR_INSTALLMENT_UNPAID` guards | `COLLECTION_AGENT`, `ACCOUNTANT`, `BRANCH_MANAGER`, `SUPER_ADMIN` |
| `POST` | `/api/v1/collections/sync-offline-queue` | Batch sync offline queued collections with strict `(ticketId, installmentMonth)` ordering & partial failure isolation | `COLLECTION_AGENT`, `ACCOUNTANT`, `BRANCH_MANAGER`, `SUPER_ADMIN` |
| `GET` | `/api/v1/collections/daily-summary` | Today's collections summary, cash pending handover, and digital totals (IST day boundary) | `COLLECTION_AGENT` *(own only)*, `ACCOUNTANT`, `BRANCH_MANAGER`, `SUPER_ADMIN`, `AUDITOR` |
| `POST` | `/api/v1/collections/cash-handover/submit` | Submit evening physical cash batch for branch vault deposit (Maker step) | `COLLECTION_AGENT`, `SUPER_ADMIN` |
| `POST` | `/api/v1/collections/cash-handover/acknowledge` | Acknowledge physical cash count into vault (Checker step; `collector != acknowledger`, `SUCCESS` only, branch-scoped) | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT` |

---

## 4. Batch Offline Queue Synchronization Protocol

### Workflow
```mermaid
sequenceDiagram
    autonumber
    actor FieldAgent as Field Collection Agent
    participant Mobile as Mobile Core (Offline SQLite / Dart SDK)
    participant API as CollectionController
    participant Service as CollectionService
    participant DB as PostgreSQL 17
    participant Queue as BullMQ (notification-queue)

    FieldAgent->>Mobile: Collect Cash door-to-door (No Internet)
    Mobile->>Mobile: Generate local UUID idempotencyKey & record installmentMonth + collectedAt
    FieldAgent->>Mobile: Arrives at branch / Regains network
    Mobile->>API: POST /api/v1/collections/sync-offline-queue ({ items: [...] })
    Service->>Service: Strict sort by ticketId.localeCompare(), then installmentMonth ASC
    loop For each item in sorted batch
        Service->>DB: Check idempotencyKey (same-agent isolation)
        alt Idempotency Key exists
            Service-->>API: Mark as isDuplicate = true (return original receipt)
        else Valid (unpaid, no prior unpaid month, exact Inet)
            Service->>DB: 4-tier lock DAG -> Record Payment + Sequential Receipt -> Mark Due PAID + update arrears streak
            Service--)Queue: Fire-and-forget: addJob(JOB_DISPATCH_PAYMENT_RECEIPT with paymentId)
            Service-->>API: Item status = SUCCESS
        else Validation failed
            Service-->>API: Item status = FAILED (explicit errorCode, errorMessage)
        end
    end
    API-->>Mobile: Batch response ({ totalSubmitted, successCount, failureCount, synced, failed })
    Mobile->>Mobile: Clear synced rows; surface failed items (maxRetries = 5) for manual review
```

- **Strict Weak-Ordering Comparator (`DEF-12` / `DEF-M8-REV-02`)**: Incoming batch items are deterministically sorted by `a.ticketId.localeCompare(b.ticketId)` and then `a.installmentMonth - b.installmentMonth` so multi-month offline batches for the same ticket settle chronologically and satisfy `PRIOR_INSTALLMENT_UNPAID`.
- **Mobile Client Core Contract (`DEF-MOB-01..03`, `M8-MOB-DEF-09..11`)**: `apps/mobile/lib/core/offline/` stores `installmentMonth` alongside formal SQLite DDL (`cached_assigned_dues`, `offline_collections_queue`), dispatches batches via `/api/v1/collections/sync-offline-queue` with `maxRetries = 5`, and uses 64-bit Dart `int` for all monetary fields. *(Android UI/APK rollout is scheduled for Phase 2 Q2 2027 per `ADR-26`.)*

### Request Payload (`SyncOfflineQueueDto`)
```json
{
  "items": [
    {
      "idempotencyKey": "a92e1041-3b7c-47bc-8f69-7c8bb172ad91",
      "ticketId": "f78d910b-6072-45e0-8fa3-d34e62817812",
      "installmentMonth": 4,
      "amount": 3950,
      "paymentMethod": "CASH",
      "collectedAt": "2026-10-21T09:45:00.000Z",
      "transactionRef": null
    }
  ]
}
```

### Response Payload (`SyncOfflineQueueResponse`)
```json
{
  "totalSubmitted": 2,
  "successCount": 1,
  "failureCount": 1,
  "synced": [
    {
      "idempotencyKey": "a92e1041-3b7c-47bc-8f69-7c8bb172ad91",
      "paymentId": "pmt-7711",
      "receiptNumber": "KC-REC-PRD-2026-00125",
      "amount": "3950",
      "status": "SUCCESS",
      "isDuplicate": false,
      "collectedAt": "2026-10-21T09:45:00.000Z"
    }
  ],
  "failed": [
    {
      "idempotencyKey": "b18f2190-2c8d-4912-9c10-09a8b1112233",
      "ticketId": "e55d881a-1122-3344-5566-778899aabbcc",
      "installmentMonth": 4,
      "amount": 3950,
      "errorCode": "INSTALLMENT_ALREADY_PAID",
      "errorMessage": "INSTALLMENT_ALREADY_PAID: Month 4 installment has already been paid in full"
    }
  ]
}
```

### Explicit Offline Sync Error Code Reference (9 Live Codes)

Mapped explicitly in `CollectionService.syncOfflineQueue`:

| Error Code | Cause | Resolution |
|---|---|---|
| `DUPLICATE_TRANSACTION_REF` | Non-cash UTR / bank transaction reference already recorded on another payment | Verify bank statement and remove duplicate entry |
| `CROSS_BRANCH_FORBIDDEN` | Ticket belongs to a different branch than the caller's assigned branch | Route collection to the ticket's home branch |
| `INSTALLMENT_ALREADY_PAID` | Due was already settled at the branch counter or via verified UPI | Inform subscriber; reconcile / return duplicate cash |
| `PRIOR_INSTALLMENT_UNPAID` | An earlier installment month for the same ticket is still `UNPAID` / `OVERDUE` | Collect and settle the earliest unpaid month first |
| `PARTIAL_PAYMENTS_NOT_ALLOWED` | Amount does not identically match `due.netPayableAmount` | Re-verify passbook net installment ($I_{base} - Div$) |
| `TICKET_NOT_FOUND` | Ticket UUID is invalid or does not exist | Verify subscriber ticket record |
| `CHIT_NOT_ACTIVE` | Chit group is `DRAFT`, `COMPLETED`, or `TERMINATED` | Confirm group lifecycle status |
| `TICKET_REMOVED` | Ticket was removed after 3 consecutive unpaid months (`REMOVED_DEF_3M`) | Follow defaulting subscriber substitution SOP |
| `DUE_NOT_FOUND` | Monthly installment due has not been generated for the target month | Generate monthly dues before collecting |

---

## 5. Sequential Bilingual Receipt Numbering & Async Dispatch

Receipts follow the mandated statutory format:
$$\text{KC-REC-}\{\text{BranchCode}\}\text{-}\{\text{YYYY}\}\text{-}\{\text{Sequence: 5 digits}\}$$
Example: `KC-REC-PRD-2026-00045`.

- Every collection executes inside `withTransactionRetry`, acquires the strict 4-tier pessimistic lock DAG (`Branch` $\to$ `SubscriberTicket` $\to$ `InstallmentDue` $\to$ `Payment`) via `apps/api/src/common/utils/receipt-sequence.util.ts`, and mints the sequential receipt under the `Branch` row lock using IST (`Asia/Kolkata`) dates.
- Post-commit, `JOB_DISPATCH_PAYMENT_RECEIPT` (including `paymentId` so `NotificationService` pre-renders the bilingual A5 PDF receipt to private S3/R2 per `XR-M8-PAY-01`) is enqueued onto BullMQ's `notification-queue`.
- **Channel Hierarchy (`ADR-23` / `ADR-26`)**: Phase 1 delivers receipts via **bilingual MSG91 TRAI DLT SMS (`KMRCHT`, zero WhatsApp per `Q34`)**; Android FCM Push activates in Phase 2 (Q2 2027).

---

## 6. Dual-Control Evening Cash Handover Protocol

1. **Evening Handover Submission (`POST /api/v1/collections/cash-handover/submit`)**:
   - Field agent aggregates all `SUCCESS` cash collections marked `PENDING_HANDOVER` and submits the handover batch.
2. **Vault Deposit Verification (`POST /api/v1/collections/cash-handover/acknowledge`)**:
   - Deduplicates `dto.paymentIds` via `Set` (`DEF-M8-REV-05`) and acquires `SELECT FOR UPDATE` row locks.
   - Strictly enforces `paymentMethod === CASH`, `cashHandoverStatus === PENDING_HANDOVER`, and **`paymentStatus === SUCCESS`** (`DEF-11`, blocking reversed payments from entering vault cash totals).
   - Strictly enforces single-branch consistency and caller branch ownership for non-Super-Admins (`CROSS_BRANCH_FORBIDDEN`, `DEF-M8-REV-03`).
   - Strictly enforces **`collectorUserId != acknowledgerUserId`** at both service level and PostgreSQL `CHECK` constraint (`chk_payment_cash_handover_maker_checker`).
   - Verifies physically counted rupees match the exact 64-bit `BigInt` sum, transitioning custody to `ACKNOWLEDGED` and stamping `cashHandoverAcknowledgedAt` (aligned with Form XXII Cash Book timing).

---

## 7. Testing & Verification

Verified by **34 automated Jest unit tests** in `apps/api/test/unit/collection.spec.ts` (alongside `payment.spec.ts` [45], `arrears-util.spec.ts` [14], `reconciliation-ledger.spec.ts` [8], `04-payments-reversals.e2e-spec.ts` [16], and `apps/mobile/test/offline_sync_test.dart`):

```bash
pnpm --filter api test -- test/unit/collection.spec.ts
```
