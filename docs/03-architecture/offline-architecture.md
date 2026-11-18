# Kumaran Chits — Offline Architecture & Synchronization Guide

> **Product**: **Kumaran Chits** (Kumaran Finance, Perundurai, Tamil Nadu)  
> **Domain**: **Rural Offline Field Collections, In-Office Physical Auctions & Infrastructure Fallbacks**  
> **Key Objective**: Ensure 100% operational continuity in rural cellular dead zones and during branch power/broadband outages without corrupting financial ledgers or leaking rupees.

---

## 1. Quick-Recall Cheat Sheet (30-Second Summary)

If you need to quickly recall how the offline feature works in Kumaran Chits:

| Operational Dimension | Mechanism / Key Endpoint | Authoritative Store | Fail-Safe & Invariants | Current Status |
|---|---|---|---|:---:|
| **Rural Doorstep Collections** | `POST /api/v1/collections/sync-offline-queue` (Batch of 1 to 100 items) | PostgreSQL 17 (`Payment`, `InstallmentDue`, `Receipt`) | Client-generated UUID `idempotencyKey` prevents duplicate payments on network retries. | ✅ **100% Implemented & Tested**<br>([`apps/mobile/lib/core/offline/`](file:///u:/Kumaran-finance/apps/mobile/lib/core/offline/)) |
| **Partial Failure Isolation** | Split response envelope `{ synced: [...], failed: [...] }` | Application Service ([`collection.service.ts`](file:///u:/Kumaran-finance/apps/api/src/collection/collection.service.ts)) | An invalid item (e.g. already paid at office) does not fail the rest of the batch. | ✅ **100% Implemented & Tested** |
| **Exact Rupee Match** | Enforced before database commit | PostgreSQL 17 (`InstallmentDue.netPayableAmount`) | ADR-07: Exact $I_{net}$ matching; partial payments strictly rejected (`PARTIAL_PAYMENTS_NOT_ALLOWED`). | ✅ **100% Implemented & Tested** |
| **Evening Vault Deposit** | `POST /collections/cash-handover/submit`<br>`POST /collections/cash-handover/acknowledge` | PostgreSQL 17 (`Payment.cashHandoverStatus`, `cashHandoverAcknowledgedByUserId`, `cashHandoverAcknowledgedAt`) | Non-Negotiable Hard Guard (`chk_payment_cash_handover_maker_checker`): `collector_user_id != acknowledger_user_id` (`SUPER_ADMIN`, `BRANCH_MANAGER`, or `ACCOUNTANT` signs cash into safe). | ✅ **100% Implemented & Tested** |
| **In-Office Physical Auctions** | Paper token draw (Option A) + Post-connectivity entry | PostgreSQL 17 (`Auction`, `AuctionMinutes`) | ADR-05 & ADR-06: Broadband failure does not stop the auction; Foreman draws physical brass tokens. | ✅ **100% Implemented & Tested** |
| **Redis Offline Fallback** | In-Memory `Map<string, OtpSessionRecord>` in [`AuthService`](file:///u:/Kumaran-finance/apps/api/src/auth/auth.service.ts) | Node.js Process Memory | Identical 300s TTL and 3-attempt brute-force lockout if Redis container is offline. | ✅ **100% Implemented & Tested** |

---

## 2. System Architecture & End-to-End Workflow

In rural Perundurai and Erode, field collection agents ride two-wheelers to agricultural farmhouses where 4G/5G mobile signal is completely absent. The diagram below illustrates the complete lifecycle from offline doorstep collection to branch vault deposit:

```mermaid
sequenceDiagram
    autonumber
    actor FieldAgent as Field Collection Agent
    participant Mobile as Mobile App (Offline SQLite)
    participant API as CollectionController
    participant Service as CollectionService
    participant DB as PostgreSQL 17
    participant Queue as BullMQ (notification-queue)
    actor Partner as Branch Partner (Checker)

    Note over FieldAgent,Mobile: MORNING: Agent downloads assigned dues at Head Office Wi-Fi
    FieldAgent->>Mobile: Collect Cash at rural farmhouse (0 Network Bars)
    Mobile->>Mobile: Generate client UUID idempotencyKey
    Mobile->>Mobile: Record collectedAt timestamp & save locally in SQLite
    Mobile-->>FieldAgent: Displays offline receipt code on screen

    Note over FieldAgent,Mobile: AFTERNOON: Agent regains 4G signal or returns to branch
    Mobile->>API: POST /collections/sync-offline-queue ({ items: [1..100] })
    
    loop For each offline item in batch
        API->>Service: Process item
        Service->>DB: Check idempotencyKey in Payment table
        alt Idempotency Key Already Exists (Network Retry)
            Service-->>API: synced[] with isDuplicate = true (returns original receipt)
        else Validation Passes (Due unpaid, exact Inet)
            Service->>DB: INSERT Payment (cashHandoverStatus = 'PENDING_HANDOVER')
            Service->>DB: INSERT PaymentAllocation & INSERT Receipt
            Service->>DB: UPDATE InstallmentDue status = 'PAID'
            Service--)Queue: Asynchronous dispatch: addJob(JOB_DISPATCH_PAYMENT_RECEIPT)
            Service-->>API: synced[] with isDuplicate = false
        else Validation Fails (Already paid at counter, amount mismatch)
            Service-->>API: failed[] with errorCode & errorMessage
        end
    end

    API-->>Mobile: Response ({ totalSubmitted, successCount, failureCount, synced, failed })
    Mobile->>Mobile: Remove synced items from SQLite; flag failed items for review

    Note over FieldAgent,Partner: EVENING (05:00 PM): Physical Cash Handover into Safe
    FieldAgent->>API: POST /collections/cash-handover/submit ({ paymentIds, notes })
    Partner->>Partner: Physically counts currency notes and coins
    Partner->>API: POST /collections/cash-handover/acknowledge ({ collectorUserId, acknowledgedAmount, paymentIds })
    Note over API: STRICT GUARD (SUPER_ADMIN / BM / ACCOUNTANT): collector_user_id != acknowledger_user_id
    API->>DB: UPDATE Payment cashHandoverStatus = 'ACKNOWLEDGED', cashHandoverAcknowledgedAt = NOW()
```

---

## 3. Backend Implementation Details

### 3.1 DTO Contracts

#### Request Payload: [`SyncOfflineQueueDto`](file:///u:/Kumaran-finance/apps/api/src/collection/dto/sync-offline-collection.dto.ts)
```typescript
export class SyncOfflineCollectionItemDto {
  @IsNotEmpty()
  @IsString()
  idempotencyKey: string; // Unique client-generated UUID

  @IsNotEmpty()
  @IsString()
  ticketId: string; // Target SubscriberTicket UUID

  @IsInt()
  @Min(1)
  installmentMonth: number; // Installment month (1 to N)

  @Transform(({ value }) => parseStrictWholeRupeeValue(value))
  @IsInt()
  @IsPositive()
  @Max(MAX_SAFE_WHOLE_RUPEE)
  amount: number; // Exact net payable whole rupees (e.g. 3950)

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod; // CASH, UPI, CHEQUE, BANK_TRANSFER

  @IsDateString()
  collectedAt: string; // ISO 8601 timestamp captured on physical device

  @IsOptional()
  @IsString()
  transactionRef?: string; // Optional UTR number or physical reference
}

export class SyncOfflineQueueDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SyncOfflineCollectionItemDto)
  items: SyncOfflineCollectionItemDto[];
}
```

#### Response Envelope: [`SyncOfflineQueueResponseDto`](file:///u:/Kumaran-finance/apps/api/src/collection/dto/collection-response.dto.ts)
```typescript
export class SyncOfflineQueueResponseDto {
  totalSubmitted: number; // Total items in batch (e.g. 25)
  successCount: number;   // Number of successfully recorded collections
  failureCount: number;   // Number of rejected items
  synced: OfflineSyncSuccessItemDto[];
  failed: OfflineSyncFailedItemDto[];
}
```

### 3.2 Granular Batch Error Codes

When an individual item fails, the batch is not terminated. The failed item is isolated with one of the following error codes:

| Error Code | Root Cause | System Action & Resolution |
|---|---|---|
| `INSTALLMENT_ALREADY_PAID` | Subscriber already settled this month's due (e.g. paid at office counter or online while agent was in field). | The payment is rejected; the agent returns physical cash to the subscriber. |
| `PARTIAL_PAYMENTS_NOT_ALLOWED` | Amount collected does not match `due.netPayableAmount` ($I_{net} = I_{base} - Div$). | ADR-07 invariant violation; agent must collect the exact whole-rupee net due. |
| `TICKET_NOT_FOUND` | Ticket UUID is invalid or corrupted. | Agent refreshes assigned list. |
| `CHIT_NOT_ACTIVE` | Chit group is in `DRAFT`, `REGISTERED`, `COMPLETED`, `CLOSED`, or `CANCELLED` status. | Collections cannot be recorded on inactive schemes. |
| `TICKET_REMOVED` | Subscriber was removed under ADR-07 (3 consecutive months of arrears). | Defaulter settlement SOP must be initiated at Head Office. |
| `DUE_NOT_FOUND` | Installment due has not been generated for the target month. | Scheme administrator generates monthly dues. |

### 3.3 Core Batch Service Logic ([`collection.service.ts`](file:///u:/Kumaran-finance/apps/api/src/collection/collection.service.ts#L801-L940))

```typescript
async syncOfflineQueue(
  dto: SyncOfflineQueueDto,
  collectorUserId: string,
  staffBranchId?: string | null,
): Promise<SyncOfflineQueueResponse> {
  const synced: SyncedOfflineItemResult[] = [];
  const failed: FailedOfflineItemResult[] = [];

  for (const item of dto.items) {
    try {
      const result: any = await this.recordCollection(
        {
          ticketId: item.ticketId,
          installmentMonth: item.installmentMonth,
          amount: item.amount,
          paymentMethod: item.paymentMethod,
          idempotencyKey: item.idempotencyKey,
          collectedAt: item.collectedAt,
          transactionRef: item.transactionRef,
        },
        collectorUserId,
        staffBranchId,
      );

      synced.push({
        idempotencyKey: item.idempotencyKey,
        paymentId: result.paymentId,
        receiptNumber: result.receiptNumber,
        amount: result.amount.toString(),
        status: 'SUCCESS',
        isDuplicate: !!result.duplicateIgnored,
        collectedAt: result.collectedAt || item.collectedAt,
      });
    } catch (err: any) {
      // Map exception into granular error code without throwing
      const errorMessage = err?.message || 'Failed to record offline collection';
      let errorCode = 'SYNC_FAILED';
      if (errorMessage.includes('INSTALLMENT_ALREADY_PAID')) errorCode = 'INSTALLMENT_ALREADY_PAID';
      else if (errorMessage.includes('PARTIAL_PAYMENTS_NOT_ALLOWED')) errorCode = 'PARTIAL_PAYMENTS_NOT_ALLOWED';
      else if (errorMessage.includes('Subscriber ticket not found')) errorCode = 'TICKET_NOT_FOUND';
      else if (errorMessage.includes('Chit scheme is not active')) errorCode = 'CHIT_NOT_ACTIVE';
      else if (errorMessage.includes('removed from this chit scheme')) errorCode = 'TICKET_REMOVED';
      else if (errorMessage.includes('has not been generated')) errorCode = 'DUE_NOT_FOUND';

      failed.push({
        idempotencyKey: item.idempotencyKey,
        ticketId: item.ticketId,
        installmentMonth: item.installmentMonth,
        amount: item.amount,
        errorCode,
        errorMessage,
      });
    }
  }

  return {
    totalSubmitted: dto.items.length,
    successCount: synced.length,
    failureCount: failed.length,
    synced,
    failed,
  };
}
```

> [!NOTE]
> **Database Concurrency Protection**: Every item inside `syncOfflineQueue` delegates directly to `this.recordCollection(...)`, which runs under `withTransactionRetry` and acquires strict 3-tier pessimistic locks via [`acquirePaymentConcurrencyLocks`](file:///u:/Kumaran-finance/apps/api/src/common/utils/receipt-sequence.util.ts) (`Branch` $\to$ `SubscriberTicket` $\to$ `InstallmentDue`) before generating sequential `KC-REC-` receipts inside the locked transaction (`generateNextReceiptNumber`). Parallel field-agent sync batches and office counter payments therefore serialize cleanly with zero `40P01` deadlocks or `P2002` receipt collisions.

---

## 4. Evening Dual-Control Cash Handover

Every offline cash collection commits to PostgreSQL with:
```sql
"paymentMethod" = 'CASH'
"cashHandoverStatus" = 'PENDING_HANDOVER'
```

At 05:00 PM, the physical cash must be transferred to the Head Office vault safe:
1. **Agent Submits Handover** (`POST /api/v1/collections/cash-handover/submit`):
   - Tallies all unacknowledged `PENDING_HANDOVER` cash payments collected by the agent during the day (tracked directly on `Payment.cashHandoverStatus`; zero separate `CashHandover` table).
2. **Independent Vault Checker Acknowledges Cash into Safe** (`POST /api/v1/collections/cash-handover/acknowledge`, `@Roles(SUPER_ADMIN, BRANCH_MANAGER, ACCOUNTANT)`):
   - Partner, Branch Manager, or Desk Accountant physically counts currency notes and coins and submits `{ collectorUserId, acknowledgedAmount, paymentIds }`.
   - **Hard Invariant Enforced ([`collection.service.ts:498`](file:///u:/Kumaran-finance/apps/api/src/collection/collection.service.ts#L498) & PostgreSQL `chk_payment_cash_handover_maker_checker`)**:
     ```typescript
     if (dto.collectorUserId === acknowledgerUserId) {
       throw new ForbiddenException(
         'DUAL_CONTROL_VIOLATION: The field agent who collected the cash cannot acknowledge their own handover batch. An independent Cashier or Partner must count and verify currency notes.',
       );
     }
     ```
   - All included payments transition to `cashHandoverStatus = 'ACKNOWLEDGED'` with `cashHandoverAcknowledgedAt` stamped, entering the branch safe balance in Form XXII (`DEF-M10-STAT-01`).

---

## 5. Mobile Client Core & Phase 1 Field Fallback Protocol (`ADR-26`)

- **Phase 1 Implemented & Verified — Dart Core Offline Engine (`apps/mobile/lib/core/offline/`)**:
  - [`offline_database.dart`](file:///u:/Kumaran-finance/apps/mobile/lib/core/offline/offline_database.dart), [`offline_dues_repository.dart`](file:///u:/Kumaran-finance/apps/mobile/lib/core/offline/offline_dues_repository.dart), [`offline_sync_manager.dart`](file:///u:/Kumaran-finance/apps/mobile/lib/core/offline/offline_sync_manager.dart), and [`offline_models.dart`](file:///u:/Kumaran-finance/apps/mobile/lib/core/offline/models/offline_models.dart) implement the full local SQLite queue, UUIDv4 idempotency persistence, batch `POST /api/v1/collections/sync-offline-queue` + single-item `/collections/record` fallback, and `AuthSessionManager` single-flight refresh (`F14`), verified by **6 / 6 Dart test suites**.
- **Phase 2 Deferred — Native Flutter Android UI & APK (`ADR-26`, Q2 2027)**: Native Android UI screens, `connectivity_plus`, and `workmanager` UI bindings are deferred to Phase 2 per business owner directive.

### 5.1 Phase 1 Field Operational Fallback Protocol (Rural Erode Dead Zones)
Across rural hamlets around **Perundurai, Chennimalai, Bhavani, and Uthukuli**, while the native Android UI is deferred to Phase 2, field collection agents operate using two approved Phase 1 methods:
1. **Mobile Web Browser Mode**: Agents access the responsive Next.js Web Portal (`apps/web`) via Chrome on Android smartphones wherever 4G data is available.
2. **Pre-Numbered Physical Receipt Book SOP (0-Bar Dead Zones)**: In cellular dead zones, agents record cash in their physical pre-numbered carbon-copy receipt book and sign the customer's physical paper passbook (`ADR-11`). Upon returning to network coverage or Head Office, the agent or desk accountant enters those receipts into the Web Portal before evening vault handover.

```mermaid
flowchart TD
    subgraph FLUTTER_CLIENT ["Flutter Mobile App (apps/mobile/)"]
        Auth["Biometric / MPIN Unlock\n(Cached secure token)"] --> Home["Assigned Dues Screen"]
        Home --> LocalCache[("SQLite / Drift Database\n• cached_assigned_dues\n• offline_collections_queue")]
        
        Doorstep["Doorstep Record\n(No Internet)"] --> SaveLocal["1. Generate UUID idempotencyKey\n2. INSERT into offline_collections_queue\n3. Mark local due as PAID_OFFLINE"]
        SaveLocal --> ShowReceipt["Sign physical paper passbook with pen\nand display digital receipt / QR on mobile screen"]

        NetWatcher["connectivity_plus Listener"] -->|Detects Wi-Fi / 4G| AutoSync["Sync Manager Worker\n(SELECT * FROM offline_collections_queue)"]
        ManualSync["Manual 'Sync Now' Button"] --> AutoSync
    end

    AutoSync -->|POST /collections/sync-offline-queue| Backend["NestJS Backend API\n(Port 3000)"]
    Backend -->|{ synced, failed }| AutoSync
    AutoSync -->|DELETE FROM queue WHERE id IN (synced)| LocalCache
```

### Planned Mobile Dependencies:
- **Local Storage**: `drift` / `sqflite` (Encrypted SQLite database for offline caching).
- **Network Awareness**: `connectivity_plus` (Monitors cellular/Wi-Fi transitions).
- **Background Sync**: `workmanager` (Triggers periodic synchronization when charging/connected).
- **Single-Flight Refresh Mutex & Transparent 401 Replay (F14)**: Mobile API requests handle token expiration automatically via `AuthSessionManager`'s single-flight mutex (`_inFlightRefresh`) with `clientType: 'MOBILE'`, safely replaying queue sync operations without session collision or user interruption.
- **Same-Branch Idempotency Isolation (F09)**: Server verifies `existingPayment.recordedByUserId === userId` when handling cached idempotency keys, ensuring field agents cannot inspect or replay payments recorded by other agents.
- **Signed Paper Passbook (ADR-11)**: Physical proof signed directly in subscriber's paper passbook with pen; loose receipt thermal printers are completely eliminated.

---

## 6. Live Server Verification & Automated Test Proofs

### 6.1 Unit Test Proof ([`apps/api/test/unit/collection.spec.ts`](file:///u:/Kumaran-finance/apps/api/test/unit/collection.spec.ts))

Verified **34 / 34 tests passing** covering the entire collection, offline sync, concurrency lock, same-branch idempotency isolation (`F09`), and dual-control cash handover module (within the 1,226-test API unit baseline):
```bash
$ pnpm --filter api test test/unit/collection.spec.ts

PASS apps/api/test/unit/collection.spec.ts
  CollectionService
    ✓ 1. Doorstep Cash Collection Recording (POST /collections/record)
    ✓ 2. Invariant Guard: Exact Net Installment Matching (ADR-07)
    ✓ 3. Invariant Guard: Zero Double Payments (ADR-07)
    ✓ 4. Idempotency & Same-Branch Isolation Guard (F09)
    5. Offline Queue Batch Synchronization (POST /collections/sync-offline-queue)
      ✓ should successfully sync batch of offline collections and return receipts
      ✓ should handle idempotent re-submission cleanly by returning existing receipt (isDuplicate = true)
      ✓ should provide partial success isolation when one item succeeds and others fail
    6. BullMQ Notification Queue Hookup
      ✓ should enqueue collection receipt job to notification-queue upon successful doorstep collection
    7. Daily Summary & Evening Cash Handover
      ✓ should fetch daily collection summary for field agent
      ✓ should submit cash handover batch and transition status to PENDING_HANDOVER
      ✓ should acknowledge cash handover and deposit cash into branch vault
      ✓ should reject cash handover acknowledgment if collector attempts self-signoff (DUAL_CONTROL_VIOLATION)

Test Suites: 1 passed, 1 total
Tests:       34 passed, 34 total
```

### 6.2 Live Server Lifecycle 6 Proof ([`apps/api/scripts/lifecycle/verify-lifecycle-6.ts`](file:///u:/Kumaran-finance/apps/api/scripts/lifecycle/verify-lifecycle-6.ts))

Executed live against the running NestJS server on `http://127.0.0.1:3000/api/v1` and verified directly in PostgreSQL 17:

```text
--- [3/6] POST /collections/sync-offline-queue (Offline sync, optional fields & idempotency test) ---
   Submitting offline batch with 1 collection (with transactionRef) + 1 duplicate (Key: f899a12c-0e22-48f1-9430-66440c4d8e09)...
   Status: 200
   Total Submitted: 2
   Success Count: 2
   Item 1 isDuplicate: false
   Item 2 isDuplicate: true

   [PostgreSQL DB Verification]:
   Due #3 Status: 3950|PAID (Expected: 3950|PAID)

--- [4/6] GET /collections/daily-summary (Daily cash summary) ---
   Status: 200
   Total Collections Count: 2
   Total Cash Collected: ₹7900
   Cash Pending Handover: ₹7900

--- [5/6] POST /collections/cash-handover/submit (Submit cash handover) ---
   Status: 201
   Handover ID: 446738b0-811c-43f1-b1e1-e970b55ec70c
   Amount: ₹7900
   Handover Status: PENDING

--- [6/6] POST /collections/cash-handover/acknowledge (Dual control vault acknowledgment) ---
   Guard Test: Agent attempting self-acknowledgment...
   Guard Status: 403 Forbidden (Dual-Control enforced: collector != acknowledger)
   Super Admin acknowledging cash handover...
   Status: 200
   Handover Status: ACKNOWLEDGED
   Acknowledged By User ID: ebf67759-bf05-4fa6-b653-577b3f144900 (Partner)

======================================================
🎉 LIFECYCLE 6 LIVE VERIFICATION PASSED (100% SUCCESS)
======================================================
```
