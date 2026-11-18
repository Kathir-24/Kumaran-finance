# Company Branch Office Administration Module

> **Module**: `apps/api/src/branch/`  
> **Company**: **Kumaran Finance** (Perundurai, Erode, Tamil Nadu)  
> **Guiding ADRs**: [ADR-01 (Single Company Tenancy), ADR-17 (Bilingual Receipts)](../../../../docs/01-business/decision-log.md)

---

## 1. Overview & Business Rules

The **Branch Module** governs company office locations and bilingual receipt headers:

1. **Single-Company Tenancy (`ADR-01`)**: Dedicated exclusively to Kumaran Finance; zero `company_id` columns exist anywhere in the schema.
2. **Current & Future Hierarchy**: Supports the active Head Office (`PRD` — Perundurai) while enabling dynamic branch expansion (`ERD` — Erode, etc.) with unique uppercase branch codes and optimistic locking (`version`).
3. **Bilingual Office Metadata (`ADR-17`)**: Captures official names in both English and Tamil (`nameTamil`, e.g., `"தலைமை கிளை - பெருந்துறை"`), address, and phone for statutory registers, A5 receipts, and payout vouchers.
4. **Redis Master-Data Caching & Penetration Guard**:
   - `BranchService.findAll()` caches branch listings in Redis (1-hour TTL) with fail-open fallback to PostgreSQL 17 if Redis is unavailable.
   - `BranchService.findById()` applies 60-second negative caching for missing IDs to mitigate cache-penetration scans.
   - Write mutations (`POST /api/v1/branches` and `PATCH /api/v1/branches/:id`) atomically invalidate cached branch keys in Redis.

---

## 2. Endpoint Catalog (`BranchController` — 4 Live Routes)

All 4 routes are served by `apps/api/src/branch/branch.controller.ts`:

| Method | Endpoint | Description | Allowed Personas |
|---|---|---|---|
| `GET` | `/api/v1/branches` | List company branch offices (`?activeOnly=true`) — cached 1h in Redis | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, `COLLECTION_AGENT` *(for bilingual receipt headers)*, `AUDITOR` |
| `GET` | `/api/v1/branches/:id` | Get branch metadata, Tamil name, and address by ID (60s negative cache) | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, `COLLECTION_AGENT`, `AUDITOR` |
| `POST` | `/api/v1/branches` | Create a new physical branch office with unique uppercase `code` & invalidate cache | `SUPER_ADMIN` |
| `PATCH` | `/api/v1/branches/:id` | Update branch name, `nameTamil`, address, phone, or `isActive` status (`UpdateBranchDto`) & invalidate cache | `SUPER_ADMIN` |

---

## 3. Testing & Verification

Verified by **15 automated Jest unit tests** across **2 spec files** under `apps/api/test/unit/`:

| Spec File | Tests | Verified Scope |
|---|:---:|---|
| `apps/api/test/unit/branch.spec.ts` | **8** | Branch queries (4), creation & code uniqueness (2), `PATCH` metadata/status update & cache invalidation (2) |
| `apps/api/test/unit/branch-cache.spec.ts` | **7** | Redis 1h cache hit/miss, 60s negative caching, fail-open fallback on Redis outage, write-through invalidation |

```bash
pnpm --filter api test -- test/unit/branch.spec.ts test/unit/branch-cache.spec.ts
```
