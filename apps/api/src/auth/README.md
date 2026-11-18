# Auth & Staff Identity Module

> **Module**: `apps/api/src/auth/`  
> **Company**: **Kumaran Finance** (Perundurai, Erode, Tamil Nadu)  
> **Guiding ADRs**: [ADR-01, ADR-02, ADR-10, ADR-12, ADR-17, ADR-18, ADR-20, ADR-21, ADR-24](../../../../docs/01-business/decision-log.md)

---

## 1. Overview & Security Capabilities

The **Auth Module** provides multi-factor authentication, client-scoped session governance, and role-based access control (RBAC) across the 6 personas operating Kumaran Chits:

1. **Web Portal Dual-Factor Login (`ADR-18` / `ADR-20`)**:
   - Phone-only identifier (`10-digit Indian mobile`, zero email login) + bcrypt-12 password hash followed by RFC 6238 TOTP (Microsoft Authenticator / Google Authenticator).
   - Web browsers authenticate through the Next.js BFF (`/api/auth/*`), storing JWTs exclusively in `HttpOnly`, `SameSite=Lax` cookies.
   - JWT payloads embed `isPartner` (`boolean`) alongside `roles[]` and `branchId` so Guardrail 11 (`ADR-21`) strictly separates Verified Partner financial authority (`isPartner: true`) from Administrative IT Super Admins (`isPartner: false`).
2. **Mobile Quick Unlock & MPIN Lifecycle (`F01`)**:
   - 6-digit MPIN authentication (bcrypt-12 hashed) for Field Collection Agents and Partners via the Dart Core client SDK (`apps/mobile/lib/core/`).
   - Enforces TOTP validation on MPIN login (`loginMpin`) when `isTotpEnabled = true`, returning `requiresTotp: true` with a scoped challenge token.
   - MPIN establishment (`POST /api/v1/auth/mobile/set-mpin`) strictly requires `JwtAuthGuard` or a verified, single-use `setupToken` with active user checks.
3. **Distributed Redis-Backed SMS OTP Engine (`F13` Hardened)**:
   - 6-digit cryptographic OTP generation delivered strictly via Indian Telecom TRAI DLT SMS (`Msg91SmsDriver` / `MockSmsDriver`; zero WhatsApp per `Q34`).
   - Stored in Redis under `auth:otp:<phone>` with a 300-second (5-minute) TTL (`EX 300`), using SHA-256 hashed comparison to prevent timing attacks.
   - **Atomic Verification via Redis Lua Script (`F13`)**: Executes lockout check, expiry check, hash comparison, attempt increment, 3-attempt lockout penalty setting (`auth:otp:lockout:<phone>`, 300s TTL), and OTP deletion in one atomic Lua execution, eliminating race conditions.
   - Resilient in-memory fallback if Redis is temporarily offline during local dev/testing.
