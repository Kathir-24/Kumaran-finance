# Kumaran Chits — REST API Specification & Contract

> **Product**: **Kumaran Chits** (Kumaran Finance, Perundurai, Erode, Tamil Nadu)  
> **Base URL**: `/api/v1` (Global prefix `/api`, URI versioning `v1`)  
> **Documentation Tool**: OpenAPI 3.0 / Swagger (`/api/docs`)  
> **Contract Source of Truth**: [`docs/03-architecture/openapi-spec.json`](openapi-spec.json) & [`docs/03-architecture/completed-modules-api-registry.md`](completed-modules-api-registry.md)  
> **Total Verified Scope**: **115 operations across 109 paths** (100% automated test coverage, 455 passing tests across 26 unit suites [367 unit] and 10 E2E suites [88 E2E]).

---

## 1. Global Request & Response Conventions

### 1.1 Required & Resilience HTTP Headers
| Header Name | Type | Description |
|---|---|---|
| `Authorization` | String | `Bearer <JWT_ACCESS_TOKEN>` for all authenticated endpoints |
| `Content-Type` | String | `application/json` (max 1 MB) or `multipart/form-data` (max 25 MB for KYC and safety-proof uploads) |
| `Idempotency-Key` | String | Unique UUID required on financial mutation endpoints (`POST /payments`, `POST /collections/record`, `POST /collections/sync-offline-queue`, `POST /payments/:id/request-reversal`, `POST /disbursements/auction/:auctionId/release`). Intercepted by `IdempotencyHeaderInterceptor` to bridge headers directly to request bodies and guarantee idempotency across network retries. |
| `Retry-After` (Response) | Integer / Seconds | Attached to all HTTP 429 (`TOO_MANY_REQUESTS`) responses by both NestJS `GlobalExceptionFilter` and Nginx edge rate limiter, indicating the backoff period before retrying. |

### 1.2 Standard Response Envelopes

#### Success Envelope (HTTP 200 / 201)
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-23T10:30:00.000Z",
  "data": { ... }
}
```

#### Error Envelope (HTTP 4xx / 5xx)
```json
{
  "success": false,
  "statusCode": 400,
  "timestamp": "2026-10-23T10:30:00.000Z",
  "error": {
    "code": "BAD_REQUEST",
    "message": "Bid discount ₹28,000 exceeds maximum allowable 1/4 ceiling of 25% (₹25,000)",
    "details": []
  }
}
```

---

## 2. API Endpoints Catalog

### 2.1 Module 1: Auth & Staff Identity (`/api/v1/auth`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/auth/web/login` | Office staff credentials login (10-digit Phone + Password) | Public |
| `POST` | `/auth/web/verify-totp` | Verify Microsoft Authenticator 6-digit TOTP code | Session Token |
| `POST` | `/auth/mobile/request-otp` | Request 6-digit SMS OTP (DLT Template 1407169823412093847); stored in Redis (`auth:otp:<phone>`) with 300s TTL | Public (Throttled) |
| `POST` | `/auth/mobile/verify-otp` | Verify 6-digit SMS OTP against Redis with 3-attempt lockout; returns `setupToken` for staff or full session tokens for customers | Public (Throttled) |
| `POST` | `/auth/mobile/set-mpin` | Establish or update 6-digit MPIN bcrypt hash (Accepts `setupToken` or Bearer JWT) | Setup Token / Bearer JWT |
| `POST` | `/auth/mobile/login-mpin` | Mobile quick unlock with 10-digit Phone + 6-digit MPIN (Biometric unlock on mobile calls this) | Public (Throttled) |
| `POST` | `/auth/refresh-token` | Rotate 15-minute access token & 7-day refresh token | Public |
| `POST` | `/auth/logout` | Revoke active session, refresh token hash & FCM token | Bearer JWT |
| `PATCH`| `/auth/fcm-token` | Register or clear staff device Firebase FCM push token | Bearer JWT (Staff) |
| `GET`  | `/auth/me` | Retrieve authenticated profile, roles, and branch details (Dual Staff & Customer Support) | Bearer JWT |
| `POST` | `/auth/change-password` | Self-service password change with current password verification | Bearer JWT (Staff) |
| `POST` | `/auth/totp/setup` | Generate RFC 6238 Base32 secret & QR URI for 2FA | Bearer JWT |
| `POST` | `/auth/totp/enable` | Confirm 6-digit code and permanently lock 2FA | Bearer JWT |
| `POST` | `/auth/totp/disable` | Disable 2FA with password confirmation | Bearer JWT |

### 2.2 Branches & Staff User Administration (`/api/v1/branches`, `/api/v1/users`)
| Method | Endpoint | Description | Allowed Roles |
|---|---|---|---|
| `GET`  | `/branches` | List active company branch offices | Staff, Auditor |
| `GET`  | `/branches/:id` | Get branch metadata by ID | Staff, Auditor |
| `POST` | `/branches` | Create new physical branch office | `SUPER_ADMIN` |
| `GET`  | `/users` | Search & list staff users with pagination and role/branch filters | `SUPER_ADMIN`, `BRANCH_MANAGER` |
| `GET`  | `/users/:id` | Get staff user profile by ID (Sanitized, no hashes) | `SUPER_ADMIN`, `BRANCH_MANAGER` |
| `POST` | `/users` | Create new staff account with assigned RBAC roles and default credentials | `SUPER_ADMIN` |
| `PATCH`| `/users/:id/status` | Activate or deactivate staff user account (Immediately revokes active sessions) | `SUPER_ADMIN` |
| `PATCH`| `/users/:id/roles` | Update assigned RBAC roles for staff account (Self-revocation guard) | `SUPER_ADMIN` |
| `POST` | `/users/:id/reset-password` | Reset staff credentials & revoke active sessions | `SUPER_ADMIN` |

