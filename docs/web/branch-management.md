# Branch Offices Administration (`/branches`, `/branches/new`)

> **Product**: **Kumaran Chits** (Official Operations Software for **Kumaran Finance**)  
> **Phase**: Phase 9 — Staff Administration, Branches & Operations Control  
> **Task**: Task 9.1 — Branch Offices Administration  
> **Route**: `/branches` (Directory) & `/branches/new` (Registration Form)  
> **Authority**: Viewing allowed for all Staff & Auditor; Registration strictly restricted to `SUPER_ADMIN` (Partners)

---

## 1. Architectural & Operating Context

Kumaran Finance operates from its **Head Office in Perundurai, Erode District, Tamil Nadu** (`PRD`), managed directly by **4 equal partners**.

Per **ADR-01** (Single-Company Tenancy) and **ADR-02** (Branch Scope):
- **Zero Multi-Tenant Bloat**: Kumaran Finance is the sole business entity; zero `company_id` columns exist in the database schema or API DTOs.
- **Dedicated Branch Entity**: A discrete `Branch` model exists in PostgreSQL (`model Branch`). The Head Office (`PRD`) is seeded as the primary operating branch (`Head Office - Perundurai` / `தலைமை கிளை - பெருந்துறை`).
- **Seamless Regional Expansion**: When Kumaran Finance establishes physical operations in neighboring towns (e.g. Erode Town, Tiruppur, Bhavani, Kangeyam), branches are provisioned via `/branches/new` without mutating or breaking existing chit scheme rosters or customer records.
- **10-Digit Indian Phone Standard (ADR-18)**: Branch contact phones strictly validate against `^[6-9]\d{9}$`.

---

## 2. API Endpoints & Contracts

| Method | Endpoint | Allowed Roles | Request Payload | Response | Error Codes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`GET`** | `/api/v1/branches` | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, `COLLECTION_AGENT`, `AUDITOR` | Query: `activeOnly?: string` (`'true'` / `'false'`) | `BranchResponseDto[]` | `401 Unauthorized` |
| **`GET`** | `/api/v1/branches/:id` | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, `COLLECTION_AGENT`, `AUDITOR` | Param: `id: string` | `BranchResponseDto` | `404 Not Found` |
| **`POST`** | `/api/v1/branches` | `SUPER_ADMIN` only | Body: `CreateBranchDto` (`code`, `name`, `nameTamil?`, `address`, `phone`) | `201 Created` (`BranchResponseDto`) | `400 Bad Request`, `403 Forbidden`, `409 Conflict` |

---

## 3. Web UI Architecture

```
apps/web/src/
├── app/(dashboard)/
│   ├── branches/
│   │   ├── page.tsx               # Master directory route with 4 KPI cards & filter tabs (253 lines)
│   │   └── new/
│   │       └── page.tsx           # Create route with Super Admin RBAC gate & Guardrail 1 banner (79 lines)
├── components/branches/
│   ├── branch-form.tsx            # Form with real-time validation & live official preview card (260 lines)
│   └── branch-table.tsx           # Directory table with HO badges, tel link, and copy feedback (214 lines)
├── lib/query-keys.ts              # queryKeys.branches (all, list, detail)
└── messages/
    ├── en.json                    # 64 English localization keys under 'branches'
    └── ta.json                    # 64 Tamil localization keys under 'branches' (100% dictionary parity)
```

---

## 4. Invariant Architectural Guardrails Enforced

1. **Guardrail 1 / ADR-01 (Single Company)**: Payloads and schemas omit `company_id`.
2. **ADR-02 (Branch Scope)**: `PRD` (Head Office) serves as default anchor with multi-branch capability.
3. **Super Admin Exclusivity**: Accessing `/branches/new` or calling `POST /api/v1/branches` without `SUPER_ADMIN` role renders a prominent access denied alert.
4. **Code Uppercase Normalization**: Input code is sanitized and converted to uppercase alphanumeric (e.g., `ERD`). Duplicate codes return clean 409 Conflict alerts.
5. **ADR-18 Phone Regex**: Strictly requires 10-digit Indian mobile number (`^[6-9]\d{9}$`).
6. **Bilingual Typography**: Form and table support both English and Tamil names across all views.
7. **File Sizing Discipline**: All source files strictly $\le 200\text{--}280$ lines per AGENTS.md Rule 4.

---

## 5. Automated Test Coverage

Verified with 8 unit tests in `apps/web/test/branch-management.spec.ts` (208/208 web suite tests passing):
- Single-company zero `company_id` assertion.
- Default HO and search/filter logic.
- Super Admin role restriction and rejection of unauthorized roles.
- Code uppercase normalization and 409 duplicate handling.
- ADR-18 10-digit Indian phone validation.
- Mandatory English name & optional Tamil name rendering.
- Address non-empty integrity.
- 100% bilingual dictionary parity between `en.json` and `ta.json`.
