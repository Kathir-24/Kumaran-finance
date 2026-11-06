# Kumaran Chits — Mobile Offline Dues & Collection Sync

> **Domain**: Field Collection Agent Android App  
> **Location**: `apps/mobile/lib/core/offline/`  
> **Architecture Reference**: [`docs/03-architecture/offline-architecture.md`](../../../../docs/03-architecture/offline-architecture.md)

---

## 1. Overview

Field collection agents collect subscription payments in rural areas around Perundurai and Erode with intermittent or zero cellular connectivity.

The offline cache subsystem guarantees:
1. **Zero Double Collections**: Once a collection is recorded locally, the corresponding due status in `cached_assigned_dues` transitions to `PAID` immediately.
2. **Immutable Point-of-Collection Idempotency**: Each offline collection generates a cryptographically random UUIDv4 `idempotency_key` via `IdempotencyHelper.generateUuidV4()` at the moment of cash handover.
3. **Safe Queue Drainage**: An item is deleted from `offline_collections_queue` only after receiving an HTTP 200/201 or 409 (already recorded) confirmation from `/api/v1/collections/counter`.

---

## 2. Key Classes

- **`CachedAssignedDue`**: Model representing morning assigned route dues.
- **`OfflineCollectionItem`**: Model representing an offline cash collection awaiting server sync.
- **`OfflineStorageProvider`**: Abstract interface and SQLite/memory implementations.
- **`OfflineDuesRepository`**: High-level repository for reading route dues and recording doorstep collections.
- **`OfflineSyncManager`**: Background worker orchestrating server synchronization.
