# Staff User Administration & RBAC Roles (`/users`, `/users/new`)

> **Product**: **Kumaran Chits** (Official Operations Software for **Kumaran Finance**)  
> **Phase**: Phase 9 — Staff Administration, Branches & Operations Control  
> **Task**: Task 9.2 — Staff User Administration & RBAC Roles  
> **Routes**: `/users` (Staff Directory, Filters, Actions) & `/users/new` (Staff Onboarding)  
> **Authority**: Web routes `/users` & `/users/new` are strictly restricted to **`SUPER_ADMIN`** (`apps/web/src/lib/route-permissions.ts`); backend read APIs `GET /api/v1/users*` allow `SUPER_ADMIN`, `BRANCH_MANAGER`, and `AUDITOR`, while all mutations (`POST`, `PATCH`, `reset-password`) are strictly `SUPER_ADMIN` only (creating or assigning first-class `Role.PARTNER` per Guardrail 11 / `ADR-27` with zero nested boolean flags or checkboxes)

---

## 1. Architectural & Operating Context

Kumaran Finance operates from 1 physical branch in Perundurai, managed by **4 equal partners** and **2 to 3 field collection agents**.

Per **ADR-18** (Phone-Only Identity), **ADR-21 / Guardrail 11** (Verified Partner Identity), and **ADR-24** (Multi-Device Session Vault):
- **Total Elimination of Email**: The `email` column is permanently absent from the database schema, JWT claims, API DTOs, and UI forms. All staff authenticate and are referenced exclusively via **10-digit Indian mobile numbers** (`^[6-9]\d{9}$`).
- **Verified Partner Identity vs. IT Super Admin (`Guardrail 11` / `ADR-27` / `SEC-A`)**: `SUPER_ADMIN` and `PARTNER` are two strictly separate first-class roles. The legacy `isPartner` boolean column and nested checkbox flags have been completely eliminated. The 4 statutory equity partners hold `Role.PARTNER` directly as their first-class role, giving them exclusive financial Maker/Checker authority (reversals, auction finalization, prize authorization, defaulter removal). Administrative IT `SUPER_ADMIN` accounts manage staff onboarding (`/users/new`), branch infrastructure, and inspect audit logs/queues, but are strictly barred from financial authorizations and chit operations. In `/users/new` and `/users`, role assignment is purely role-based with zero nested boolean checkboxes.
- **Zero Shared Default Passwords (`F16`)**: When `password` is omitted during staff creation (`POST /api/v1/users`), `UserService` generates a 12-character cryptographic random temporary password (`crypto.randomBytes(9).toString('base64url')`) and sets `mustChangePassword: true`, restricting first login exclusively to `/onboarding`.
- **Dual-Role Staff (`[COLLECTION_AGENT, ACCOUNTANT]`)**: Field collection agents may also hold desk accountant privileges while preserving anti-self-acknowledgment guards on cash handovers (`collector_user_id != acknowledger_user_id`).
- **Self-Protection Safety Guards**:
  - Super Admins **cannot deactivate their own active account** (`id === currentUserId && !isActive`).
  - Super Admins **cannot revoke their own Super Admin privileges** (`id === currentUserId && !roles.includes(SUPER_ADMIN)`).
- **Atomic Multi-Device Session Termination (`ADR-24`)**: Deactivating an account, mutating roles, or resetting a password immediately revokes all PostgreSQL `Session` vault rows (`revokedAt = now`), clears legacy `refreshTokenHash`, stamps durable `tokenRevokedBefore = new Date()`, and evicts `user:status:*` Redis cache keys, terminating all active web and mobile sessions instantly with zero resurrection across Redis restarts.

---

## 2. API Endpoints & Contracts