### 2.3 Module 2: Customers & KYC Management (`/api/v1/customers`)
| Method | Endpoint | Description | Allowed Roles |
|---|---|---|---|
| `POST` | `/customers` | Register customer profile (`KC-CUST-XXXXX`) | `SUPER_ADMIN`, `BRANCH_MANAGER`, `COLLECTION_AGENT` |
| `GET`  | `/customers` | Search & list customers with pagination and name filter | Staff, Auditor |
| `GET`  | `/customers/:id` | Get customer details, active chits, and passbook | Staff, Self (Customer), Auditor |
| `PATCH`| `/customers/:id` | Update customer address and phone number | `SUPER_ADMIN`, `BRANCH_MANAGER` |
| `POST` | `/customers/:id/nominees` | Link verified nominee record with relationship | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, Self |
| `DELETE`| `/customers/:id/nominees/:nomineeId` | Remove linked nominee record | `SUPER_ADMIN`, `BRANCH_MANAGER` |
| `PATCH`| `/customers/:id/kyc-status` | Approve or revoke customer KYC verification status | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT` |
| `PATCH`| `/customers/:id/fcm-token` | Register subscriber FCM device push token (Anti-IDOR) | Staff, Self (Customer) |
| `POST` | `/customers/:id/documents` | Upload KYC scan (Aadhaar, PAN, Photo, Signature; multipart/form-data) to private S3 | Staff, Self (Customer) |
| `GET`  | `/customers/:id/documents/:docId/url` | Generate 15-minute S3 presigned viewing URL for KYC scan (Agents blocked per ADR-15) | Staff (Excl. Agents), Self (Customer), Auditor |
| `DELETE`| `/customers/:id/documents/:docId` | Delete KYC scan from S3 & DB (Verified docs restricted to Super Admin) | Staff, Self (Customer) |

### 2.4 Module 3: Chit Schemes & Mid-Cycle Intake (`/api/v1/chits`)
| Method | Endpoint | Description | Allowed Roles |
|---|---|---|---|
| `POST` | `/chits/new` | Create fresh chit group in DRAFT status | `SUPER_ADMIN` |
| `PATCH`| `/chits/:id` | Update draft chit scheme parameters (groupName, dates, sanction details) | `SUPER_ADMIN` |
| `POST` | `/chits/onboard-ongoing` | **Mid-Cycle Intake**: Onboard ongoing chit from physical notebook | `SUPER_ADMIN`, `BRANCH_MANAGER` |
| `GET`  | `/chits` | List chit schemes with status & keyword filter | All Authenticated |
| `GET`  | `/chits/:id` | View chit scheme details, duration, base dues, and rules | All Authenticated |
| `POST` | `/chits/:id/tickets/assign` | Assign ticket 1..N (Enforces ADR-13 unique constraint) | `SUPER_ADMIN`, `BRANCH_MANAGER` |
| `DELETE`| `/chits/:id/tickets/:ticketNumber` | Unassign ticket before scheme activation (DRAFT only) | `SUPER_ADMIN`, `BRANCH_MANAGER` |
| `GET`  | `/chits/:id/tickets` | View all assigned tickets and status in scheme | Staff, Member, Auditor |
| `POST` | `/chits/:id/activate` | Lock terms, freeze 4% commission & Month 1 pool | `SUPER_ADMIN` |

### 2.5 Module 4: In-Office Offline Auctions & Tie-Breakers (`/api/v1/auctions`)
| Method | Endpoint | Description | Allowed Roles |
|---|---|---|---|
| `GET`  | `/auctions/group/:chitGroupId` | List past auctions, winners & dividend history for group | All Authenticated |
| `GET`  | `/auctions/:id` | Get single auction record & tie-break results | All Authenticated |
| `GET`  | `/auctions/:id/eligible-bidders` | **Pre-Auction Guard**: Active non-prized subscribers with 0 arrears | Staff, Auditor |
| `POST` | `/auctions/:id/record-bid` | **Maker**: Enter winning ticket & bid discount ($D \le V/4$) | `SUPER_ADMIN`, `BRANCH_MANAGER` |
| `POST` | `/auctions/:id/tie-break` | **Option A (Physical Draw)**: Record paper token lot draw winner | `SUPER_ADMIN`, `BRANCH_MANAGER` |
| `POST` | `/auctions/:id/tie-break-record` | **Option A Tie-Break (Alias)**: Record paper token lot draw winner | `SUPER_ADMIN`, `BRANCH_MANAGER` |
| `POST` | `/auctions/:id/finalize` | **Checker**: Commit auction result & generate dues (`maker != checker`); enqueues background auction result broadcast to BullMQ `notification-queue` (`JOB_DISPATCH_AUCTION_RESULT`; Push primary, Keypad SMS fallback) | `SUPER_ADMIN`, `BRANCH_MANAGER` |
| `GET`  | `/auctions/:id/minutes` | View Form XVII statutory auction minutes summary | Staff, Auditor |
| `GET`  | `/auctions/:id/minutes/pdf` | Form XVII statutory auction minutes layout for print/PDF | Staff, Auditor |
| `PATCH`| `/auctions/:auctionId/mark-filed-with-registrar` | Record physical filing of Form XVII at Registrar of Chits | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT` |

