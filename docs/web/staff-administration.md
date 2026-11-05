# Staff User Administration & RBAC Roles (`/users`, `/users/new`)

> **Product**: **Kumaran Chits** (Official Operations Software for **Kumaran Finance**)  
> **Phase**: Phase 9 — Staff Administration, Branches & Operations Control  
> **Task**: Task 9.2 — Staff User Administration & RBAC Roles  
> **Routes**: `/users` (Staff Directory, Filters, Actions) & `/users/new` (Staff Onboarding)  
> **Authority**: Directory viewing allowed for Super Admin, Branch Manager, Auditor; All mutations (`POST`, `PATCH`, `reset-password`) strictly restricted to `SUPER_ADMIN` (Partners)

---

## 1. Architectural & Operating Context

Kumaran Finance operates from 1 physical branch in Perundurai, managed by **4 equal partners** and **2 to 3 field collection agents**.

Per **ADR-18** (Phone-Only Identity) and the **Permissions Matrix**:
- **Total Elimination of Email**: The `email` column is permanently absent from the database schema, JWT claims, API DTOs, and UI forms. All staff authenticate and are referenced exclusively via **10-digit Indian mobile numbers** (`^[6-9]\d{9}$`).
- **Direct Partner Management (`SUPER_ADMIN`)**: Kumaran Finance does not hire an external general manager. The 4 partners hold the `SUPER_ADMIN` role and directly oversee auctions, staff onboarding, cash handovers, reversals, and password resets.
- **Dual-Role Staff (`[COLLECTION_AGENT, ACCOUNTANT]`)**: Field collection agents also perform desk accountant duties (maintaining day books, preparing vouchers, reconciling receipts). The system allows assigning multi-role personas to a single staff profile.
- **Self-Protection Safety Guards**:
  - Super Admins **cannot deactivate their own active account** (`id === currentUserId && !isActive`).
  - Super Admins **cannot revoke their own Super Admin privileges** (`id === currentUserId && !roles.includes(SUPER_ADMIN)`).
- **Atomic Session Termination**: Deactivating an account or resetting a password immediately clears `refreshTokenHash` in PostgreSQL, terminating all active browser and mobile sessions instantly.

---

## 2. API Endpoints & Contracts

| Method | Endpoint | Allowed Roles | Request Payload | Response | Error Codes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`GET`** | `/api/v1/users` | `SUPER_ADMIN`, `BRANCH_MANAGER`, `AUDITOR` | Query: `search?`, `role?`, `branchId?`, `isActive?`, `page?`, `limit?` | Paginated Envelope: `{ data: UserResponseDto[], total, page, limit, totalPages }` | `401 Unauthorized` |
| **`GET`** | `/api/v1/users/:id` | `SUPER_ADMIN`, `BRANCH_MANAGER`, `AUDITOR` | Path: `id: string` | `UserResponseDto` (with `branch` summary) | `404 Not Found` |
| **`POST`** | `/api/v1/users` | `SUPER_ADMIN` only | Body: `CreateUserDto` (`name`, `phone`, `roles`, `branchId?`, `password?`) | `201 Created` (`UserResponseDto`) | `400 Bad Request`, `403 Forbidden`, `409 Conflict` (Duplicate phone) |
| **`PATCH`** | `/api/v1/users/:id/status` | `SUPER_ADMIN` only | Path: `id: string`<br>Body: `UpdateUserStatusDto` (`isActive: boolean`) | `200 OK` (`UserResponseDto`) | `400 Bad Request` (Self-deactivation blocked), `404 Not Found` |
| **`PATCH`** | `/api/v1/users/:id/roles` | `SUPER_ADMIN` only | Path: `id: string`<br>Body: `UpdateUserRolesDto` (`roles: Role[]`) | `200 OK` (`UserResponseDto`) | `400 Bad Request` (Self Super Admin revocation blocked), `404 Not Found` |
| **`POST`** | `/api/v1/users/:id/reset-password` | `SUPER_ADMIN` only | Path: `id: string`<br>Body: `ResetPasswordDto` (`temporaryPassword?`) | `200 OK` (`ResetPasswordResponseDto`: `{ success, message, temporaryPassword }`) | `404 Not Found` |

---

## 3. Web UI Architecture

```
apps/web/src/
├── app/(dashboard)/
│   ├── users/
│   │   ├── page.tsx               # Master directory route with 4 KPI cards, filters, and pagination (275 lines)
│   │   └── new/
│   │       └── page.tsx           # Staff onboarding route with Super Admin RBAC gate (73 lines)
├── components/users/
│   ├── user-table.tsx             # Staff directory table, role badges, 2FA/MPIN indicators (298 lines)
│   ├── user-form.tsx              # Onboarding form with phone regex, role multi-select & preview (298 lines)
│   └── user-action-dialogs.tsx    # Edit roles, emergency reset password, status toggle dialogs (275 lines)
├── lib/query-keys.ts              # queryKeys.users (all, list, detail)
└── messages/
    ├── en.json                    # 109 English localization keys under 'users'
    └── ta.json                    # 109 Tamil localization keys under 'users' (100% dictionary parity)
```

---

## 4. Invariant Architectural Guardrails Enforced

1. **ADR-18 Phone-Only Identity**: Strictly requires 10-digit Indian phone (`^[6-9]\d{9}$`). Email is 100% eliminated.
2. **Super Admin Exclusivity**: Staff creation, status change, role mutation, and password reset are strictly restricted to `SUPER_ADMIN`.
3. **Dual-Role Persona Support**: Fully enables multi-role assignments like `[COLLECTION_AGENT, ACCOUNTANT]`.
4. **Self-Protection Deactivation Guard**: Blocks Super Admins from deactivating their own active account.
5. **Self-Privilege Revocation Guard**: Blocks Super Admins from revoking their own Super Admin privileges.
6. **Session Invalidation**: Atomic clearing of `refreshTokenHash` on deactivation and password reset.
7. **Primary Branch Resolution**: Defaults to Head Office `PRD` if branch is omitted.
8. **File Sizing Discipline**: All source files strictly $\le 200\text{--}300$ lines per AGENTS.md Rule 4.

---

## 5. Automated Test Coverage

Verified with 8 unit tests in `apps/web/test/staff-administration.spec.ts` (216/216 web suite tests passing):
- 10-digit Indian phone regex check and elimination of email field.
- Super Admin exclusive mutation gate and rejection of unauthorized roles.
- Multi-role staff profile support (Field Agent + Desk Accountant).
- Self-protection deactivation guard rejection.
- Self-privilege Super Admin revocation guard rejection.
- Emergency password reset and refresh token purging.
- Primary branch defaulting to Head Office `PRD`.
- 100% bilingual dictionary parity between `en.json` and `ta.json`.
