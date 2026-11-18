# Kumaran Chits — High-Level System Architecture (HLD)

> **Product**: **Kumaran Chits** (Kumaran Finance)  
> **Architecture Pattern**: Modular Monolith  
> **Key Tenet**: PostgreSQL 17 is the sole source of financial truth. Server-side rules govern all calculations, auctions, and payments.

---

## 1. System Topology & Architectural Diagram

```mermaid
flowchart TD
    subgraph Clients["Client Tier"]
        Web["React / Next.js 15 Responsive Web Portal\n(Phase 1 Primary: Partners, Managers, Accountants, Agents, Customers, Auditors)\nPassword + Microsoft Authenticator (TOTP) / Mobile Browser"]
        Mobile["Dart Core SDK (Phase 1 Ready: apps/mobile/lib/core/)\nFlutter Android UI & APK: Phase 2 Deferred (Q2 2027, ADR-26)"]
    end

    subgraph Edge["Security, Proxy & BFF Tier"]
        Nginx["Nginx Reverse Proxy (TLS / HTTPS)\nRate Limiting & Header Validation"]
        BFF["Next.js 15 BFF & Edge Middleware (ADR-20)\njose HS256 Verification | HttpOnly Cookies | /bff/api/v1/*"]
    end

    subgraph AppTier["Application Tier (Modular Monolith)"]
        Nest["NestJS 12 API Backend\n(TypeScript, Modular Architecture)\nJWT Auth Guards | RBAC | Branch Scoping | Partner Identity"]
    end

    subgraph DataTier["Data & Storage Tier"]
        Postgres[("PostgreSQL 17\n(Authoritative Financial State)\nBigInt Whole-Rupee Math | Row Locking | 8 DB CHECK Constraints\nSession Vault (ADR-24) | Append-Only Audit Logs")]
        Redis[("Redis 7 + BullMQ\n(Non-Authoritative Jobs Queue, Status Cache & Atomic OTP Lua)\nDLT SMS | PDF Pre-Rendering | Arrears | Bank Recon")]
        S3["S3-Compatible Private Storage\n(Cloudflare R2 / MinIO / S3)\nPresigned URLs Only (15m Read / 5m Direct PUT)"]
    end

    subgraph External["External Services"]
        SMS["Indian Telecom DLT SMS Gateway (MSG91 — ADR-23)\nPrimary Phase 1 Channel (OTP + Bilingual Alerts)"]
        UPI["Direct Zero-Fee NPCI UPI Intent (ADR-19)\nupi://pay -> Karur Vysya Bank (KVB) Current Account\n(Zero Third-Party Payment Gateways)"]
        FCM["Firebase Cloud Messaging (FCM)\nPhase 2 Ready Push Driver (ADR-26)"]
    end

    Web -->|HTTPS + HttpOnly Cookies| Nginx
    Nginx -->|Browser Traffic| BFF
    BFF -->|/api/v1/* + Bearer JWT| Nest
    Mobile -->|HTTPS + Bearer JWT /api/v1/*| Nginx
    Nginx -->|API Bearer Traffic| Nest

    Nest -->|Prisma ORM / Serializable & FOR UPDATE Tx| Postgres
    Nest -->|BullMQ Queue & Atomic Lua| Redis
    Nest -->|S3 Protocol (Presigned URLs)| S3
    Web -.->|1-Tap upi://pay Intent + 12-Digit UTR Claim| UPI
    Nest -->|HTTP API + CircuitBreaker| SMS
    Nest -.->|FCM SDK (Phase 2)| FCM
```

---

## 2. Bank-Grade 3-Tier Authentication Architecture

### 2.1 Mobile Auth APIs & Dart Core SDK (Flutter Android UI Deferred to Phase 2 — ADR-26)
> **Scope Notice (`ADR-26`)**: Per business owner directive (November 13, 2026), all backend mobile authentication APIs (`/api/v1/auth/mobile/*`), atomic Redis Lua OTP guards (`F13`), and the typed Dart Core SDK (`apps/mobile/lib/core/`, including `AuthSessionManager` single-flight 401 refresh mutex `F14`) are **implemented and verified in Phase 1**. Native Flutter Android UI screens, Android Keystore biometric bindings, and APK packaging are **deferred to Phase 2 (Q2 2027)**; field agents and subscribers use the responsive Next.js Web Portal in Phase 1.

1. **Initial Device Registration (Backend Ready / Mobile UI Phase 2)**:
   - User enters registered 10-digit Indian mobile phone number.
   - Backend generates a 6-digit cryptographic OTP, stored as SHA-256 hash in Redis (`auth:otp:<phone>`, 300s TTL, atomic Redis Lua 3-attempt verification & 5-minute lockout per `F13`), and dispatches via registered Indian DLT SMS (`ADR-23`).
   - Upon verification, the user establishes a **6-digit MPIN** (`POST /auth/mobile/set-mpin`, gated strictly on authenticated `access` or single-use `mpin_setup` token per `F01`). Phase 2 Android UI will add Android Keystore (`flutter_secure_storage`) and Biometric unlock.
2. **Routine Daily Usage & Multi-Device Isolation (`ADR-24` / F04)**:
   - Backend validates MPIN hash (`POST /auth/mobile/login-mpin`), creating a device-family scoped PostgreSQL `Session` row (`clientType: 'MOBILE'`) with cryptographic `sid`, issuing a 15-minute Access JWT and 7-day rotating Refresh JWT without invalidating concurrent `'WEB'` sessions.
   - Dart `AuthSessionManager` (`F14`) coalesces concurrent 401 responses into a single `/auth/refresh` call (`clientType: 'MOBILE'`) and replays requests transparently.