### 2.6 Module 5: Installments, Digital Passbook & Defaulters (`/api/v1/tickets`, `/api/v1/installments`)
| Method | Endpoint | Description | Allowed Roles |
|---|---|---|---|
| `GET`  | `/tickets/:ticketId/dues` | Full monthly dues schedule for ticket | Staff, Member, Auditor |
| `GET`  | `/tickets/:ticketId/passbook` | Detailed 6-column digital passbook ledger statement | Staff, Member, Auditor |
| `GET`  | `/tickets/defaulters` | List subscribers with continuous arrears with pagination (`?page=1&limit=20`, max 100) | Staff, Auditor |
| `GET`  | `/installments/defaulters` | **Defaulters (Alias)**: Query 3-month consecutive defaulter report with pagination (`?page=1&limit=20`, max 100) | Staff, Auditor |
| `POST` | `/tickets/:id/remove-defaulter` | **Defaulter Removal**: Execute removal after 3 continuous months arrears (`REMOVED_DEF_3M`) | `SUPER_ADMIN` |
| `POST` | `/tickets/:id/substitute` | **Defaulter Substitution**: Assign replacement customer to `REMOVED_DEF_3M` ticket (ADR-13) | `SUPER_ADMIN` |
| `POST` | `/tickets/:id/settle-removal` | **Exit Settlement**: Settle defaulter account with refund minus 4% contractual damages voucher | `SUPER_ADMIN`, `ACCOUNTANT` |
| `GET`  | `/installments/group/:chitGroupId/month/:month` | View member dues list for specified month | Staff, Auditor |
| `POST` | `/installments/group/:chitGroupId/month/:month/generate` | Generate dues from auction dividend | `SUPER_ADMIN`, `BRANCH_MANAGER` |
| `GET`  | `/installments/:dueId/upi-intent` | Generate NPCI 1-tap `upi://pay` URI locking exact whole-rupee $I_{net}$ amount and KVB account payee VPA | `CUSTOMER`, `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, `COLLECTION_AGENT` |

### 2.7 Module 6: Field Collections & Cash Handover (`/api/v1/collections`)
| Method | Endpoint | Description | Allowed Roles |
|---|---|---|---|
| `GET`  | `/collections/agent-dues` | View dues assigned for field collection rounds | `COLLECTION_AGENT`, `ACCOUNTANT`, `SUPER_ADMIN` |
| `POST` | `/collections/record` | Record doorstep cash collection (Exact $I_{net}$; throws 400 on partial); enqueues background receipt dispatch to BullMQ `notification-queue` (Push primary, Keypad SMS fallback) | `COLLECTION_AGENT`, `ACCOUNTANT`, `BRANCH_MANAGER`, `SUPER_ADMIN` |
| `POST` | `/collections/sync-offline-queue` | Batch sync offline field collection queue (1 to 100 items with item-level failure isolation, idempotency & asynchronous BullMQ receipt dispatch) | `COLLECTION_AGENT`, `ACCOUNTANT`, `BRANCH_MANAGER`, `SUPER_ADMIN` |
| `GET`  | `/collections/daily-summary` | View today's collection register & vault cash | Staff, Auditor |
| `POST` | `/collections/cash-handover/submit` | Field agent submits daily cash handover batch | `COLLECTION_AGENT`, `SUPER_ADMIN` |
| `POST` | `/collections/cash-handover/acknowledge` | Partner acknowledges cash into vault (**Enforces** `collector_user_id != acknowledger_user_id`) | `SUPER_ADMIN`, `ACCOUNTANT`, `BRANCH_MANAGER` |

### 2.8 Module 7: Payments, Bilingual Receipts & Reversals (`/api/v1/payments`)
| Method | Endpoint | Description | Allowed Roles |
|---|---|---|---|
| `POST` | `/payments` | Record discrete payment (Requires exact $I_{net}$; throws 400 on partial or duplicate); enqueues background receipt dispatch to BullMQ `notification-queue` (Push primary, Keypad SMS fallback) | Staff |
| `GET`  | `/payments` | Query & filter payments list with pagination | Staff, Customer, Auditor |
| `GET`  | `/payments/:id` | Get single payment details & transaction history | Staff, Customer, Auditor |
| `GET`  | `/payments/:id/receipt` | Generate bilingual PDF receipt (English + Tamil) | Staff, Customer, Auditor |
| `POST` | `/payments/upi-claim` | **Customer UPI Claim**: Self-report 12-digit bank UTR reference; validates uniqueness and records payment in `INITIATED` status | `CUSTOMER`, `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT` |
| `GET`  | `/payments/pending-upi-claims` | **Claims Queue**: List pending UPI claims awaiting bank credit statement verification with pagination (`?page=1&limit=20`, max 100) | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT` |
| `POST` | `/payments/:id/verify-upi-claim` | **Checker**: Verify bank credit, transition to `SUCCESS`, issue bilingual receipt & mark due `PAID` (`maker != checker`) | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT` |
| `POST` | `/payments/:id/request-reversal` | **Maker**: Request payment reversal with mandatory reason; enqueues high-priority Partner push alert to BullMQ `notification-queue` (`JOB_DISPATCH_APPROVAL_ALERT`; excludes maker user) | `SUPER_ADMIN`, `ACCOUNTANT`, `BRANCH_MANAGER` |
| `POST` | `/payments/:id/approve-reversal` | **Checker**: Authorize and commit reversal (`maker != checker`) | `SUPER_ADMIN` |
| `POST` | `/payments/:id/reject-reversal` | **Checker**: Dismiss reversal request | `SUPER_ADMIN` |

### 2.9 Module 8: Prize Disbursements & Safety Proof Checklist (`/api/v1/disbursements`)
| Method | Endpoint | Description | Allowed Roles |
|---|---|---|---|
| `GET`  | `/disbursements` | List prize disbursement records across schemes with pagination | Staff, Auditor |
| `GET`  | `/disbursements/auction/:auctionId` | View auction winner details & disbursement status | Staff, Member, Auditor |
| `POST` | `/disbursements/auction/:auctionId/upload-safety-proof` | **Maker**: Upload photos of signed agreement & blank cheques (multipart/form-data) to S3 | Staff |
| `GET`  | `/disbursements/auction/:auctionId/safety-proof-url` | **Checker**: Generate 15-minute presigned viewing URL to inspect safety proof photos | Staff, Auditor |
| `POST` | `/disbursements/auction/:auctionId/verify-safety-proof` | **Maker**: Verify safety proof checklist (agreement, nominee, blank cheques, scans); enqueues high-priority Partner push alert to BullMQ `notification-queue` (`JOB_DISPATCH_APPROVAL_ALERT`; excludes maker user) | `SUPER_ADMIN`, `ACCOUNTANT`, `BRANCH_MANAGER` |
| `POST` | `/disbursements/auction/:auctionId/authorize-payout` | **Checker**: Authorize payout voucher (Cheque, NEFT/RTGS/IMPS, Cash; `maker != checker`) | `SUPER_ADMIN` |
| `POST` | `/disbursements/auction/:auctionId/disburse` | Record payout release reference & generate bilingual voucher | `ACCOUNTANT`, `SUPER_ADMIN` |
| `GET`  | `/disbursements/auction/:auctionId/voucher` | Generate bilingual prize payout voucher (English + தமிழ்) | Staff, Member, Auditor |
| `POST` | `/disbursements/group/:chitGroupId/final-settlement` | **Month N Settlement**: Direct payout to final subscriber without auction (Less 4% commission; completes chit) | `SUPER_ADMIN` |

### 2.10 Module 9: Dashboards & Statutory Reports (`/api/v1/reports`)
| Method | Endpoint | Description | Allowed Roles |
|---|---|---|---|
| `GET`  | `/reports/dashboard` | Executive KPI dashboard & vault metrics | Staff, Auditor |
| `GET`  | `/reports/pending-approvals` | Aggregated Maker-Checker pending approvals queue | Staff, Auditor |
| `GET`  | `/reports/approvals-stream` | Real-time Server-Sent Events (SSE) stream for live pending approval counts | Staff, Auditor |
| `GET`  | `/reports/day-book` | Daily collection & disbursement journal (HTTP 304 ETag cached for past closed dates) | Staff, Auditor |
| `GET`  | `/reports/form-xxii` | Form XXII: Cash Book (Physical Cash Only; HTTP 304 ETag cached; `UNVERIFIED-LEGAL`) | Staff, Auditor |
| `GET`  | `/reports/form-xvii` | Form XVII: Auction Minutes Consolidated Register (HTTP 304 ETag cached; `UNVERIFIED-LEGAL`) | Staff, Auditor |
| `GET`  | `/reports/form-xxi` | Form XXI: Subscriber Ledger Register (`UNVERIFIED-LEGAL`) | Staff, Customer, Auditor |
| `GET`  | `/reports/defaulters` | Overdue members with 1M, 2M, 3M aging buckets | Staff, Auditor |
| `GET`  | `/reports/audit-logs` | Immutable audit trail of dual-control actions | Staff, Customer, Auditor |

### 2.11 Component 1: Encrypted Storage Service (`/api/v1/storage`)
| Method | Endpoint | Description | Allowed Roles |
|---|---|---|---|
| `GET`  | `/storage/file/:key` | Authenticated stream of stored files (Local driver fallback with 15-minute presigned lifespan) | Staff, Customer, Auditor |

### 2.12 Component 2: Bilingual PDF Canvas Engine (`/api/v1/pdf`)
| Method | Endpoint | Description | Allowed Roles |
|---|---|---|---|
| `GET`  | `/pdf/receipt/:paymentId` | Stream or download bilingual A5 subscription receipt PDF (Ownership-guarded) | Staff, Customer, Auditor |
| `GET`  | `/pdf/voucher/:auctionId` | Stream or download bilingual prize payout voucher PDF (Ownership-guarded) | Staff, Customer, Auditor |
| `GET`  | `/pdf/minutes/:auctionId` | Stream or download Form XVII statutory auction minutes PDF (Branch-guarded) | Staff, Auditor |
| `GET`  | `/pdf/passbook/:ticketId` | Stream or download Form XXI 20-month passbook statement PDF (Ownership-guarded) | Staff, Customer, Auditor |

### 2.13 Component 3: BullMQ Background Jobs & Queue Monitor (`/api/v1/jobs`, `/admin/queues`)
| Method | Endpoint | Description | Allowed Roles |
|---|---|---|---|
| `POST` | `/jobs/run-daily-arrears` | Manually trigger daily midnight arrears recalculation & default tagging | `SUPER_ADMIN`, `BRANCH_MANAGER` |
| `POST` | `/jobs/enqueue-daily-arrears` | Enqueue daily arrears check job onto BullMQ conveyor belt | `SUPER_ADMIN` |
| `POST` | `/jobs/run-reconciliation` | Manually trigger payment settlement reconciliation | `SUPER_ADMIN`, `ACCOUNTANT` |
| `POST` | `/jobs/enqueue-reconciliation` | Enqueue payment reconciliation job onto BullMQ queue | `SUPER_ADMIN`, `ACCOUNTANT` |
| `POST` | `/jobs/send-auction-reminder/:chitGroupId/:month` | Broadcast bilingual upcoming auction reminder to subscribers | `SUPER_ADMIN`, `BRANCH_MANAGER` |
| `POST` | `/jobs/run-pre-auction-scan` | Manually trigger pre-auction scan & reminder broadcast (default 3 days ahead) | `SUPER_ADMIN`, `BRANCH_MANAGER` |
| `GET`  | `/jobs/repeatable-schedules` | List active BullMQ repeatable cron jobs and next execution timestamps | `SUPER_ADMIN`, `AUDITOR` |
| `GET`  | `/jobs/queue-status` | Inspect BullMQ queue health and active/waiting/failed job counts | `SUPER_ADMIN`, `BRANCH_MANAGER`, `AUDITOR` |
| `GET`  | `/jobs/notification-audit-logs` | Retrieve audit history of dispatched Push Notifications and DLT SMS messages | `SUPER_ADMIN`, `AUDITOR` |
| `GET/UI`| `/admin/queues` | **Bull Board Visual Dashboard**: Real-time queue inspection & dead letter retry | Basic Auth (`BULL_BOARD_USER`) |

### 2.14 Foundation: System Health & Observability (`/`, `/health`, `/metrics`)
| Method | Endpoint | Description | Allowed Roles |
|---|---|---|---|
| `GET`  | `/` | System identification and welcome root endpoint | Public |
| `GET`  | `/health` | Terminus health check (Database connectivity & memory threshold) | Public |
| `GET`  | `/health/sentry-test` | Sentry exception verification endpoint | Public |
| `GET`  | `/metrics` | Prometheus metrics scrape endpoint (HTTP latencies, BullMQ queues & chit fund KPIs) | Basic Auth (`METRICS_USER`) |

---

## 3. Detailed Specifications for Category A Operational & Maintenance Endpoints

This section provides granular contract specifications (request bodies, response schemas, status codes, and architectural invariants) for the 10 Category A endpoints.

### 3.1 `GET /api/v1/auth/me` (Dual Staff & Customer Persona Profile)
- **HTTP Method**: `GET`
- **Authentication**: `Bearer <JWT_ACCESS_TOKEN>`
- **Authorized Personas**: `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, `COLLECTION_AGENT`, `CUSTOMER`, `AUDITOR`
- **Description**: Returns authenticated profile metadata. Dynamically queries `User` table for staff or `Customer` table for subscribers with role `CUSTOMER`, eliminating 404 crashes for mobile subscribers.
- **Success Response (`HTTP 200 OK`)**:
  ```json
  {
    "success": true,
    "statusCode": 200,
    "timestamp": "2026-10-23T19:37:32.889Z",
    "data": {
      "id": "6cb8a9e8-e371-42c8-bf3e-c3b72216bfb8",
      "name": "K. Thangavel",
      "fullNameTamil": "கே. தங்கவேல்",
      "phone": "9842100101",
      "roles": ["CUSTOMER"],
      "customerCode": "KC-CUST-00101",
      "branchId": "07c70d9d-a8aa-45d3-b34e-15a2dd0cc88c",
      "isTotpEnabled": false,
      "hasMpin": false,
      "isKycVerified": true,
      "lastLoginAt": null,
      "branch": {
        "id": "07c70d9d-a8aa-45d3-b34e-15a2dd0cc88c",
        "code": "PRD",
        "name": "Head Office - Perundurai",
        "nameTamil": "தலைமை கிளை - பெருந்துறை"
      }
    }
  }
  ```
