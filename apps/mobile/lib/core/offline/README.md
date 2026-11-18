# Kumaran Chits — Mobile Client Core: Offline Sync & Auth Interceptor

> **Subsystem**: Dart Client Core SDK (`apps/mobile/lib/core/`)  
> **Phase Scope (`ADR-26`)**: Dart Client Core models, offline SQLite synchronization, and single-flight auth interceptors are **live and verified** (`6/6` Dart suites, `0` analyzer warnings). Flutter Android UI screens and APK packaging are scheduled for **Phase 2 (Q2 2027)**.  
> **Architecture Reference**: [`docs/03-architecture/offline-architecture.md`](../../../../docs/03-architecture/offline-architecture.md)

---

## 1. Overview

Field collection agents collect subscription payments in rural areas around Perundurai and Erode with intermittent or zero cellular connectivity. The offline cache & sync engine guarantees:

1. **Zero Double Collections (`ADR-07`)**: Once a collection is recorded locally, the corresponding due status in `cached_assigned_dues` transitions to `PAID` immediately.
2. **Whole-Rupee Integer Parity (`Guardrail 2`)**: All monetary amounts, installment months, and ticket counts across `OfflineCollectionItem`, `CachedAssignedDue`, and `api_models.dart` strictly use 64-bit Dart `int` parsed via `_parseWholeRupeeInt` / `_parseWholeRupeeIntOrNull` (zero `double` currency fields; lossless beyond $2^{53}-1$).
3. **Immutable Point-of-Collection Idempotency & Mandatory Month**: Every offline item captures a cryptographically random UUIDv4 `idempotency_key` (`IdempotencyHelper.generateUuidV4()`) alongside mandatory `installmentMonth: int` (`DEF-MOB-02`) at the moment of cash handover.
4. **Batch Queue Drainage & Poison-Item Cap (`M8-MOB-DEF-09`, `M8-MOB-DEF-10`)**:
   - `OfflineSyncManager` dispatches queued items in batch to `POST /api/v1/collections/sync-offline-queue` with item-level failure isolation (falling back seamlessly to single-record sync via `POST /api/v1/collections/record`).
   - Enforces `maxRetries = 5` so permanently invalid items never enter infinite sync loops; rows are removed from `offline_collections_queue` only after receiving server confirmation or duplicate replay acknowledgment.
   - `OfflineStorageProvider` (`offline_database.dart`) exposes canonical SQLite DDL (`CREATE TABLE IF NOT EXISTS cached_assigned_dues` and `offline_collections_queue`).

---

## 2. Key Offline Classes (`apps/mobile/lib/core/offline/`)

- **`CachedAssignedDue`** (`models/offline_models.dart`): Immutable model representing morning assigned route dues.
- **`OfflineCollectionItem`** (`models/offline_models.dart`): Offline cash collection record carrying `idempotencyKey`, `ticketId`, `installmentMonth`, 64-bit `int` `amount`, `collectedAt`, and `retryCount`.
- **`OfflineStorageProvider`** (`offline_database.dart`): Abstract storage interface, canonical SQLite DDL statements, and in-memory test implementation.
- **`OfflineDuesRepository`** (`offline_dues_repository.dart`): High-level repository for reading cached route dues and persisting offline doorstep collections.
- **`OfflineSyncManager`** (`offline_sync_manager.dart`): Synchronization orchestrator (`maxRetries = 5`) targeting `/api/v1/collections/sync-offline-queue` and `/api/v1/collections/record`.

---

## 3. Single-Flight Auth Interceptor (`F14` / `DEF-MOB-01` Closure) & Verification

- **Canonical Refresh Endpoint (`DEF-MOB-01` Remediated)**: `AuthInterceptor` (`apps/mobile/lib/core/api/client/auth_interceptor.dart:67`) executes single-flight token rotation (`_inFlightRefresh` mutex) against the canonical NestJS endpoint **`POST /api/v1/auth/refresh-token`** (resolving `/auth/refresh-token` when base URL already ends with `/api/v1`) with `clientType: 'MOBILE'` family isolation (`ADR-24`), preventing cross-device logout cascades with Web sessions.
- **Full-Stack Auth & Session Parity**: Complements the 15 live `AuthController` endpoints (`apps/api/src/auth/`), RFC 6819 refresh-token reuse detection, `Session` vault client-family isolation, and Next.js 15 Edge/BFF `HttpOnly` cookie session architecture (`apps/web/`).

### Dart Core Verification Commands (`6/6` Suites + Clean Analyzer)
```bash
cd apps/mobile
dart analyze                                         # Expected: No issues found!
dart run test/auth_refresh_test.dart                 # Single-flight 401 refresh & MOBILE family isolation
dart run test/offline_sync_test.dart                 # Batch sync, installmentMonth, maxRetries & idempotency
dart run test/customer_models_test.dart              # Nominee fullName/name alias & integer count parity
dart run test/chit_models_test.dart                  # Scheme & BigInt whole-rupee model parsing
dart run test/auction_disbursement_models_test.dart  # Auction, tie-break, correction & payout models
dart run test/report_models_test.dart                # Dashboard, Form XVII/XXI/XXII & Audit Log 64-bit int models
```
