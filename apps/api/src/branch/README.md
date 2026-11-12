# Company Branch Office Administration Module

> **Module**: `apps/api/src/branch/`  
> **Company**: **Kumaran Finance** (Perundurai, Erode, Tamil Nadu)  
> **Guiding ADRs**: [ADR-01 (Single Company Tenancy), ADR-17 (Bilingual Receipts)](../../../../docs/01-business/decision-log.md)

---

## 1. Overview & Business Rules

The **Branch Module** governs company office locations:
1. **Single-Company Tenancy (ADR-01)**: Dedicated to Kumaran Finance; zero `company_id` columns exist.
2. **Current & Future Hierarchy**: Supports the active Head Office (`PRD` - Perundurai) while architecturally enabling dynamic branch expansion (`ERD` - Erode, etc.).
3. **Bilingual Office Metadata (ADR-17)**: Captures official names in both English and Tamil (`nameTamil`, e.g., `"தலைமை கிளை - பெருந்துறை"`) for receipt and voucher printing.

---

## 2. Endpoint Catalog

| Method | Endpoint | Description | Allowed Personas |
|---|---|---|---|
| `GET`  | `/api/v1/branches` | List company branch offices (`?activeOnly=true`) | Authenticated Staff & Auditor |
| `GET`  | `/api/v1/branches/:id` | Get branch metadata and address by ID | Authenticated Staff & Auditor |
| `POST` | `/api/v1/branches` | Create a new physical branch office | `SUPER_ADMIN` |

---

## 3. Testing & Verification

Automated unit tests covering branch creation, code uniqueness, bilingual metadata, and active filtering:

```bash
pnpm --filter api test -- test/branch.spec.ts
```