- **Error Codes**: `401 Unauthorized` (Invalid/expired token), `404 Not Found` (Profile deleted).

---

### 3.2 `POST /api/v1/auth/change-password` (Staff Self-Service Password Change)
- **HTTP Method**: `POST`
- **Authentication**: `Bearer <JWT_ACCESS_TOKEN>` (Staff)
- **Authorized Personas**: `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, `COLLECTION_AGENT`
- **Description**: Enables authenticated staff to update their login password. Validates existing password against stored bcrypt hash, re-hashes new password (cost factor 12), and revokes active refresh tokens to prevent session hijacking.
- **Request Body (`ChangePasswordDto`)**:
  ```json
  {
    "currentPassword": "Agent@Kumaran2026",
    "newPassword": "NewAgentPassword#2026"
  }
  ```
- **Validation Rules**: `currentPassword` required; `newPassword` minimum 8 characters.
- **Success Response (`HTTP 200 OK`)**:
  ```json
  {
    "success": true,
    "statusCode": 200,
    "timestamp": "2026-10-23T19:37:34.392Z",
    "data": {
      "success": true,
      "message": "Password successfully changed. Active refresh tokens have been revoked. Please log in with your new password."
    }
  }
  ```
- **Error Codes**: `400 Bad Request` (Validation failure / password complexity), `401 Unauthorized` (Invalid current password).

---

### 3.3 `POST /api/v1/users/:id/reset-password` (Super Admin Forced Credential Reset)
- **HTTP Method**: `POST`
- **Authentication**: `Bearer <JWT_ACCESS_TOKEN>` (`Role.SUPER_ADMIN` only)
- **Path Parameter**: `id` — Staff user UUID
- **Description**: Super Admin forcibly resets a staff account password to a specified or auto-generated secure temporary password and revokes all active sessions (`refreshTokenHash = NULL`).
- **Request Body (`ResetPasswordDto`)**:
  ```json
  {
    "temporaryPassword": "AdminForcedReset@999"
  }
  ```
- **Validation Rules**: `temporaryPassword` optional (if omitted, system auto-generates a 12-character high-entropy secret; if provided, minimum 8 characters).
- **Success Response (`HTTP 200 OK`)**:
  ```json
  {
    "success": true,
    "statusCode": 200,
    "timestamp": "2026-10-23T19:37:35.659Z",
    "data": {
      "success": true,
      "message": "Password for staff user R. Murugan has been reset successfully. Active sessions have been revoked.",
      "temporaryPassword": "AdminForcedReset@999"
    }
  }
  ```
- **Error Codes**: `403 Forbidden` (Non-Super Admin caller), `404 Not Found` (Staff user not found).

---

### 3.4 `DELETE /api/v1/customers/:id/documents/:docId` (Delete KYC Document Scan)
- **HTTP Method**: `DELETE`
- **Authentication**: `Bearer <JWT_ACCESS_TOKEN>`
- **Authorized Personas**: `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, `CUSTOMER` (Self unverified only)
- **Path Parameters**:
  - `id` — Customer UUID
  - `docId` — CustomerDocument UUID
