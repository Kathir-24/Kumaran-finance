# Staff User Administration & RBAC Module

> **Module**: `apps/api/src/user/`  
> **Company**: **Kumaran Finance** (Perundurai, Erode, Tamil Nadu)  
> **Guiding ADRs**: [ADR-01, ADR-02, ADR-10 (Maker-Checker)](../../../docs/01-business/decision-log.md)

---

## 1. Overview & Business Rules

The **User Module** manages internal staff accounts and RBAC role assignments:
1. **Dynamic $N$ Staff per Persona**: Accommodates the 4 equal partners, field agents, accountants, and future hires without static headcounts.
2. **Multi-Role Assignment**: Staff can hold multiple operational personas simultaneously (e.g. `[COLLECTION_AGENT, ACCOUNTANT]`).
3. **Session Revocation on Deactivation**: Deactivating a staff account (`PATCH /users/:id/status`) automatically wipes `refreshTokenHash` to invalidate all active JWT sessions immediately.
4. **Self-Revocation Guard**: Super Admins are prevented from revoking their own `SUPER_ADMIN` role or deactivating their own account to avoid lockout.

---

## 2. Endpoint Catalog

| Method | Endpoint | Description | Allowed Personas |
|---|---|---|---|
| `GET`  | `/api/v1/users` | Paginated staff directory (`search`, `role`, `branchId`, `isActive`) | `SUPER_ADMIN`, `BRANCH_MANAGER`, `AUDITOR` |
| `GET`  | `/api/v1/users/:id` | Get staff user profile by ID | `SUPER_ADMIN`, `BRANCH_MANAGER`, `AUDITOR` |
| `POST` | `/api/v1/users` | Create staff user with branch link & password | `SUPER_ADMIN` |
| `PATCH`| `/api/v1/users/:id/status` | Activate/deactivate staff account | `SUPER_ADMIN` |
| `PATCH`| `/api/v1/users/:id/roles` | Update assigned staff RBAC roles | `SUPER_ADMIN` |
| `POST` | `/api/v1/users/:id/reset-password` | Reset staff credentials & revoke active sessions | `SUPER_ADMIN` |

---

## 3. Testing & Verification

Automated unit tests covering user creation, phone uniqueness, multi-role validation, branch scoping, and deactivation safeguards:

```bash
pnpm --filter api test -- test/user.spec.ts
```
