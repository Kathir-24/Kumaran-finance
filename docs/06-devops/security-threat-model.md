# Kumaran Chits — Fintech Security Architecture & Threat Model

> **Product**: **Kumaran Chits** (Kumaran Finance)  
> **Framework**: OWASP Top 10 for Financial APIs & STRIDE Threat Modeling  
> **Mandate**: In fintech, security is not a post-launch add-on. Every threat vector must have automated controls built into the code.

---

## 1. Threat Modeling Matrix (STRIDE Analysis)

| Threat Category | Potential Attack Vector in Kumaran Chits | Defense / Mitigation Implemented (Live Code Verified) |
|---|---|---|
| **Spoofing (Identity)** | Attacker guesses staff password/MPIN or steals session tokens. | **Multi-Layer Auth & Session Vault (`F04`)**: Phone-only bcrypt passwords (cost 12) + AES-256-GCM TOTP 2FA on Web (`HttpOnly`, `SameSite=Lax` BFF cookies); 6-digit bcrypt MPIN + 6-digit SMS OTP on Mobile; PostgreSQL `Session` vault with RFC 6819 refresh rotation & reuse revocation; `@Throttle` (`THROTTLE_AUTH_LIMIT = 5 / 15 min`) & **3-attempt** 5-min OTP lockout (`OTP_MAX_VERIFY_ATTEMPTS = 3`). |
| **Tampering (Data)** | Disgruntled staff updates or deletes an audit log or active financial row in the database. | **Engine-Level Immutability & Constraints**: PostgreSQL `ENABLE ALWAYS` triggers (`trg_prevent_audit_log_mutation`, `trg_prevent_audit_log_truncate`) + `REVOKE UPDATE, DELETE, TRUNCATE FROM PUBLIC` protect `"AuditLog"` (`CONCURR-INV-26`); **8 PostgreSQL 17 `CHECK` constraints** enforce `maker <> checker` & monetary guards; `ON DELETE RESTRICT` FKs block financial deletes; only dual-control reversals are permitted. |
| **Repudiation** | Customer or agent claims a cash collection or approval was never made. | **Immutable Audit Log + Digital Receipt**: Every financial mutation writes an append-only `AuditLog` row with `AsyncLocalStorage` resolved client IP (`TRUST_PROXY`), `oldValue`/`newValue` diffs, and collision-proof sequential bilingual receipt (`KC-REC-{BRANCH}-{YYYY}-{XXXXX}`). |
| **Information Disclosure** | Data leak reveals full Aadhaar, PAN, or bank account numbers of subscribers. | **DPDP Act 2023 Minimization & S3 Encryption**: Database stores only last 4 Aadhaar digits (`aadhaarLast4`); full 12-digit inputs are rejected (HTTP 400). Private S3/R2 buckets block all public access with `AES256` SSE and 15-minute presigned URLs (`Cache-Control: private, no-store`). |
| **Denial of Service (DoS)** | Script floods the OTP endpoint or hammers auction/PDF endpoints. | **5-Tier Rate Limiting & OTP Quotas**: Redis OTP **60s cooldown** (`OTP_COOLDOWN_SECONDS = 60`), **max 5 OTPs per rolling 24h** (`OTP_MAX_DAILY_REQUESTS = 5`), **3-attempt 5-min lockout** (`OTP_LOCKOUT_SECONDS = 300`), route-level `@Throttle` (`5/5m` OTP, `5/15m` auth/UPI, `15/m` PDF, `5/m` uploads, `60/m` global), and Nginx edge zones (`3r/s` auth, `30r/s` API). |
| **Elevation of Privilege** | Non-partner admin or field agent calls Partner financial endpoint or audit logs. | **Server-Side RBAC + Guardrail 11 (`ADR-21`, `ADR-27` / `SEC-A`)**: NestJS `@Roles(...)` + `JwtAuthGuard` + Redis/DB active-status checks enforce role boundaries; financial authorizations strictly require verified statutory Partner identity (`Role.PARTNER`); audit logs & BullMQ telemetry are restricted strictly to `Role.SUPER_ADMIN`. |

