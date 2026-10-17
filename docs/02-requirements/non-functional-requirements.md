# Kumaran Chits — Non-Functional Requirements (NFR)

> **Product**: **Kumaran Chits** (Kumaran Finance)  
> **Mandate**: Non-functional requirements in financial systems have equal importance to functional rules. Failure to meet NFRs directly impacts money, security, and statutory compliance.  
> **Currency Standard**: All monetary values are strictly in **whole integer Rupees (`BigInt`)**. Paise and floating-point math are strictly prohibited (`CONFIRMED-BY-DEVELOPER`).

---

## 1. Financial Precision & Integrity (`CONFIRMED-BY-DEVELOPER`)

- **Zero Floating-Point Rule**: IEEE 754 binary floating-point numbers (`float`, `double`, JS `number`) are strictly prohibited for monetary calculations.
- **Data Types**: All monetary columns must use PostgreSQL 64-bit integer Rupees (**`BigInt`**). Paise and fractional currency units are never used in Kumaran Finance operations (`CONFIRMED-BY-DEVELOPER`).
- **Whole Rupee Arithmetic**: All calculations (installments, dividends, foreman commissions, and prize payouts) operate strictly in whole integer Rupees (₹). Kumaran Finance maintains standard whole dividend amounts so clean whole numbers are maintained without fractional accumulation (`CONFIRMED-BY-DEVELOPER`).
- **Conservation Invariant**: For every auction:
  $$\text{Foreman Commission } (C_f) + \text{Total Member Dividends } (Div_{total}) = \text{Winning Bid Discount } (D)$$
- **Double-Entry Consistency**: Total payments allocated across installment dues must equal the exact payment receipt amount ($\sum \text{Allocations} = \text{Payment Amount}$).

---

## 2. Security & Regulatory Compliance (`CONFIRMED-BY-DEVELOPER`)

- **Data Encryption at Rest**: AES-256 KMS encryption for PostgreSQL database, EBS volumes, and S3 buckets storing customer KYC documents.
- **Data Encryption in Transit**: TLS 1.3 / HTTPS across all public endpoints with modern cipher suites. Plain HTTP is disallowed.
- **Aadhaar Privacy Mandate**: Storing full 12-digit Aadhaar numbers in database or logs is strictly prohibited. The system stores only the masked last 4 digits (`XXXXXXXX1234`).
- **Session Security**:
  - Mobile: Device cryptographic binding via Android Keystore; 15-minute JWT access tokens.
  - Web: 20-minute inactivity auto-logout; optional TOTP 2FA for administrative staff.
- **Maker-Checker Enforcement**: Reversals, auction finalization, and prize disbursements enforce `maker_user_id != checker_user_id`.
- **Immutable Audit Trail**: Append-only audit logs for all financial mutations, auction finalizations, and role adjustments. Direct `UPDATE` or `DELETE` on financial records is blocked.

---

## 3. Performance, Latency & Availability

- **API Response Latency**:
  - Read endpoints (`GET /customers`, `GET /tickets/:id/passbook`): 95th percentile latency $\le 200\text{ ms}$.
  - Financial mutation endpoints (`POST /payments`, `POST /collections`): 95th percentile latency $\le 500\text{ ms}$.
- **Concurrency & Row Locking**:
  - Auction bid recording and payment allocations must use database transactions with explicit pessimistic row locks (`SELECT FOR UPDATE`) to prevent race conditions.
- **System Availability**: Target 99.9% uptime during operational business hours (08:00 AM to 09:00 PM IST).
- **Disaster Recovery**:
  - **Recovery Point Objective (RPO)**: $\le 15\text{ minutes}$ (via continuous PostgreSQL WAL archiving).
  - **Recovery Time Objective (RTO)**: $\le 2\text{ hours}$ (automated container rebuild and point-in-time restore).

---

## 4. Mobile Offline Tolerance & Network Resilience

- **Field Agent Offline Drafts**:
  - The Android app must allow field collection agents (supporting dynamic $N$ agents) to record cash collections even when cellular network connectivity is lost in rural areas.
  - Collections are cached securely in local SQLite/Encrypted SharedPreferences with timestamps and synchronized via idempotent retry queues upon network reconnection.
- **Offline Conflict Handling**: If duplicate online and offline payments occur, the excess cash is automatically credited as **Advance Balance** on the subscriber's ticket toward next month's installment (`CONFIRMED-BY-DEVELOPER`).
