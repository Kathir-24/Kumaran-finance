# Kumaran Chits — Non-Functional Requirements (NFR)

> **Product**: **Kumaran Chits** (Kumaran Finance)  
> **Mandate**: Non-functional requirements in financial systems have equal importance to functional rules. Failure to meet NFRs directly impacts money, security, and statutory compliance.  
> **Currency Standard**: All monetary values are strictly in **whole integer Rupees (`BigInt`)**. Paise and floating-point math are strictly prohibited (`CONFIRMED-BY-DEVELOPER`).

---

## 1. Financial Precision & Integrity (`CONFIRMED-BY-DEVELOPER`)

- **Zero Floating-Point Rule**: IEEE 754 binary floating-point numbers (`float`, `double`, JS `number`) are strictly prohibited for monetary calculations across PostgreSQL, NestJS (`bigint`), Next.js (`BigInt`), and Dart Mobile Core (64-bit `int` parsed via `_parseWholeRupeeInt`, `DEF-M10-MOB-01`).
- **Data Types**: All monetary columns must use PostgreSQL 64-bit integer Rupees (**`BigInt`**). Paise and fractional currency units are never used in Kumaran Finance operations (`CONFIRMED-BY-DEVELOPER`).
- **Whole Rupee Arithmetic & Divisibility Gate (`KFC-FIN-002`)**: All calculations (installments, dividends, foreman commissions, and prize payouts) operate strictly in whole integer Rupees (₹). Any bid failing `(D - C_f) % M === 0` is rejected fail-closed with HTTP 400 `NON_DIVISIBLE_DIVIDEND`; remainders are never silently truncated.
- **Conservation Invariant**: For every auction:
  $$\text{Foreman Commission } (C_f) + \text{Total Member Dividends } (Div_{total}) = \text{Winning Bid Discount } (D)$$
- **Double-Entry Consistency**: Total payments allocated across installment dues must equal the exact payment receipt amount ($\sum \text{Allocations} = \text{Payment Amount}$).

---

## 2. Security & Regulatory Compliance (`CONFIRMED-BY-DEVELOPER`)

- **Data Encryption at Rest**: Encrypted storage volumes on flat-fee Linux VPS + private S3-compatible object storage (Cloudflare R2 / MinIO / S3 per `ADR-10`) with 15-minute presigned URLs for customer KYC and safety-proof documents.
- **Data Encryption in Transit**: TLS 1.3 / HTTPS across all public endpoints with modern cipher suites. Plain HTTP is disallowed.
- **Aadhaar & PII Privacy Mandate (DPDP Act 2023)**: Storing full 12-digit Aadhaar numbers in database or logs is strictly prohibited. The database stores strictly the last 4 digits (`aadhaarLast4`), operational logs mask MSISDNs (`+91******XXXX`), and `panNumber` is stripped from general search and collection agent payloads.
- **Session Security (`ADR-20` & `ADR-24`)**:
  - Web: Next.js 15 BFF HttpOnly cookies (`kc_access_token` 15 min, `kc_refresh_token` 7 days; zero browser `localStorage` tokens), durable PostgreSQL `Session` vault with cryptographic `sid` binding and client-family isolation, 18-minute warning / 20-minute inactivity auto-logout (`SessionInactivityGuard`), and Microsoft Authenticator TOTP 2FA.
  - Mobile Core: Single-flight 401 refresh mutex (`AuthSessionManager`, `F14`); 15-minute JWT access tokens; Android Keystore biometric binding targeted for Phase 2 UI (`ADR-26`).
- **Maker-Checker & Partner Identity Enforcement (`ADR-21` & `ADR-25`)**: All 8 critical financial workflows enforce `maker_user_id != checker_user_id` at both service layer (`assertVerifiedPartner`, `isPartner: true`) and PostgreSQL 17 storage layer (8 engine-level `CHECK` constraints).
- **Immutable Audit Trail**: Append-only audit logs (`GET /reports/audit-logs`, restricted strictly to `SUPER_ADMIN`) for all financial mutations, auction finalizations/corrections, and role adjustments. Direct `UPDATE` or `DELETE` on financial records is blocked.