---

## 2. OWASP Top 10 Protections for Financial Endpoints

### 2.1 BOLA / IDOR (Broken Object Level Authorization)
- **The Risk**: Staff or customers alter a URL parameter (e.g. `/customers/:id/passbook` or `/customers/:id/fcm-token`) to read or mutate another subscriber's or branch's data.
- **The Defense**: Enforced at the domain service and helper layers ([`report-scope.helper.ts`](file:///u:/Kumaran-finance/apps/api/src/report/helpers/report-scope.helper.ts), `CustomerService`, `InstallmentService`, `StorageService`) paired with `JwtAuthGuard` & `RolesGuard`. Branch-bound staff are restricted to their assigned `branchId`, and `CUSTOMER` principals are strictly confined to their own `customerId`; cross-scope attempts fail closed with `403 Forbidden`.

### 2.2 Concurrency & Race Conditions (Double Allocation)
- **The Risk**: Two simultaneous payments arrive for the same due, resulting in double allocation or negative balances.
- **The Defense**: All financial write paths run inside `withTransactionRetry` Prisma `$transaction` blocks with explicit monotonic 5-tier pessimistic row locks (`CONCURR-INV-1..26` verified 26/26 against live PostgreSQL 17):
  ```sql
  SELECT id, status, "netPayableAmount" FROM "InstallmentDue" WHERE id = $1 FOR UPDATE;
  ```

### 2.3 Sensitive Data Masking & PII Redaction (DPDP Act 2023)
- Plaintext logging of passwords, MPINs, full Aadhaar, PAN, bank account numbers, cheque numbers, or tokens is strictly prohibited.
- Enforced across three dedicated production sanitizers:
  1. **Sentry APM (`beforeSend`)**: [`scrubPii()`](file:///u:/Kumaran-finance/apps/api/src/common/sentry/sentry.config.ts#L40) & `buildSafeSentryUserContext()` redact credentials to `[FILTERED]`, mask phones, and stringify `bigint`.
  2. **Audit Log API**: `sanitizeAuditPayload()` in [`report.service.ts`](file:///u:/Kumaran-finance/apps/api/src/report/report.service.ts) recursively redacts secrets and masks PAN/Aadhaar in `oldValue`/`newValue` snapshots (preserving `aadhaarLast4`).
  3. **Outbound SMS / Push Logs**: [`PhoneHelper.maskPhone()`](file:///u:/Kumaran-finance/apps/api/src/notification/helpers/phone.helper.ts) masks phone numbers as `+91******3210` in all logs and telemetry.

---

## 3. Microsoft Authenticator (TOTP) Security for Admin Web Portal

1. **Algorithm**: RFC 6238 Time-Based One-Time Password (`otplib` v13) with 30-second time step.
2. **Secret Storage**: User 2FA secret is encrypted at rest in PostgreSQL using **AES-256-GCM** via [`encryptAesGcm` / `decryptAesGcm`](file:///u:/Kumaran-finance/apps/api/src/common/crypto/aes-gcm.util.ts) ([`auth.service.ts:22,201,424`](file:///u:/Kumaran-finance/apps/api/src/auth/auth.service.ts#L22)).
3. **Brute-Force & Setup Replay Defense**: `POST /api/v1/auth/web/verify-totp` and `POST /api/v1/auth/totp/enable` enforce strict `@Throttle` (`THROTTLE_OTP_LIMIT = 5 / 5 min`), `POST /api/v1/auth/totp/disable` enforces `THROTTLE_AUTH_LIMIT` (`5 / 15 min`) + current password verification, and initial setup tokens are atomically consumed once ([`auth.service.ts:1173`](file:///u:/Kumaran-finance/apps/api/src/auth/auth.service.ts#L1173)) to block replay.