3. **Offline / Low-Network Resilience (Phase 2 UI)**:
   - Local SQLite queue engine (`apps/mobile/lib/core/offline/`) preserves draft field collections and syncs idempotently via `POST /collections/offline-sync`.

### 2.2 Office Web Portal Authentication (Next.js 15 BFF — ADR-20)
1. **Credentials**: Registered 10-digit Indian Mobile Phone (`ADR-18` phone-only identity; zero email columns) + Strong Password (`bcrypt`, work factor 10–12). Newly provisioned staff accounts receive a cryptographically random temporary password with `mustChangePassword: true` (`F16`), receiving an `onboarding_restricted` cookie (`kc_onboarding_token`, 15m TTL) that enforces mandatory password setup at `/onboarding` (`POST /auth/complete-onboarding`).
2. **Mandatory 2FA via Microsoft Authenticator (TOTP)**:
   - Conforms strictly to **RFC 6238** (Time-based One-Time Password algorithm) with atomic Redis Lua challenge consumption (`F10`).
   - Staff scans a QR code during onboarding into **Microsoft Authenticator**; login issues a 5-minute `HttpOnly` cookie `kc_totp_pending_token` (`tokenType: 'totp_pending'`) verified at `/2fa` before minting full session cookies.
3. **BFF HttpOnly Cookie Enclosure & Session Guards (`ADR-20`)**:
   - Raw JWTs are never exposed to client JavaScript (`localStorage`/`sessionStorage` store zero tokens). Next.js BFF encloses `kc_access_token` (15m), `kc_refresh_token` (7d), `kc_totp_pending_token` (5m), and `kc_onboarding_token` (15m) in `HttpOnly; SameSite=Lax; Path=/` cookies with protocol-aware `Secure`.
   - Next.js Edge Middleware (`jose` HS256) validates tokens prior to rendering protected pages; [`SessionInactivityGuard`](file:///u:/Kumaran-finance/apps/web/src/components/security/session-inactivity-guard.tsx) displays an **18-minute warning modal** and executes **20-minute automatic logout** synchronized across tabs.
   - Real client IP (via `buildBffForwardHeaders` & `TRUST_PROXY`), User-Agent, and branch identifier are automatically captured via `AsyncLocalStorage` into `AuditLog`.

---

## 3. Modular Monolith Backend Boundaries (NestJS 12)

The backend is built as a single deployable application with strict internal modular boundaries across **21 source directories**:

```text
apps/api/src/
├── assets/               # Bundled Unicode Tamil fonts (NotoSansTamil-Regular/Bold.ttf)
├── auction/              # In-office auction recording, physical tie-break, corrections, minutes
├── auth/                 # Phone-only auth (ADR-18), atomic OTP via DLT, MPIN, TOTP, JWT guards
├── branch/               # Branch office CRUD, bilingual Tamil names, branch metadata
├── chit/                 # Scheme configuration, terms, cancellation, ongoing chit onboarding
├── collection/           # Field collection recording, offline sync, cash handover
├── common/               # BigInt interceptor, exception filters, distributed locks, tx retry
├── config/               # Environment validation (strict fail-fast)
├── customer/             # Customer profiles, KYC uploads to S3, Nominees
├── disbursement/         # Prize disbursements, safety proof checklist, 2-stage Month N settlement
├── health/               # Terminus health checks & Sentry crash verification
├── installment/          # Due schedule generation, 6-col passbook, defaulter removal/substitution
├── jobs/                 # BullMQ queues, Bull Board guard, daily arrears, notifications, recon
├── metrics/              # Prometheus HTTP, BullMQ & business telemetry
├── notification/         # Pluggable DLT SMS (MSG91/Mock + CircuitBreaker) & Push (FCM/Mock)
├── payment/              # Payments, allocations, bilingual receipts, UPI claims, reversals
├── pdf/                  # Bilingual PDF canvas engine (A5 receipts/vouchers, A4 Form XVII/XXI)
├── prisma/               # Prisma database service, AuditLog IP extension & transactions
├── report/               # Day book, Form XXII cash book, Form XVII/XXI, SSE approvals stream
├── storage/              # Encrypted private S3/R2 & local storage driver, Anti-BOLA helpers
└── user/                 # Staff user administration, RBAC roles, verified Partner flag
```

---

## 4. Source-of-Truth & Data Principles

1. **PostgreSQL 17 is Sole Financial Truth**:
   - Financial balances, payment statuses, session revocation vaults (`Session`), and auction results live **only** in PostgreSQL.
   - Redis is strictly for retryable queues (DLT SMS & reminders, PDF pre-rendering, daily arrears, bank reconciliation) and ephemeral auth/OTP caches; Redis failure must never corrupt or lose financial data.
2. **Precision & Whole Rupee Math (`CONFIRMED-BY-DEVELOPER`)**:
   - All monetary fields use PostgreSQL 64-bit integer Rupees (**`BigInt`**).
   - The TypeScript / NestJS layer uses JavaScript native `bigint` for financial calculations. Binary floats (`number`) and fractional paise are strictly disallowed in financial services (`CONFIRMED-BY-DEVELOPER`).
   - Clean whole-rupee numbers are maintained across installments, dividends, commissions, and prize payouts without fractional accumulation.
3. **Private Document Storage**:
   - Customer KYC documents and generated PDF receipts are stored in an **S3-Compatible Private Bucket** (Cloudflare R2, MinIO, or private S3) with AES-256 server-side encryption.
   - Clients access files solely through short-lived presigned URLs (valid for 15 minutes).