---

## 3. Performance, Latency & Availability

- **API Response Latency**:
  - Read endpoints (`GET /customers`, `GET /tickets/:ticketId/passbook`): 95th percentile latency $\le 200\text{ ms}$.
  - Financial mutation endpoints (`POST /payments`, `POST /collections/record`): 95th percentile latency $\le 500\text{ ms}$.
  - **Live Verification**: Continuously measured by the Prometheus exporter (`http_request_duration_seconds`) at `/metrics` (see [`apps/api/src/metrics/README.md`](../../apps/api/src/metrics/README.md)).
- **Concurrency, Row Locking & Queue Durability (`KFC-INF-001`)**:
  - Financial write paths use database transactions with explicit pessimistic row locks (`SELECT FOR UPDATE`), deterministic acyclic lock ordering (DAG), and `withTransactionRetry` for transient deadlocks.
  - Heavy reports and batch crons enforce safe distributed locking (`DistributedLockService`) with unique tokens and atomic Lua releases.
  - Redis is configured with `--maxmemory-policy noeviction` (`KFC-INF-001`) so BullMQ queues are never silently evicted under memory pressure.
- **System Availability**: Target 99.9% uptime during operational business hours (08:00 AM to 09:00 PM IST).
- **Disaster Recovery**:
  - **Recovery Point Objective (RPO)**: $\le 15\text{ minutes}$ (via continuous PostgreSQL WAL archiving).
  - **Recovery Time Objective (RTO)**: $\le 2\text{ hours}$ (automated container rebuild and point-in-time restore).

---

## 4. Mobile Offline Tolerance & Network Resilience

- **Field Agent Offline Sync Core (Backend & Dart Core Active; Flutter UI Deferred to Phase 2 per `ADR-26`)**:
  - Backend offline batch endpoint (`POST /collections/sync-offline-queue`) and Dart Core SQLite queue (`apps/mobile/lib/core/offline/`) support rural dead-zone collection caching with UUIDv4 `idempotencyKey` deduplication and strict weak-ordering ticket/month sorting.
- **Single Discrete Payment Enforcement**: Each installment month accepts strictly one payment matching the net installment due. Once marked paid, duplicate payment attempts are rejected by the backend idempotency engine; zero double payments and zero advance balances exist (`CONFIRMED-BY-DEVELOPER`).

---

## 5. Client Device, Localization & Cross-Platform Resilience (`CONFIRMED-BY-DEVELOPER`)

- **Web Portal Viewport Adaptability & Bilingual Parity (Phase 1 Active)**:
  - Desktop-first responsive layout (Next.js 15 + Tailwind CSS) supporting 1080p desktop monitors ($\ge 1280\text{px}$) for dense ledgers and 10" tablets ($\ge 768\text{px}$), with tabular financial numerals (`font-variant-numeric: tabular-nums`), clean black-on-white `@media print` stylesheets, and 100% English/Tamil dictionary parity (`168 / 168` keys).
  - Page load time (FCP) $\le 1.5\text{ seconds}$ on standard broadband; bundle chunking per route.
- **Mobile App Performance & Hardware Targets (Phase 2 Deferred Scope — `ADR-26`)**:
  - Android 8.0+ (API level 26) through Android 15; 60fps rendering on 2GB/3GB RAM entry-level chipsets.
  - Native Biometric Prompt API ($< 0.5\text{s}$ unlock), native Android UPI Intent dispatch (`upi://pay`), and camera media capture for safety proof cheques.
- **Cross-Device Maker-Checker Resilience**:
  - Complete device independence: Maker and Checker can operate across any combination of Web and Mobile (`maker_user_id != checker_user_id`).
