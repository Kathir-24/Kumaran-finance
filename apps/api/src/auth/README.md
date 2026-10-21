# Auth & Staff Identity Module

> **Module**: `apps/api/src/auth/`  
> **Company**: **Kumaran Finance** (Perundurai, Erode, Tamil Nadu)  
> **Guiding ADRs**: [ADR-01, ADR-02, ADR-10, ADR-17](../../../docs/01-business/decision-log.md)

---

## 1. Overview & Capabilities

The **Auth Module** provides multi-factor authentication, session management, and role-based access control (RBAC) engineered for the 6 personas operating Kumaran Chits:

1. **Web Portal Dual-Factor Login**: Phone number + bcrypt password (salt 12) followed by RFC 6238 TOTP (Time-Based One-Time Password) using Microsoft Authenticator or Google Authenticator.
2. **Mobile Quick Unlock**: 6-digit MPIN authentication for Field Collection Agents and Partners on the Android mobile app.
3. **Session Management & Token Lifecycle**:
   - Short-lived JWT Access Token (15-minute validity).
   - Long-lived JWT Refresh Token (7-day validity) with bcrypt hash persisted in `User.refreshTokenHash`.
   - Complete session revocation on `POST /auth/logout`.
4. **Device FCM Push Token Lifecycle**:
   - `PATCH /auth/fcm-token`: Authenticated staff register their active Firebase Cloud Messaging (FCM) device token upon mobile app startup.
   - **Cross-Device Security**: Calling `POST /auth/logout` automatically clears `fcmToken = null` on the user's database record to prevent sensitive Maker-Checker approval alerts from reaching a signed-out phone.

---

## 2. Endpoint Catalog

| Method | Endpoint | Description | Allowed Personas |
|---|---|---|---|
| `POST` | `/api/v1/auth/web/login` | Office credentials login (Step 1) | Public |
| `POST` | `/api/v1/auth/web/verify-totp` | Verify 6-digit TOTP code (Step 2) | Public |
| `POST` | `/api/v1/auth/mobile/login-mpin`| Mobile quick unlock with 6-digit MPIN | Public |
| `POST` | `/api/v1/auth/refresh-token` | Rotate access & refresh tokens | Public |
| `POST` | `/api/v1/auth/logout` | Revoke session & clear `fcmToken` | Authenticated |
| `GET`  | `/api/v1/auth/me` | Fetch authenticated profile & roles | Authenticated |
| `PATCH`| `/api/v1/auth/fcm-token` | Register or update device FCM token | Authenticated Staff |
| `POST` | `/api/v1/auth/totp/setup` | Generate Base32 TOTP secret & QR code | Authenticated |
| `POST` | `/api/v1/auth/totp/enable` | Verify OTP and lock 2FA requirement | Authenticated |
| `POST` | `/api/v1/auth/totp/disable`| Disable 2FA with password confirmation | Authenticated |
| `POST` | `/api/v1/auth/mobile/set-mpin` | Establish or update 6-digit MPIN | Authenticated |

---

## 3. Testing & Verification

Unit tests covering TOTP, MPIN, refresh rotation, logout token clearance, RolesGuard multi-role authorization, and FCM token registration:

```bash
pnpm --filter api test -- test/auth.spec.ts
```