- **Description**: Permanently deletes an unreadable, blurry, or mistakenly uploaded KYC document from private S3 cloud storage (`kumaran-chits-private`) and deletes the record from PostgreSQL `CustomerDocument` table.
- **Architectural Guard**: Once a document is marked `verified = true`, deletion strictly requires `Role.SUPER_ADMIN` authorization. Subscribers can only delete unverified documents for their own profile.
- **Success Response (`HTTP 200 OK`)**:
  ```json
  {
    "success": true,
    "statusCode": 200,
    "timestamp": "2026-10-23T19:38:59.850Z",
    "data": {
      "success": true,
      "message": "KYC document (aadhaar_front_sundaram.jpg) successfully deleted."
    }
  }
  ```
- **Error Codes**: `403 Forbidden` (Anti-IDOR violation or attempting to delete verified document without Super Admin role), `404 Not Found` (Customer or document not found).

---

### 3.5 `PATCH /api/v1/chits/:id` (Update Draft Chit Scheme Parameters)
- **HTTP Method**: `PATCH`
- **Authentication**: `Bearer <JWT_ACCESS_TOKEN>` (`Role.SUPER_ADMIN` only)
- **Path Parameter**: `id` — Chit Group UUID
- **Description**: Modifies chit group name (English & Tamil), scheduled start/end dates, or statutory Chit Registrar sanction order metadata.
- **Architectural Guard**: Strictly permitted exclusively while scheme status is `DRAFT`. Returns `HTTP 400 Bad Request` once the scheme has been activated or entered Month 1.
- **Request Body (`UpdateChitGroupDto`)**:
  ```json
  {
    "groupName": "₹1 Lakh 20 Months Test Group - Updated",
    "groupNameTamil": "₹1 லட்சம் 20 மாதங்கள் நேரலை குழு - திருத்தப்பட்டது",
    "startDate": "2026-11-15T00:00:00.000Z",
    "endDate": "2028-07-15T00:00:00.000Z",
    "sanctionOrderNumber": "ROC/ERD/CHIT/2026/099-REV",
    "sanctionDate": "2026-10-10T00:00:00.000Z"
  }
  ```
