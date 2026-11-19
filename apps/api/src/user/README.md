# Staff User Administration & RBAC Module

> **Module**: `apps/api/src/user/`  
> **Company**: **Kumaran Finance** (Perundurai, Erode, Tamil Nadu)  
> **Guiding ADRs**: [ADR-01, ADR-02, ADR-10, ADR-18 (Phone-Only Identity), ADR-21 (Verified Partner Identity), ADR-24 (Session Vault)](../../../../docs/01-business/decision-log.md)

---

## 1. Overview & Security Rules

The **User Module** manages internal staff accounts, RBAC role assignments, and Verified Partner governance:

1. **Dynamic Staff Hierarchy & Phone-Only Identity (`ADR-18`)**:
   - Accommodates the 4 equal statutory partners, branch managers, desk accountants, field collection agents, and CA auditors without static headcounts.
   - Enforces strict 10-digit Indian mobile syntax (`REGEX_INDIAN_PHONE = /^[6-9]\d{9}$/`); email authentication is 100% eliminated.
   - Defaults branch assignment to Head Office (`PRD`) when omitted and fails closed if an explicit `branchId` does not exist (`F16`).
2. **Strict Staff Role Allowlist (`STAFF_ROLES`)**:
   - Both `CreateUserDto` and `UpdateUserRolesDto` enforce `@IsIn(STAFF_ROLES)` (`SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, `COLLECTION_AGENT`, `AUDITOR`), supporting multi-role staff profiles (e.g., `[COLLECTION_AGENT, ACCOUNTANT]`) while strictly rejecting `Role.CUSTOMER` so staff records never break dual-profile `GET /api/v1/auth/me` lookups.
3. **Verified Partner Identity Governance (`ADR-21`, `ADR-27` / Guardrail 11 / `SEC-A`)**:
   - `Role.PARTNER` and `Role.SUPER_ADMIN` are mutually exclusive first-class roles. Assigning both roles to the same user account is strictly blocked (`BadRequestException`).
   - Statutory business partners hold first-class `Role.PARTNER` (authorized for financial Maker–Checker mutations), while Administrative IT Super Admins hold `Role.SUPER_ADMIN` (managing infrastructure and barred from financial mutations).
   - Legacy `isPartner` boolean column and DTO flags have been completely eliminated.
4. **Layer 2 Anti-BOLA Branch Scoping**:
   - `GET /api/v1/users` and `GET /api/v1/users/:id` inspect `@CurrentUser()`: `BRANCH_MANAGER` callers are strictly scoped to their own `currentUser.branchId`, and explicit cross-branch `branchId` queries fail closed with `403 Forbidden`.
   - All responses strip sensitive credential hashes (`passwordHash`, `mpinHash`, `totpSecret`, `refreshTokenHash`).
5. **Self-Protection & Atomic Session Revocation (`ADR-24` / `F02`, `F03`)**:
   - Super Admins cannot deactivate their own account (`PATCH /users/:id/status`) or revoke their own `SUPER_ADMIN` role (`PATCH /users/:id/roles`).
   - Deactivation, role changes, and emergency password resets (`POST /users/:id/reset-password`, setting `mustChangePassword: true`) atomically clear PostgreSQL `Session` vault records, purge Redis `auth:session:*` and `user:status:*` caches, and persist the 7-day `tokenRevokedBefore` cutoff.

---

## 2. Endpoint Catalog (`UserController` — 6 Live Routes)

All 6 routes are served by `apps/api/src/user/user.controller.ts`:

| Method | Endpoint | Description | Allowed Personas |
|---|---|---|---|
| `GET` | `/api/v1/users` | Paginated staff directory (`search`, `role`, `branchId`, `isActive`); branch-scoped for `BRANCH_MANAGER` | `SUPER_ADMIN`, `BRANCH_MANAGER` *(own branch)*, `AUDITOR` |
| `GET` | `/api/v1/users/:id` | Get staff user profile (sensitive hashes stripped; branch-scoped for `BRANCH_MANAGER`) | `SUPER_ADMIN`, `BRANCH_MANAGER` *(own branch)*, `AUDITOR` |
| `POST` | `/api/v1/users` | Create staff account (`STAFF_ROLES` only; `SUPER_ADMIN` and `PARTNER` mutually exclusive) | `SUPER_ADMIN` |
| `PATCH` | `/api/v1/users/:id/status` | Activate/deactivate staff account with self-lockout guard & atomic session revocation | `SUPER_ADMIN` |
| `PATCH` | `/api/v1/users/:id/roles` | Update staff `STAFF_ROLES` (mutual exclusivity & self-demotion guards) | `SUPER_ADMIN` |
| `POST` | `/api/v1/users/:id/reset-password` | Emergency staff password reset (`mustChangePassword: true`) & immediate session revocation | `SUPER_ADMIN` |

---

## 3. Testing & Verification

Verified by **18 automated Jest unit tests** in `apps/api/test/unit/user.spec.ts` covering paginated hash stripping, `BRANCH_MANAGER` Layer 2 branch scoping & cross-branch `403`, `STAFF_ROLES` rejection of `Role.CUSTOMER`, `Role.SUPER_ADMIN` and `Role.PARTNER` mutual exclusivity, deactivation session clearance, and self-lockout safeguards:

```bash
pnpm --filter api test -- test/unit/user.spec.ts
```
