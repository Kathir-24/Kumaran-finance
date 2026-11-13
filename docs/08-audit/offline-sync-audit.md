# OFFLINE SYNC & FIELD AGENT RESILIENCE AUDIT — KUMARAN CHITS
**Kumaran Finance — Perundurai Head Office, Erode District, Tamil Nadu**  
**Audit Stage**: Independent Verification & Offline Sync Architecture Audit  
**Date**: November 2026  
**Auditor**: Antigravity Senior Engineering & Audit Swarm  

---

## 1. Operating Reality in Rural Tamil Nadu

Field collection agents operating for Kumaran Finance travel to rural farming hamlets and village fringe areas around Perundurai, Chennimalai, Bhavani, and Uthukuli. In these areas, 4G cellular connectivity can be intermittent or completely unavailable for hours.

To allow uninterrupted collection operations without double collection or loss of cash records, Kumaran Chits includes a dedicated offline-first collection protocol.

---

## 2. Synchronization Architecture & Invariant Rules

### Invariant 1: Client-Generated Deterministic UUIDs
- When an agent collects cash offline, the client generates a unique UUID v4 for the collection record.
- If network drops during upload and the agent resends the sync payload, the server detects the existing UUID and performs idempotent deduplication.

### Invariant 2: Idempotent Batch Ingestion
- Collections are uploaded in batches via `POST /collections/sync-offline`.
- Each item contains `clientCollectionId`, `ticketId`, `amount`, `collectedAt`, and `signatureHash`.
- Backend wraps the batch in a transaction. Already-synced records are skipped without raising errors.

### Invariant 3: Single Discrete Payment Enforcement (ADR-07)
- If a due was already settled at the branch counter while the agent was offline:
  - Server detects `DueStatus.PAID`.
  - Rejects the offline collection for that specific due with `CONFLICT_DUE_ALREADY_PAID`.
  - Flags transaction for physical cash refund review at evening handover desk.

---

## 3. Implementation Status Across Stack

| Layer | Component | Status | Verification Evidence |
|---|---|---|---|
| **Backend API** | `CollectionService.syncOfflineCollections` | **IMPLEMENTED & TESTED** | `collection.service.ts`, `concurrency-postgres.spec.ts` |
| **Backend Endpoints**| `POST /collections/sync-offline` | **IMPLEMENTED & TESTED** | `api-spec.md`, `collection.controller.ts` |
| **Idempotency Store**| PostgreSQL unique index on `clientCollectionId` | **IMPLEMENTED & TESTED** | `schema.prisma`, `data-model.md` |
| **Web Agent Portal** | Doorstep collection sync UI | **IMPLEMENTED & TESTED** | `apps/web/test/rbac-navigation.spec.ts` |
| **Mobile App (Flutter)** | Local SQLite offline database & background sync | **DEFERRED** | Postponed by business owner (Flutter scope parked) |

---

## 4. Operational Fallback Protocol

While the Flutter mobile application remains postponed, field agents operate using one of two approved methods:
1. **Mobile Web Browser Mode**:
   - Field agents access the responsive Next.js web application (`apps/web`) via Chrome on their Android smartphones when cellular data is available.
2. **Physical Collection Receipt Book (SOP Fallback)**:
   - In dead zones, agents issue carbon-copy paper receipts from physical pre-numbered books (current existing practice).
   - Upon returning to branch, agent or desk accountant enters records into the web portal before evening cash handover.
