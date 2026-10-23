# Kumaran Chits — REST API Specification & Contract

> **Product**: **Kumaran Chits** (Kumaran Finance, Perundurai, Erode, Tamil Nadu)  
> **Base URL**: `/api/v1` (Global prefix `/api`, URI versioning `v1`)  
> **Documentation Tool**: OpenAPI 3.0 / Swagger (`/api/docs`)  
> **Contract Source of Truth**: [`docs/03-architecture/openapi-spec.json`](openapi-spec.json) & [`docs/03-architecture/completed-modules-api-registry.md`](completed-modules-api-registry.md)  
> **Total Verified Scope**: **111 operations across 105 paths** (100% automated test coverage, 419 passing tests across 24 unit suites and 10 E2E suites).

---

## 1. Global Request & Response Conventions

### 1.1 Required HTTP Headers
| Header Name | Type | Description |
|---|---|---|
| `Authorization` | String | `Bearer <JWT_ACCESS_TOKEN>` for all authenticated endpoints |
| `Content-Type` | String | `application/json` (or `multipart/form-data` for KYC document uploads) |
| `Idempotency-Key` | String | Unique UUID required on financial mutation endpoints (`POST /payments`, `POST /collections/record`, `POST /collections/sync-offline-queue`, `POST /payments/:id/request-reversal`) to prevent duplicate transactions on network retries |

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
| `POST` | `/auth/mobile/request-otp` | Request 6-digit SMS OTP for mobile device registration or login (DLT Template 1407169823412093847) | Public (Throttled) |
| `POST` | `/auth/mobile/verify-otp` | Verify 6-digit SMS OTP; returns `setupToken` for staff or full session tokens for customers | Public (Throttled) |
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
| `GET`  | `/auctions/group/:id` | List past auctions, winners & dividend history for group | All Authenticated |
| `GET`  | `/auctions/:id` | Get single auction record & tie-break results | All Authenticated |
| `GET`  | `/auctions/:id/eligible-bidders` | **Pre-Auction Guard**: Active non-prized subscribers with 0 arrears | Staff, Auditor |
| `POST` | `/auctions/:id/record-bid` | **Maker**: Enter winning ticket & bid discount ($D \le V/4$) | `SUPER_ADMIN`, `BRANCH_MANAGER` |
| `POST` | `/auctions/:id/tie-break` | **Option A (Physical Draw)**: Record paper token lot draw winner | `SUPER_ADMIN`, `BRANCH_MANAGER` |
| `POST` | `/auctions/:id/finalize` | **Checker**: Commit auction result & generate dues (`maker != checker`) | `SUPER_ADMIN`, `BRANCH_MANAGER` |
| `GET`  | `/auctions/:id/minutes` | View Form XVII statutory auction minutes summary | Staff, Auditor |
| `PATCH`| `/auctions/:id/mark-filed-with-registrar` | Record physical filing of Form XVII at Registrar of Chits | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT` |

### 2.6 Module 5: Installments, Digital Passbook & Defaulters (`/api/v1/tickets`, `/api/v1/installments`)
| Method | Endpoint | Description | Allowed Roles |
|---|---|---|---|
| `GET`  | `/tickets/:id/dues` | Full monthly dues schedule for ticket | Staff, Member, Auditor |
| `GET`  | `/tickets/:id/passbook` | Detailed 6-column digital passbook ledger statement | Staff, Member, Auditor |
| `GET`  | `/tickets/defaulters` | List subscribers with continuous arrears | Staff, Auditor |
| `POST` | `/tickets/:id/remove-defaulter` | **Defaulter Removal**: Execute removal after 3 continuous months arrears (`REMOVED_DEF_3M`) | `SUPER_ADMIN` |
| `POST` | `/tickets/:id/substitute` | **Defaulter Substitution**: Assign replacement customer to `REMOVED_DEF_3M` ticket (ADR-13) | `SUPER_ADMIN` |
| `POST` | `/tickets/:id/settle-removal` | **Exit Settlement**: Settle defaulter account with refund minus 4% contractual damages voucher | `SUPER_ADMIN`, `ACCOUNTANT` |
| `GET`  | `/installments/group/:id/month/:m` | View member dues list for specified month | Staff, Auditor |
| `POST` | `/installments/group/:id/month/:m/generate` | Generate dues from auction dividend | `SUPER_ADMIN`, `BRANCH_MANAGER` |

### 2.7 Module 6: Field Collections & Cash Handover (`/api/v1/collections`)
| Method | Endpoint | Description | Allowed Roles |
|---|---|---|---|
| `GET`  | `/collections/agent-dues` | View dues assigned for field collection rounds | `COLLECTION_AGENT`, `ACCOUNTANT`, `SUPER_ADMIN` |
| `POST` | `/collections/record` | Record doorstep cash collection (Exact $I_{net}$; throws 400 on partial) | `COLLECTION_AGENT`, `ACCOUNTANT`, `BRANCH_MANAGER`, `SUPER_ADMIN` |
| `POST` | `/collections/sync-offline-queue` | Batch sync offline field collection queue (1 to 100 items with item-level failure isolation & idempotency) | `COLLECTION_AGENT`, `ACCOUNTANT`, `BRANCH_MANAGER`, `SUPER_ADMIN` |
| `GET`  | `/collections/daily-summary` | View today's collection register & vault cash | Staff, Auditor |
| `POST` | `/collections/cash-handover/submit` | Field agent submits daily cash handover batch | `COLLECTION_AGENT`, `SUPER_ADMIN` |
| `POST` | `/collections/cash-handover/acknowledge` | Partner acknowledges cash into vault (**Enforces** `collector_user_id != acknowledger_user_id`) | `SUPER_ADMIN`, `ACCOUNTANT`, `BRANCH_MANAGER` |

### 2.8 Module 7: Payments, Bilingual Receipts & Reversals (`/api/v1/payments`)
| Method | Endpoint | Description | Allowed Roles |
|---|---|---|---|
| `POST` | `/payments` | Record discrete payment (Requires exact $I_{net}$; throws 400 on partial or duplicate) | Staff |
| `GET`  | `/payments` | Query & filter payments list with pagination | Staff, Customer, Auditor |
| `GET`  | `/payments/:id` | Get single payment details & transaction history | Staff, Customer, Auditor |
| `GET`  | `/payments/:id/receipt` | Generate bilingual PDF receipt (English + Tamil) | Staff, Customer, Auditor |
| `POST` | `/payments/:id/request-reversal` | **Maker**: Request payment reversal with mandatory reason | `SUPER_ADMIN`, `ACCOUNTANT`, `BRANCH_MANAGER` |
| `POST` | `/payments/:id/approve-reversal` | **Checker**: Authorize and commit reversal (`maker != checker`) | `SUPER_ADMIN` |
| `POST` | `/payments/:id/reject-reversal` | **Checker**: Dismiss reversal request | `SUPER_ADMIN` |

### 2.9 Module 8: Prize Disbursements & Safety Proof Checklist (`/api/v1/disbursements`)
| Method | Endpoint | Description | Allowed Roles |
|---|---|---|---|
| `GET`  | `/disbursements` | List prize disbursement records across schemes with pagination | Staff, Auditor |
| `GET`  | `/disbursements/auction/:id` | View auction winner details & disbursement status | Staff, Member, Auditor |
| `POST` | `/disbursements/auction/:id/upload-safety-proof` | **Maker**: Upload photos of signed agreement & blank cheques (multipart/form-data) to S3 | Staff |
| `GET`  | `/disbursements/auction/:id/safety-proof-url` | **Checker**: Generate 15-minute presigned viewing URL to inspect safety proof photos | Staff, Auditor |
| `POST` | `/disbursements/auction/:id/verify-safety-proof` | **Maker**: Verify safety proof checklist (agreement, nominee, blank cheques, scans) | `SUPER_ADMIN`, `ACCOUNTANT`, `BRANCH_MANAGER` |
| `POST` | `/disbursements/auction/:id/authorize-payout` | **Checker**: Authorize payout voucher (Cheque, NEFT/RTGS/IMPS, Cash; `maker != checker`) | `SUPER_ADMIN` |
| `POST` | `/disbursements/auction/:id/disburse` | Record payout release reference & generate bilingual voucher | `ACCOUNTANT`, `SUPER_ADMIN` |
| `GET`  | `/disbursements/auction/:id/voucher` | Generate bilingual prize payout voucher (English + தமிழ்) | Staff, Member, Auditor |
| `POST` | `/disbursements/group/:chitGroupId/final-settlement` | **Month N Settlement**: Direct payout to final subscriber without auction (Less 4% commission; completes chit) | `SUPER_ADMIN` |

### 2.10 Module 9: Dashboards & Statutory Reports (`/api/v1/reports`)
| Method | Endpoint | Description | Allowed Roles |
|---|---|---|---|
| `GET`  | `/reports/dashboard` | Executive KPI dashboard & vault metrics | Staff, Auditor |
| `GET`  | `/reports/pending-approvals` | Aggregated Maker-Checker pending approvals queue | Staff, Auditor |
| `GET`  | `/reports/approvals-stream` | Real-time Server-Sent Events (SSE) stream for live pending approval counts | Staff, Auditor |
| `GET`  | `/reports/day-book` | Daily collection & disbursement journal | Staff, Auditor |
| `GET`  | `/reports/form-xxii` | Form XXII: Cash Book (Physical Cash Only; `UNVERIFIED-LEGAL`) | Staff, Auditor |
| `GET`  | `/reports/form-xvii` | Form XVII: Auction Minutes Consolidated Register (`UNVERIFIED-LEGAL`) | Staff, Auditor |
| `GET`  | `/reports/form-xxi` | Form XXI: Subscriber Ledger Register (`UNVERIFIED-LEGAL`) | Staff, Customer, Auditor |
| `GET`  | `/reports/defaulters` | Overdue members with 1M, 2M, 3M aging buckets | Staff, Auditor |
| `GET`  | `/reports/audit-logs` | Immutable audit trail of dual-control actions | Staff, Customer, Auditor |

### 2.11 Component 1: Encrypted Storage Service (`/api/v1/storage`)
| Method | Endpoint | Description | Allowed Roles |
|---|---|---|---|
| `GET`  | `/storage/file/:key(*)` | Authenticated stream of stored files (Local driver fallback with 15-minute presigned lifespan) | Staff, Customer, Auditor |

### 2.12 Component 2: Bilingual PDF Canvas Engine (`/api/v1/pdf`)
| Method | Endpoint | Description | Allowed Roles |
|---|---|---|---|
| `GET`  | `/pdf/receipt/:paymentId` | Stream or download bilingual 80mm subscription receipt PDF (Ownership-guarded) | Staff, Customer, Auditor |
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

## 3. Related Architecture & Contract Documents

- **OpenAPI 3.0 Contract (JSON)**: [`docs/03-architecture/openapi-spec.json`](openapi-spec.json)
- **TypeScript Client SDK Types**: [`docs/03-architecture/openapi-types.ts`](openapi-types.ts)
- **Complete Payload Specimen Catalog**: [`docs/03-architecture/api-request-response-catalog.md`](api-request-response-catalog.md)
- **Granular 6-Persona Access Registry**: [`docs/03-architecture/completed-modules-api-registry.md`](completed-modules-api-registry.md)