- **Success Response (`HTTP 200 OK`)**: Returns updated `ChitGroupResponseDto` with status `DRAFT`.
- **Error Codes**: `400 Bad Request` (Scheme is not in `DRAFT` status), `403 Forbidden` (Caller is not Super Admin), `404 Not Found` (Chit scheme not found).

---

### 3.6 `DELETE /api/v1/chits/:id/tickets/:ticketNumber` (Unassign Ticket in DRAFT Status)
- **HTTP Method**: `DELETE`
- **Authentication**: `Bearer <JWT_ACCESS_TOKEN>`
- **Authorized Personas**: `SUPER_ADMIN`, `BRANCH_MANAGER`
- **Path Parameters**:
  - `id` — Chit Group UUID
  - `ticketNumber` — Ticket Number integer ($1 \le \text{ticketNumber} \le N$)
- **Description**: Frees a mistakenly allocated ticket while scheme is in `DRAFT` status before Month 1 activation, enabling re-allocation to the correct subscriber.
- **Architectural Guard**: Prohibited once scheme status transitions to `ACTIVE`.
- **Success Response (`HTTP 200 OK`)**:
  ```json
  {
    "success": true,
    "statusCode": 200,
    "timestamp": "2026-10-23T19:41:32.750Z",
    "data": {
      "success": true,
      "message": "Ticket #2 allocated to M. Palanisamy has been unassigned successfully."
    }
  }
  ```
