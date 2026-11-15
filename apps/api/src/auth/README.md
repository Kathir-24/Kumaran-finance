# Auth & Staff Identity Module

> **Module**: `apps/api/src/auth/`  
> **Company**: **Kumaran Finance** (Perundurai, Erode, Tamil Nadu)  
> **Guiding ADRs**: [ADR-01, ADR-02, ADR-10, ADR-17](../../../../docs/01-business/decision-log.md)

---

## 1. Overview & Capabilities

The **Auth Module** provides multi-factor authentication, session management, and role-based access control (RBAC) engineered for the 6 personas operating Kumaran Chits:

1. **Web Portal Dual-Factor Login**: Phone number + bcrypt password (salt 12) followed by RFC 6238 TOTP (Time-Based One-Time Password) using Microsoft Authenticator or Google Authenticator.
2. **Mobile Quick Unlock & MPIN Lifecycle (F01)**:
   - 6-digit MPIN authentication for Field Collection Agents and Partners on the Android mobile app.
   - Enforces TOTP validation on MPIN login (`loginMpin`) when `isTotpEnabled = true`, returning `requiresTotp: true` with a scoped challenge token.
   - MPIN establishment (`POST /auth/mobile/set-mpin`) strictly requires `JwtAuthGuard` or a verified, single-use `setupToken` with active user checks.
3. **Distributed Redis-Backed SMS OTP Engine (F13 Hardened)**:
   - 6-digit cryptographic OTP generation delivered strictly via Indian Telecom DLT SMS (`Msg91SmsDriver` / `MockSmsDriver`).
   - Stored in Redis under `auth:otp:<phone>` with a 300-second (5-minute) TTL (`EX 300`).
   - SHA-256 hashed comparison to prevent timing attacks.
   - **Atomic Verification via Redis Lua Script (F13)**: Executes lockout check, expiry check, hash comparison, attempt increment, 3-attempt lockout penalty setting (`auth:otp:lockout:<phone>`, 300s TTL), and session deletion in 1 single atomic Redis Lua execution, completely eliminating race conditions.
   - Resilient in-memory fallback if Redis is temporarily offline during testing or maintenance.
4. **Session Management & Token Vault Lifecycle (Phase 1 / F02, F03, F04)**:
   - Dedicated PostgreSQL `Session` table providing client-family isolation (`WEB`, `MOBILE`, `DESKTOP`).
   - Short-lived JWT Access Token (15-minute validity) bound to a cryptographic session UUID (`sid`).
   - Long-lived JWT Refresh Token (7-day validity) with bcrypt hash persisted in the client-family's `Session` record.
   - Password reset (`POST /auth/reset-password` / `change-password`) atomically clears all database session records, deletes Redis session caches (`auth:session:${userId}:*`), and sets an authoritative 7-day revocation cutoff (`auth:revoked:${userId}` and `User.tokenRevokedBefore`) (F02).
   - Dynamic role changes revoke active sessions or assert cached auth version to prevent privilege desynchronization (F03).
   - Complete scoped or global session revocation on `POST /auth/logout` with 7-day cutoff persistence (F04).
5. **Staff Onboarding & Security Factor Replacement (F10, F16)**:
   - Mandatory first-login password onboarding (`mustChangePassword: true`) with single-use atomic token consumption.
   - Factor replacement (`POST /auth/totp/enable` when already enrolled) requires current password verification, executes atomic Lua compare-and-delete challenge claims, and revokes prior sessions (F10).
   - User creation strictly validates branch existence and fails-closed against missing or unassigned branch IDs (F16).
5. **Device FCM Push Token Lifecycle**:
   - `PATCH /auth/fcm-token`: Authenticated staff register their active Firebase Cloud Messaging (FCM) device token upon mobile app startup.
   - **Cross-Device Security**: Calling `POST /auth/logout` automatically clears `fcmToken = null` on the user's database record to prevent sensitive Maker-Checker approval alerts from reaching a signed-out phone.

---

## 2. Endpoint Catalog

| Method | Endpoint | Description | Allowed Personas |
|---|---|---|---|
| `POST` | `/api/v1/auth/web/login` | Office credentials login (Step 1) | Public |
| `POST` | `/api/v1/auth/web/verify-totp` | Verify 6-digit TOTP code (Step 2) | Public |
| `POST` | `/api/v1/auth/mobile/request-otp` | Request 6-digit SMS OTP for mobile onboarding/login | Public (Throttled) |
| `POST` | `/api/v1/auth/mobile/verify-otp` | Verify 6-digit SMS OTP; returns setupToken or session | Public (Throttled) |
| `POST` | `/api/v1/auth/mobile/login-mpin`| Mobile quick unlock with 6-digit MPIN | Public |
| `POST` | `/api/v1/auth/refresh-token` | Rotate access & refresh tokens | Public |
| `POST` | `/api/v1/auth/logout` | Revoke session & clear `fcmToken` | Authenticated |
| `GET`  | `/api/v1/auth/me` | Fetch authenticated profile & roles (Dual Staff & Customer Support) | Authenticated |
| `POST` | `/api/v1/auth/change-password` | Self-service password change with current password verification | Authenticated Staff |
| `PATCH`| `/api/v1/auth/fcm-token` | Register or update device FCM token | Authenticated Staff |
| `POST` | `/api/v1/auth/totp/setup` | Generate Base32 TOTP secret & QR code | Authenticated |
| `POST` | `/api/v1/auth/totp/enable` | Verify OTP and lock 2FA requirement | Authenticated |
| `POST` | `/api/v1/auth/totp/disable`| Disable 2FA with password confirmation | Authenticated |
| `POST` | `/api/v1/auth/mobile/set-mpin` | Establish 6-digit MPIN (setupToken or session) | Setup Token / Auth Staff |

---

## 3. Testing & Verification

Automated test suite (`test/auth.spec.ts` — 25 passing tests) verifying TOTP generation & validation, MPIN setup & unlock, refresh token rotation, logout token clearance, RolesGuard multi-role authorization, FCM token registration, Redis OTP storage with TTL expiry, 3-attempt brute-force lockout, and graceful offline fallback:

```bash
pnpm --filter api test -- test/auth.spec.ts
```