4. **Session Vault, Hashing & Fast-Path Status Cache (`ADR-24` / `F02`, `F03`, `F04`)**:
   - Dedicated PostgreSQL `Session` table providing client-family isolation (`WEB`, `MOBILE`, `DESKTOP`) without cross-device refresh invalidation.
   - Short-lived JWT Access Token (`15m`) bound to a cryptographic session UUID (`sid`).
   - Long-lived JWT Refresh Token (`7d`) protected with **SHA-256 pre-hash + bcrypt** before storage in the `Session` record (preventing bcrypt's 72-byte truncation on long JWTs).
   - **120s Redis User Status Cache**: `JwtStrategy` caches active user status/roles under `user:status:<userId>` (120s TTL) to avoid per-request database hits while immediately invalidating on password reset, role change, deactivation, or logout.
   - Self-service password change (`POST /api/v1/auth/change-password`) and `SUPER_ADMIN` emergency staff reset (`POST /api/v1/users/:id/reset-password`) atomically clear all database `Session` records, purge Redis session/status caches (`auth:session:${userId}:*`), and set an authoritative 7-day revocation cutoff (`auth:revoked:${userId}` and `User.tokenRevokedBefore`) (`F02`).
   - Dynamic role changes revoke active sessions or increment cached auth version to prevent privilege desynchronization (`F03`).
   - Scoped (`?clientType=WEB|MOBILE|DESKTOP`) or global (`?clientType=ALL`) session revocation on `POST /api/v1/auth/logout` with 7-day cutoff persistence (`F04`).
5. **Staff Onboarding & Security Factor Replacement (`F10`, `F16`)**:
   - Mandatory first-login password onboarding (`mustChangePassword: true`) completed atomically via **`POST /api/v1/auth/complete-onboarding`** with single-use token consumption (`F16`).
   - Factor replacement (`POST /api/v1/auth/totp/enable` when already enrolled) requires current `password` verification, executes atomic Lua compare-and-delete challenge claims, and revokes prior sessions (`F10`).
   - User creation strictly validates branch existence and fails-closed against missing or unassigned branch IDs (`F16`).
6. **Device FCM Push Token Lifecycle (`ADR-26`)**:
   - `PATCH /api/v1/auth/fcm-token`: Registers or updates the authenticated user's Firebase Cloud Messaging (FCM) device token *(API is live; Android app FCM push delivery activates in Phase 2 Q2 2027 per `ADR-26`)*.
   - **Cross-Device Security**: Calling `POST /api/v1/auth/logout` automatically clears `fcmToken = null` on the user's database record so sensitive Maker–Checker approval alerts never reach a signed-out handset.

---

## 2. Endpoint Catalog (`AuthController` — 15 Live Routes)

All 15 routes are exposed by `apps/api/src/auth/auth.controller.ts`:

| # | Method | Endpoint | Description | Allowed Personas |
| :-: |---|---|---|---|
| 1 | `POST` | `/api/v1/auth/web/login` | Office phone + password login (Step 1; returns session, onboarding token, or TOTP challenge) | Public |
| 2 | `POST` | `/api/v1/auth/web/verify-totp` | Verify 6-digit RFC 6238 TOTP code (Step 2) | Public |
| 3 | `POST` | `/api/v1/auth/refresh-token` | Rotate access & refresh tokens within the caller's client family | Public |
| 4 | `POST` | `/api/v1/auth/logout` | Revoke session (`?clientType=WEB\|MOBILE\|DESKTOP\|ALL`) & clear `fcmToken` | Authenticated |
| 5 | `PATCH` | `/api/v1/auth/fcm-token` | Register or update device FCM push token (Phase 2 Android push readiness) | Authenticated Staff |
| 6 | `GET` | `/api/v1/auth/me` | Fetch authenticated profile, `roles`, `isPartner`, and branch scope (Staff & Customer) | Authenticated |
| 7 | `POST` | `/api/v1/auth/change-password` | Self-service password change with current password verification & global session revocation | Authenticated Staff |
| 8 | `POST` | `/api/v1/auth/totp/setup` | Generate Base32 TOTP secret & authenticator QR code | Authenticated |
| 9 | `POST` | `/api/v1/auth/totp/enable` | Verify 6-digit TOTP and lock 2FA (`password` required when replacing active TOTP per `F10`) | Authenticated |
| 10 | `POST` | `/api/v1/auth/totp/disable` | Disable 2FA with current password confirmation | Authenticated |
| 11 | `POST` | `/api/v1/auth/mobile/request-otp` | Request 6-digit TRAI DLT SMS OTP (300s Redis TTL) | Public (Throttled) |
| 12 | `POST` | `/api/v1/auth/mobile/verify-otp` | Atomically verify SMS OTP via Redis Lua; returns `setupToken` or session | Public (Throttled) |
| 13 | `POST` | `/api/v1/auth/mobile/login-mpin` | Mobile quick unlock with 6-digit MPIN (enforces TOTP if enabled) | Public |
| 14 | `POST` | `/api/v1/auth/complete-onboarding` | Atomic first-login password setup + onboarding completion (`mustChangePassword` $\to$ `false`, `F16`) | Onboarding Token |
| 15 | `POST` | `/api/v1/auth/mobile/set-mpin` | Establish 6-digit MPIN using single-use `setupToken` or active JWT session | Setup Token / Auth Staff |

---

## 3. Testing & Verification

The Auth module is verified by **54 automated Jest tests** across **3 spec files** under `apps/api/test/unit/`:

| Spec File | Tests | Verified Scope |
|---|:---:|---|
| `apps/api/test/unit/auth.spec.ts` | **28** | TOTP setup/verify/replace (`F10`), MPIN setup/unlock (`F01`), `complete-onboarding` (`F16`), `RolesGuard` & `isPartner` checks, FCM clearance, Redis OTP TTL & 3-attempt lockout (`F13`), offline fallback |
| `apps/api/test/unit/auth-token-lifecycle.spec.ts` | **25** | Multi-client `Session` vault isolation (`WEB`/`MOBILE`/`DESKTOP`), SHA-256+bcrypt refresh rotation, password reset 7-day revocation cutoff (`F02`), role-change invalidation (`F03`), scoped/global logout (`F04`), 120s Redis `user:status:*` cache |
| `apps/api/test/unit/auth-redis-live.spec.ts` | **1** | Live Redis Lua atomic OTP verification & lockout enforcement |

```bash
pnpm --filter api test -- test/unit/auth.spec.ts test/unit/auth-token-lifecycle.spec.ts test/unit/auth-redis-live.spec.ts
```
