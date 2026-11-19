# SECURITY AUDIT & RBAC ACCESS GUARDIANS — KUMARAN CHITS
**Kumaran Finance — Perundurai Head Office, Erode District, Tamil Nadu**  
**Audit Stage**: Independent Verification & Security Architecture Audit  
**Date**: November 2026  
**Auditor**: Antigravity Senior Engineering & Audit Swarm  

---

## 1. Security Architecture Overview

Kumaran Chits employs a defense-in-depth security model designed specifically for financial operations:
- **Authentication**: JWT-based session architecture with 15-minute access tokens and 7-day HttpOnly refresh tokens.
- **Session Fast-Path**: Redis-backed session status cache (120-second TTL) enabling instant deactivation of compromised credentials without waiting for JWT expiry.
- **Role-Based Access Control (RBAC)**: Strict role guards across all API routes and Next.js frontend pages.
- **Anti-BOLA / IDOR Guardians**: Automated resource ownership and branch-scoping checks preventing horizontal and vertical privilege escalation.
- **Partner Identity Separation (SEC-A)**: Administrative IT privileges separated from verified business partner ownership.

---

## 2. RBAC Persona Matrix & Privilege Boundaries

| Role | Business Persona | Scope & Allowed Operations | Prohibited Actions |
|---|---|---|---|
| **PARTNER** | 4 Business Partners | Full company control, financial authorizations, payment reversals, auction finalizations, prize disbursements, defaulter removals. | Self-approval (`maker != checker`), bypassing audit log, background queue management. |
| **SUPER_ADMIN** | IT Administrator / System Admin | User onboarding, branch infrastructure maintenance, audit log viewing, background queue inspection. | Authorizing payouts, approving reversals, committing auctions, removing defaulters, financial dashboard. |
| **BRANCH_MANAGER** | Branch Head (Perundurai) | Branch staff supervision, customer onboarding, scheme viewing, auction conducting, physical handover supervision. | Finalizing auctions, authorizing prize payouts, approving reversals, system audit logs. |
| **ACCOUNTANT** | Desk Accountant / Cashier | Counter cash receipt entry, UPI claim verification, cash handover acknowledgment, safety proof verification. | Payout authorization, payment reversal approval, auction finalization, system audit logs. |
| **COLLECTION_AGENT** | Field Route Agent | Doorstep cash collection, collection batch submission, view assigned route customers. | Approving cash handover, modifying dues, viewing company financial reports, system audit logs. |
| **AUDITOR** | Independent CA Auditor | Read-only access to general ledger, Form XXII cash book, Form XXI subscriber ledgers, daybook, trial balance, and auction minutes. | All write mutations (`POST`, `PUT`, `PATCH`, `DELETE`), internal system audit logs, and background queues. |
| **CUSTOMER** | Chit Subscriber | View own enrolled tickets, payment passbook, auction schedule, submit UPI payment claim. | Viewing other subscribers, viewing company ledgers, accessing staff endpoints. |

---

## 3. Anti-BOLA / Anti-IDOR Guardians

Broken Object Level Authorization (BOLA) and Insecure Direct Object References (IDOR) are strictly mitigated:

1. **Customer Self-Scoping**:
   - Customer endpoints (`GET /customers/:id`, `GET /tickets/:id`, `GET /payments/receipt/:id`) validate `req.user.customerId === resource.customerId` when role is `CUSTOMER`.
   - Any attempt by Customer A to query Customer B's passbook or receipts yields `403 Forbidden` or `404 Not Found`.

2. **Branch Scoping**:
   - Operational staff (`ACCOUNTANT`, `COLLECTION_AGENT`, `BRANCH_MANAGER`) are bound to their assigned `branchId`.
   - Cross-branch access is strictly barred unless the user possesses global `SUPER_ADMIN` or `AUDITOR` permissions.

3. **Receipt & Document Tamper-Proofing**:
   - PDF receipts are signed and delivered via 15-minute short-lived presigned URLs or direct byte streaming.
   - Cancelled receipts dynamically render red watermarks (`CANCELLED / ரத்து செய்யப்பட்டது`).

---

## 4. Token Lifecycle & Session Management

- **Access Token**: HMAC SHA-256 JWT, 15-minute expiration, contains `sub`, `phone`, `roles`, `branchId`.
- **Refresh Token**: Cryptographically secure 256-bit random string hashed with SHA-256 in PostgreSQL (`refreshTokenHash`); transmitted exclusively via `HttpOnly`, `SameSite=Strict`, `Secure` cookie.
- **Fast-Path Redis Revocation**:
  - Every authenticated request checks Redis key `auth:user:status:{userId}` (120s TTL).
  - Deactivating a user or resetting passwords immediately purges the Redis key and sets `isActive: false`, invalidating active sessions within $\le 1$ turn.
- **Client-Scoped Session Families**:
  - Refreshing tokens rotates the refresh token within the device session family.
  - Cross-device logout is supported via explicit "Log Out All Devices" which increments `tokenVersion` in PostgreSQL.

---

## 5. Security Test Suite Execution Evidence

| Test Suite | File Path | Invariants Tested | Result |
|---|---|---|---|
| Authentication Core | `test/unit/auth.spec.ts` | Login, OTP generation, fast-path Redis status, inactive user block | **PASS** (100%) |
| Token Lifecycle | `test/unit/auth-token-lifecycle.spec.ts` | Refresh token rotation, multi-device session family, cookie security | **PASS** (100%) |
| Live Redis Auth | `test/unit/auth-redis-live.spec.ts` | Redis connection drop resilience, TTL expiry, fallback to DB | **PASS** (100%) |
| API Resilience & IDOR | `test/unit/api-resilience.spec.ts` | Anti-BOLA guardians, cross-tenant isolation, role permission gates | **PASS** (100%) |
| Web RBAC Guardians | `apps/web/test/rbac-navigation.spec.ts` | Route guards, menu isolation, inactive tab synchronization | **PASS** (100%) |
