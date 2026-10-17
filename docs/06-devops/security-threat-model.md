# Kumaran Chits — Fintech Security Architecture & Threat Model

> **Product**: **Kumaran Chits** (Kumaran Finance)  
> **Framework**: OWASP Top 10 for Financial APIs & STRIDE Threat Modeling  
> **Mandate**: In fintech, security is not a post-launch add-on. Every threat vector must have automated controls built into the code.

---

## 1. Threat Modeling Matrix (STRIDE Analysis)

| Threat Category | Potential Attack Vector in Kumaran Chits | Defense / Mitigation Implemented |
|---|---|---|
| **Spoofing (Identity)** | Attacker guesses collection agent's MPIN or steals credentials. | **Device Cryptographic Binding**: Requests must be signed by the private key inside the Android Keystore. 5 incorrect MPIN attempts triggers a 15-minute lock. |
| **Tampering (Data)** | Disgruntled staff updates an active payment amount in the database. | **Append-Only History**: PostgreSQL trigger prevents `UPDATE` or `DELETE` on `Payment` and `PaymentAllocation` rows. Only maker-checker reversals are permitted. |
| **Repudiation** | Customer or agent claims a cash collection was never made. | **Immutable Audit Log + Digital Receipt**: System logs timestamp, GPS/IP, agent ID, and issues a cryptographically hashed receipt number. |
| **Information Disclosure** | Data leak reveals full Aadhaar or bank account numbers of subscribers. | **Aadhaar Masking & KMS Encryption**: Database stores only masked last 4 digits (`XXXXXXXX1234`). S3 KYC buckets use AES-256 KMS encryption. |
| **Denial of Service (DoS)** | Script floods the OTP endpoint or hammers auction finalization. | **Tiered Rate Limiting**: Max 3 OTP requests per hour per phone number. API throttled at 60 requests/minute per IP via NestJS Throttler. |
| **Elevation of Privilege** | Collection agent calls Admin API to change chit discount ceiling. | **Server-Side RBAC Guards**: NestJS `@Roles(Role.SUPER_ADMIN)` guard checks database user role on every request; never trusts client tokens. |

---

## 2. OWASP Top 10 Protections for Financial Endpoints

### 2.1 BOLA / IDOR (Broken Object Level Authorization)
- **The Risk**: Agent A changes URL from `/customers/cust-101/passbook` to `/customers/cust-202/passbook` to snoop on another branch's customers.
- **The Defense**: Global `BranchScopeInterceptor` checks that the customer’s `branchId` matches the authenticated agent’s `branchId`. Cross-branch reads return `403 Forbidden`.

### 2.2 Concurrency & Race Conditions (Double Allocation)
- **The Risk**: Two simultaneous payments arrive for the same due, resulting in double allocation or negative balances.
- **The Defense**: All balance allocations run inside Prisma `$transaction` blocks with explicit row locks:
  ```sql
  SELECT * FROM "InstallmentDue" WHERE id = $1 FOR UPDATE;
  ```

### 2.3 Sensitive Data Masking in Server Logs
- Plaintext logging of passwords, MPINs, full bank account numbers, or OTPs is strictly forbidden.
- Central NestJS Logging Interceptor automatically redacts sensitive fields:
  ```typescript
  const SENSITIVE_FIELDS = ['password', 'mpin', 'otp', 'token', 'panNumber', 'aadhaar'];
  ```

---

## 3. Microsoft Authenticator (TOTP) Security for Admin Web Portal

1. **Algorithm**: RFC 6238 Time-Based One-Time Password with HMAC-SHA1 and 30-second time step.
2. **Secret Storage**: User 2FA secret is encrypted in PostgreSQL using AES-256-GCM.
3. **Replay Attack Defense**: The system stores the last used TOTP timestamp for each user. If an attacker intercepts and resubmits the same 6-digit code within the 30-second window, it is rejected as already consumed.
