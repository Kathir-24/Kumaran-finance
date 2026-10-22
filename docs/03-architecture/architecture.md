# Kumaran Chits — High-Level System Architecture (HLD)

> **Product**: **Kumaran Chits** (Kumaran Finance)  
> **Architecture Pattern**: Modular Monolith  
> **Key Tenet**: PostgreSQL 17 is the sole source of financial truth. Server-side rules govern all calculations, auctions, and payments.

---

## 1. System Topology & Architectural Diagram

```mermaid
flowchart TD
    subgraph Clients["Client Tier"]
        Mobile["Flutter Android App\n(Partners, Collection Agents & Customers)\nMPIN + Biometrics (Fingerprint)"]
        Web["React / Next.js Web Dashboard\n(Partners, Accountants, Managers, Auditors)\nPassword + Microsoft Authenticator (TOTP)"]
    end

    subgraph Edge["Security & Gateway Tier"]
        Caddy["Reverse Proxy (TLS / HTTPS)\nRate Limiting & Header Validation"]
    end

    subgraph AppTier["Application Tier (Modular Monolith)"]
        Nest["NestJS 12 API Backend\n(TypeScript, Modular Architecture)\nJWT Auth Guards | RBAC | Branch Scoping"]
    end

    subgraph DataTier["Data & Storage Tier"]
        Postgres[("PostgreSQL 17\n(Authoritative Financial State)\nNumeric Math | Row Locking | Audit Logs")]
        Redis[("Redis 7 + BullMQ\n(Non-Authoritative Jobs Queue)\nReminders | Webhook Retries | Reconciliations")]
        S3["AWS S3 Private Object Storage\n(Encrypted KYC Docs & PDF Receipts)\nPresigned URLs Only"]
    end

    subgraph External["External Services"]
        FCM["Firebase Cloud Messaging (FCM)\nPush Notifications"]
        PG["Approved Payment Gateway\n(UPI / Netbanking in Sandbox)"]
        SMS["Indian Telecom DLT SMS Gateway\n(Initial Device Registration OTP Only)"]
    end

    Mobile -->|HTTPS / REST API| Caddy
    Web -->|HTTPS / REST API| Caddy
    Caddy --> Nest

    Nest -->|Prisma ORM / Transactions| Postgres
    Nest -->|BullMQ Queue| Redis
    Nest -->|AWS SDK (Presigned URLs)| S3
    Nest -->|HTTP / Webhooks| PG
    Nest -->|FCM SDK| FCM
    Nest -->|HTTP API| SMS
```

---

## 2. Bank-Grade 3-Tier Authentication Architecture

### 2.1 Mobile App Authentication (Partners, Collection Agents & Customers)
1. **Initial Device Registration (One-Time Only)**:
   - User enters registered mobile phone number.
   - Backend sends a one-time OTP via registered Indian SMS (DLT route).
   - Upon verification, the Flutter app creates a cryptographic device key pair using **Android Keystore** via `flutter_secure_storage`.
   - The user establishes a **6-digit MPIN** and optionally enables **Biometrics** (Fingerprint / Face Unlock).
2. **Routine Daily App Usage (Zero SMS Cost, 1-Second Unlock)**:
   - The user unlocks the app using their **Fingerprint** or **6-digit MPIN**.
   - The backend validates the cryptographic device signature and MPIN hash, issuing a short-lived JWT Access Token (15-minute expiration) and a rotating Refresh Token.
   - **Partner Executive Console**: Partners unlocking via fingerprint get immediate access to the high-level cash pulse, pending Maker-Checker approvals, and cash handover acknowledgment.
   - **Offline / Low-Network Resilience**: Collection agents can unlock the app and record draft collections even with intermittent network coverage.
3. **Step-Up Authentication**:
   - High-value collections, cash handovers, prize payout authorizations, or profile changes require re-entering the 6-digit MPIN.

### 2.2 Office Web Portal Authentication (Admins, Accountants, Managers)
1. **Credentials**: Registered 10-digit Indian Mobile Phone + Strong Password (bcrypt hash with work factor 12).
2. **Mandatory 2FA via Microsoft Authenticator (TOTP)**:
   - Conforms strictly to **RFC 6238** (Time-based One-Time Password algorithm).
   - Staff scans a QR code during initial onboarding into their **Microsoft Authenticator** app.
   - Every office login requires entering the current 6-digit rotating code from Microsoft Authenticator.
3. **Session Guards**:
   - Inactive session timeout enforced at 20 minutes.
   - IP address, User-Agent, and branch identifier logged on every request.

---

## 3. Modular Monolith Backend Boundaries (NestJS 12)

The backend is built as a single deployable application with strict internal modular boundaries:

```text
apps/api/src/
├── auth/                 # Device registration, MPIN, TOTP, JWT strategy, Guards
├── branch/               # Branch management, settings, branch-scoping interceptor
├── user/                 # Staff & Customer identity, RBAC decorators
├── customer/             # Customer profiles, KYC uploads to S3, Nominees
├── chit/                 # Scheme configuration, terms, ongoing chit onboarding
├── ticket/               # Subscriber memberships, ticket allocation (1..N)
├── auction/              # In-office auction recording, physical tie-break, minutes
├── installment/          # Due schedule generation, dividend deductions, balances
├── collection/           # Field collection recording, offline sync, cash handover
├── payment/              # Payments, allocations, bilingual receipts, reversals
├── report/               # Day book, cash book, statutory Tamil Nadu registers
└── audit/                # Immutable append-only audit event interceptor
```

---

## 4. Source-of-Truth & Data Principles

1. **PostgreSQL 17 is Sole Financial Truth**:
   - Financial balances, payment statuses, and auction results live **only** in PostgreSQL.
   - Redis is strictly for retryable queues (reminders, webhook processing) and temporary cache; Redis failure must never corrupt or lose financial data.
2. **Precision & Whole Rupee Math (`CONFIRMED-BY-DEVELOPER`)**:
   - All monetary fields use PostgreSQL 64-bit integer Rupees (**`BigInt`**).
   - The TypeScript / NestJS layer uses JavaScript native `bigint` for financial calculations. Binary floats (`number`) and fractional paise are strictly disallowed in financial services (`CONFIRMED-BY-DEVELOPER`).
   - Clean whole-rupee numbers are maintained across installments, dividends, commissions, and prize payouts without fractional accumulation.
3. **Private Document Storage**:
   - Customer KYC documents and generated PDF receipts are stored in an **AWS S3 Private Bucket** with AES-256 server-side encryption (`aws:kms`).
   - Clients access files solely through short-lived presigned URLs (valid for 15 minutes).