| Method | Endpoint | Allowed Roles | Request Payload | Response | Error Codes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`GET`** | `/api/v1/users` | `SUPER_ADMIN`, `BRANCH_MANAGER`, `AUDITOR` | Query: `search?`, `role?`, `branchId?`, `isActive?`, `page?`, `limit?` | Paginated Envelope: `{ data: UserResponseDto[], total, page, limit, totalPages }` | `401 Unauthorized` |
| **`GET`** | `/api/v1/users/:id` | `SUPER_ADMIN`, `BRANCH_MANAGER`, `AUDITOR` | Path: `id: string` | `UserResponseDto` (with `branch` summary) | `404 Not Found` |
| **`POST`** | `/api/v1/users` | `SUPER_ADMIN` only | Body: `CreateUserDto` (`name`, `phone`, `roles`, `branchId?`, `password?`) | `201 Created` (`UserResponseDto` + `temporaryPassword` when auto-generated per `F16`) | `400 Bad Request`, `403 Forbidden`, `409 Conflict` (Duplicate phone) |
| **`PATCH`** | `/api/v1/users/:id/status` | `SUPER_ADMIN` only | Path: `id: string`<br>Body: `UpdateUserStatusDto` (`isActive: boolean`) | `200 OK` (`UserResponseDto`) | `400 Bad Request` (Self-deactivation blocked), `404 Not Found` |
| **`PATCH`** | `/api/v1/users/:id/roles` | `SUPER_ADMIN` only | Path: `id: string`<br>Body: `UpdateUserRolesDto` (`roles: Role[]`) | `200 OK` (`UserResponseDto`) | `400 Bad Request` (Self Super Admin revocation blocked), `404 Not Found` |
| **`POST`** | `/api/v1/users/:id/reset-password` | `SUPER_ADMIN` only | Path: `id: string`<br>Body: `ResetPasswordDto` (`temporaryPassword?`) | `200 OK` (`ResetPasswordResponseDto`: `{ success, message, temporaryPassword }`) | `404 Not Found` |

---

## 3. Web UI Architecture

```
apps/web/
├── src/
│   ├── app/(dashboard)/
│   │   └── users/
│   │       ├── page.tsx               # Master directory route with 4 KPI cards, filters, and pagination
│   │       └── new/
│   │           └── page.tsx           # Staff onboarding route with Super Admin RBAC gate
│   ├── components/users/
│   │   ├── user-table.tsx             # Staff directory table, role & Partner badges, 2FA/MPIN indicators
│   │   ├── user-form.tsx              # Onboarding form with phone regex, role multi-select (zero nested boolean checkboxes) & preview
│   │   ├── user-action-dialogs.tsx    # Dialog orchestrator for staff actions
│   │   ├── edit-roles-dialog.tsx      # Modular role-assignment dialog with self-revocation guard
│   │   ├── reset-password-dialog.tsx  # Emergency password reset dialog displaying one-time temp password
│   │   └── toggle-status-dialog.tsx   # Account activation/deactivation confirmation dialog
│   └── lib/query-keys.ts              # queryKeys.users (all, list, detail)
└── messages/
    ├── en.json                        # 119 English localization leaf keys under 'users'
    └── ta.json                        # 119 Tamil localization leaf keys under 'users' (100% dictionary parity)
```

---

## 4. Invariant Architectural Guardrails Enforced

1. **ADR-18 Phone-Only Identity**: Strictly requires 10-digit Indian phone (`^[6-9]\d{9}$`). Email is 100% eliminated.
2. **Guardrail 11 / ADR-27 Verified Partner Identity & Persona Separation**: Strict separation between `Role.PARTNER` (statutory financial authority) and `Role.SUPER_ADMIN` (IT infrastructure only) with zero boolean flags.
3. **Super Admin Exclusivity**: Edge Middleware (`route-permissions.ts`) restricts `/users*` to `SUPER_ADMIN`, and `UserController` restricts all mutations to `Role.SUPER_ADMIN`.
4. **F16 First-Login Onboarding**: Omitting an initial password generates a cryptographic random temporary password (`mustChangePassword: true`), eliminating shared defaults.
5. **Dual-Role Persona Support**: Fully enables multi-role assignments like `[COLLECTION_AGENT, ACCOUNTANT]`.
6. **Self-Protection Guards**: Blocks Super Admins from deactivating their own account or revoking their own `SUPER_ADMIN` role.
7. **Atomic Session Invalidation (`ADR-24`)**: Revokes all `Session` vault rows, stamps `tokenRevokedBefore`, and evicts `user:status:*` Redis keys on deactivation, role change, or password reset.
8. **Primary Branch Resolution**: Defaults to Head Office `PRD` if branch is omitted.

---

## 5. Automated Test Coverage

Verified in `apps/web/test/staff-administration.spec.ts` as part of the full verified Web suite (**376/376 passing tests across 52 spec files / 14 suites** via `pnpm --filter web test`):
- 10-digit Indian phone regex check and elimination of email field.
- Super Admin exclusive mutation gate and rejection of unauthorized roles.
- Multi-role staff profile support (Field Agent + Desk Accountant).
- Self-protection deactivation guard rejection.
- Self-privilege Super Admin revocation guard rejection.
- Emergency password reset and multi-device session revocation.
- Primary branch defaulting to Head Office `PRD`.
- 100% bilingual dictionary parity between `en.json` and `ta.json` (`119` `'users'` keys).