- **Error Codes**: `400 Bad Request` (Scheme is not in `DRAFT` status), `404 Not Found` (Ticket number or chit group not found).

---

### 3.7 `POST /api/v1/tickets/:id/settle-removal` (Defaulter Exit Account Settlement)
- **HTTP Method**: `POST`
- **Authentication**: `Bearer <JWT_ACCESS_TOKEN>`
- **Authorized Personas**: `SUPER_ADMIN`, `ACCOUNTANT`
- **Path Parameter**: `id` — Subscriber Ticket UUID
- **Description**: Calculates cumulative installments paid by a subscriber removed under 3-month consecutive default (`REMOVED_DEF_3M`), deducts 4.00% Foreman Commission damages ($V \times 0.04$), issues an exit settlement refund voucher, and records an immutable audit log.
- **Formula**:
  $$\text{Refund Amount} = \max(0, \text{Total Paid} - (V \times 0.04))$$
- **Request Body (`SettleRemovalDto`)**:
  ```json
  {
    "paymentMethod": "CASH",
    "notes": "Settled remaining refund after 4% contractual damages deduction per Foreman approval."
  }
  ```
- **Success Response (`HTTP 200 OK`)**:
  ```json
  {
    "success": true,
    "statusCode": 200,
    "timestamp": "2026-10-23T19:45:53.336Z",
    "data": {
      "success": true,
      "message": "Defaulter account for R. Velumani (Ticket #19) successfully settled.",
      "ticketId": "5f44d078-d402-4cb2-96e5-cf91396e8c7d",
      "ticketNumber": 19,
      "customerName": "R. Velumani",
      "groupCode": "KC-LIVE-20M-01",
      "totalPaid": 0,
      "damagesDeducted": 4000,
      "refundAmount": 0,
      "voucherNumber": "KC-VOU-DEF-753336",
      "settledAt": "2026-10-23T19:45:53.336Z"
    }
  }
  ```
- **Error Codes**: `400 Bad Request` (Ticket status is not `REMOVED_DEF_3M`), `404 Not Found` (Subscriber ticket not found).

---

### 3.8 `POST /api/v1/tickets/:id/substitute` (ADR-13 Subscriber Substitution)
- **HTTP Method**: `POST`
- **Authentication**: `Bearer <JWT_ACCESS_TOKEN>` (`Role.SUPER_ADMIN` only)
- **Path Parameter**: `id` — Subscriber Ticket UUID
- **Description**: Assigns a new KYC-verified customer to a ticket vacated under `REMOVED_DEF_3M`. Restores ticket status to `ACTIVE`, resets `consecutiveUnpaidMonths = 0`, clears removal timestamps, and logs an audit trail.
- **Architectural Guard (ADR-13)**: Strictly enforces that the replacement customer does NOT already hold another ticket in the same chit group (`@@unique([chitGroupId, customerId])`). Returns `HTTP 409 Conflict` on duplicate attempt.
- **Request Body (`SubstituteSubscriberDto`)**:
  ```json
  {
    "newCustomerId": "4bea4d80-eaba-4ecd-8fb7-d3553bd31cab",
    "reason": "Previous subscriber removed for 3-month consecutive default; substituted per company policy."
  }
  ```
- **Success Response (`HTTP 200 OK`)**:
  ```json
  {
    "success": true,
    "statusCode": 200,
    "timestamp": "2026-10-23T19:45:53.800Z",
    "data": {
      "success": true,
      "message": "Subscriber replacement successfully executed. Ticket #19 re-assigned to A. Ravichandran and restored to ACTIVE status.",
      "ticket": {
        "id": "5f44d078-d402-4cb2-96e5-cf91396e8c7d",
        "ticketNumber": 19,
        "status": "ACTIVE",
        "previousCustomerId": "f808a42a-b2e7-4912-b2d0-54fd8c2f6601",
        "previousCustomerName": "R. Velumani",
        "newCustomerId": "4bea4d80-eaba-4ecd-8fb7-d3553bd31cab",
        "newCustomerName": "A. Ravichandran"
      }
    }
  }
  ```
- **Error Codes**: `400 Bad Request` (Ticket not in `REMOVED_DEF_3M` status or replacement customer KYC unverified), `404 Not Found` (Ticket or customer profile not found), `409 Conflict` (ADR-13 violation: customer already holds a ticket in this group).

---

### 3.9 `POST /api/v1/disbursements/auction/:id/upload-safety-proof` (Maker S3 Collateral Upload)
- **HTTP Method**: `POST`
- **Content-Type**: `multipart/form-data`
- **Authentication**: `Bearer <JWT_ACCESS_TOKEN>`
- **Authorized Personas**: `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT` (Desk Maker)
- **Path Parameter**: `id` — Auction UUID
- **Description**: Uploads photos of signed blank cheques, promissory notes, or signed subscriber/nominee agreement into private S3 cloud storage (`safety-proofs/{auctionId}/...`) and links the S3 key directly to the `AuctionWinner` record.
- **Multipart Form Payload**: `file` — Binary JPEG/PNG/PDF stream (up to 10 MB).
- **Success Response (`HTTP 201 Created`)**:
  ```json
  {
    "success": true,
    "statusCode": 201,
    "timestamp": "2026-10-23T19:48:32.313Z",
    "data": {
      "success": true,
      "message": "Safety proof collateral document uploaded and linked successfully.",
      "auctionId": "158898f8-0b5e-4836-8c8e-5a5aa2cbad55",
      "securityDocS3Key": "safety-proofs/158898f8-0b5e-4836-8c8e-5a5aa2cbad55/1792784912285_signed_blank_cheques_sundaram.jpg",
      "fileName": "signed_blank_cheques_sundaram.jpg",
      "uploadedAt": "2026-10-23T19:48:32.313Z"
    }
  }
  ```
- **Error Codes**: `400 Bad Request` (Missing file or unsupported file format), `404 Not Found` (Auction or auction winner record not found).

---

### 3.10 `GET /api/v1/disbursements/auction/:id/safety-proof-url` (Checker 15-Minute Presigned Viewing URL)
- **HTTP Method**: `GET`
- **Authentication**: `Bearer <JWT_ACCESS_TOKEN>`
- **Authorized Personas**: `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, `AUDITOR` (Checker Inspection)
- **Path Parameter**: `id` — Auction UUID
- **Description**: Generates an S3 storage (Cloudflare R2 / MinIO) time-limited presigned viewing URL (strictly 15 minutes / 900 seconds TTL) for Partner B (Checker) or Auditor to visually inspect uploaded blank cheques and agreements before clicking Authorize Payout.
- **Success Response (`HTTP 200 OK`)**:
  ```json
  {
    "success": true,
    "statusCode": 200,
    "timestamp": "2026-10-23T19:48:32.618Z",
    "data": {
      "url": "http://127.0.0.1:9000/kumaran-chits-private/safety-proofs/158898f8-0b5e-4836-8c8e-5a5aa2cbad55/1792784912285_signed_blank_cheques_sundaram.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=900&...",
      "expiresInSeconds": 900,
      "securityDocS3Key": "safety-proofs/158898f8-0b5e-4836-8c8e-5a5aa2cbad55/1792784912285_signed_blank_cheques_sundaram.jpg"
    }
  }
  ```
- **Error Codes**: `404 Not Found` (Auction, winner, or uploaded document key not found).

---

### 3.11 Financial Input DTO Invariants & Zero-Paise Enforcement (Rule 2 in AGENTS.md)
All financial mutation endpoints enforce strict `@IsInt()` whole-rupee validation via NestJS `ValidationPipe`. Any request containing fractional decimals (e.g. `3950.50`, `22000.25`), negative numbers, zero (on positive endpoints), or non-numeric types is rejected immediately with `HTTP 400 Bad Request`:
- `CreatePaymentDto.amount`: `@IsInt()`, `@IsPositive()` (Whole Rupees)
- `RecordCollectionDto.amount`: `@IsInt()`, `@IsPositive()` (Whole Rupees)
- `AcknowledgeHandoverDto.acknowledgedAmount`: `@IsInt()`, `@IsPositive()` (Whole Rupees)
- `RecordBidDto.bidDiscount`: `@IsInt()`, `@IsPositive()` ($C_f \le D \le V/4$)
- `RecordTieBreakDto.bidDiscount`: `@IsInt()`, `@IsPositive()` (Exact $V/4$ ceiling)
- `CreateChitGroupDto.chitValue`: `@IsInt()`, `@IsPositive()` (Whole Rupees)
- `OnboardOngoingChitDto.chitValue`: `@IsInt()`, `@IsPositive()` (Whole Rupees)

---

## 4. Related Architecture & Contract Documents

- **OpenAPI 3.0 Contract (JSON)**: [`docs/03-architecture/openapi-spec.json`](openapi-spec.json)
- **TypeScript Client SDK Types**: [`docs/03-architecture/openapi-types.ts`](openapi-types.ts)
- **Complete Payload Specimen Catalog**: [`docs/03-architecture/api-request-response-catalog.md`](api-request-response-catalog.md)
- **Granular 6-Persona Access Registry**: [`docs/03-architecture/completed-modules-api-registry.md`](completed-modules-api-registry.md)
