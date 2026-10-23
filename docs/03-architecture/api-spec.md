# Kumaran Chits — REST API Specification & Contract

> **Product**: **Kumaran Chits** (Kumaran Finance)  
> **Base URL**: `https://api.kumaranfinance.com/api/v1`  
> **Documentation Tool**: OpenAPI 3.0 / Swagger (`/api/docs`)

---

## 1. Global Request & Response Conventions

### 1.1 Required HTTP Headers
| Header Name | Type | Description |
|---|---|---|
| `Authorization` | String | `Bearer <JWT_ACCESS_TOKEN>` for all authenticated endpoints |
| `Content-Type` | String | `application/json` (or `multipart/form-data` for KYC document uploads) |
| `X-Branch-Id` | UUID | Active branch context for staff users |
| `Idempotency-Key` | String | Unique UUID required on all financial mutation endpoints (`POST /payments`, `/reversals`) to prevent duplicate transactions on retries |

### 1.2 Standard Response Envelopes

#### Success Envelope (HTTP 200 / 201)
```json
{
  "success": true,
  "statusCode": 200,
  "timestamp": "2026-10-17T10:30:00.000Z",
  "data": { ... }
}
```

#### Error Envelope (HTTP 4xx / 5xx)
```json
{
  "success": false,
  "statusCode": 400,
  "timestamp": "2026-10-17T10:30:00.000Z",
  "error": {
    "code": "INVALID_BID_DISCOUNT",
    "message": "Bid discount ₹28,000 exceeds maximum allowable 1/4 ceiling of 25% (₹25,000)",
    "details": []
  }
}
```

---

## 2. API Endpoints Catalog

### 2.1 Authentication & Security (`/auth`)
| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/auth/mobile/register-device` | Initiate device registration with Phone number | Public |
| `POST` | `/auth/mobile/verify-otp` | Verify SMS OTP; returns device binding token | Public |
| `POST` | `/auth/mobile/set-mpin` | Establish 6-digit MPIN for the registered device | Device Token |
| `POST` | `/auth/mobile/login-mpin` | Login using Phone + 6-digit MPIN | Public |
| `POST` | `/auth/mobile/login-biometric` | Login using cryptographic biometric device signature | Public |
| `POST` | `/auth/web/login` | Office staff login with registered 10-digit Phone Number + Password | Public |
| `POST` | `/auth/web/verify-totp` | Verify 6-digit Microsoft Authenticator code | Session Token |
| `POST` | `/auth/refresh-token` | Obtain new 15-minute JWT Access Token | Refresh Token |
| `POST` | `/auth/logout` | Revoke active session and refresh token (clears `fcmToken`) | Bearer JWT |
| `PATCH`| `/auth/fcm-token` | Register or clear staff device Firebase FCM push token | Bearer JWT (Staff) |

### 2.2 Branches & Users (`/branches`, `/users`)
| Method | Endpoint | Description | Allowed Roles |
|---|---|---|---|
| `GET` | `/branches` | List all active company branches | Authenticated Staff |
| `POST` | `/branches` | Create new branch office | `SUPER_ADMIN` |
| `GET` | `/users` | List staff users (scoped to branch) | `SUPER_ADMIN`, `BRANCH_MANAGER` |
| `POST` | `/users` | Create staff user and assign roles (supports multi-role array, e.g. `[COLLECTION_AGENT, ACCOUNTANT]`) | `SUPER_ADMIN` |
| `PATCH` | `/users/:id/status` | Activate or deactivate staff user | `SUPER_ADMIN` |

### 2.3 Customers & KYC (`/customers`)
| Method | Endpoint | Description | Allowed Roles |
|---|---|---|---|
| `GET` | `/customers` | Search & list customers with pagination | Staff |
| `POST` | `/customers` | Register new customer profile | `SUPER_ADMIN`, `BRANCH_MANAGER`, `COLLECTION_AGENT` |
| `GET` | `/customers/:id` | Get customer details, active chits, and passbook | Staff, Self (Customer) |
| `POST` | `/customers/:id/documents` | Upload KYC doc (Aadhaar, PAN, Photo) to S3 | Staff |
| `GET` | `/customers/:id/documents/:docId/url` | Get 15-minute S3 presigned viewing URL | Staff |
| `PATCH`| `/customers/:id/fcm-token` | Register subscriber Firebase FCM device push token (Anti-IDOR) | Staff, Self (Customer) |

### 2.4 Chit Groups & Mid-Cycle Onboarding (`/chits`)
| Method | Endpoint | Description | Allowed Roles |
|---|---|---|---|
| `GET` | `/chits` | List chit schemes with filter by status | All |
| `POST` | `/chits/new` | Create fresh chit group (Starts Month 1) | `SUPER_ADMIN` |
| `POST` | `/chits/onboard-ongoing` | **Mid-Cycle Intake**: Onboard ongoing chit from physical notebook | `SUPER_ADMIN`, `BRANCH_MANAGER` |
| `POST` | `/chits/:id/activate` | Lock terms and activate chit scheme | `SUPER_ADMIN` |
| `GET` | `/chits/:id/tickets` | View all assigned tickets (1..N) and status | Staff, Member |

### 2.5 In-Office Auctions & Tie-Breakers (`/auctions`)
| Method | Endpoint | Description | Allowed Roles |
|---|---|---|---|
| `GET` | `/chits/:id/auctions` | View auction schedule and past results | All |
| `POST` | `/auctions/:id/record-bid` | **Maker**: Enter winning ticket and bid discount ($D \le V/4$) | `SUPER_ADMIN`, `BRANCH_MANAGER` |
| `POST` | `/auctions/:id/tie-break-record` | **Option A (Physical Draw)**: Record physically drawn paper token winner for ceiling tie | `SUPER_ADMIN`, `BRANCH_MANAGER` |
| `POST` | `/auctions/:id/finalize` | **Checker**: Commit official auction result & update dues (`maker != checker`) | `SUPER_ADMIN` |
| `GET` | `/auctions/:id/minutes/pdf` | Download signed statutory Auction Minutes PDF | Staff, Auditor |

### 2.6 Installment Dues, Passbook & Ticket Management (`/installments`, `/tickets`)
| Method | Endpoint | Description | Allowed Roles |
|---|---|---|---|
| `GET` | `/tickets/:ticketId/dues` | View full schedule of past and upcoming dues | Staff, Member |
| `GET` | `/tickets/:ticketId/passbook` | Detailed statement (Dues, Dividends, Payments) | Staff, Member |
| `POST` | `/tickets/:id/remove-defaulter` | **Defaulter Removal**: Execute company removal rights after 3 consecutive missed installments (`REMOVED_DEF_3M`) | `SUPER_ADMIN` |

### 2.7 Field Collections & Cash Handover (`/collections`)
| Method | Endpoint | Description | Allowed Roles |
|---|---|---|---|
| `GET` | `/collections/agent-dues` | List dues assigned to field agent | `COLLECTION_AGENT` |
| `POST` | `/collections/record` | Agent records collection (Requires exact $I_{net}$; throws 400 on partial or duplicate) | `COLLECTION_AGENT`, `ACCOUNTANT` |
| `POST` | `/collections/sync-offline-queue` | Batch sync offline field collection queue (1 to 100 items with item-level failure isolation & idempotency) | `COLLECTION_AGENT`, `ACCOUNTANT`, `BRANCH_MANAGER`, `SUPER_ADMIN` |
| `GET` | `/collections/daily-summary` | Summary of today's field collections | `COLLECTION_AGENT`, `SUPER_ADMIN` |
| `POST` | `/collections/cash-handover/submit` | Agent submits cash handover request | `COLLECTION_AGENT` |
| `POST` | `/collections/cash-handover/acknowledge` | Partner acknowledges cash into vault (**Enforces** `collector_user_id != acknowledger_user_id`) | `SUPER_ADMIN`, `ACCOUNTANT` |

### 2.8 Payments, Bilingual Receipts, & Reversals (`/payments`)
| Method | Endpoint | Description | Allowed Roles |
|---|---|---|---|
| `POST` | `/payments` | Record discrete payment (Requires exact $I_{net}$; throws 400 on partial or duplicate) | Staff |
| `GET` | `/payments/:id/receipt` | Generate bilingual PDF receipt (English + Tamil) | Staff, Member |
| `POST` | `/payments/:id/request-reversal` | **Maker**: Request payment reversal with reason | `SUPER_ADMIN`, `ACCOUNTANT`, `BRANCH_MANAGER` |
| `POST` | `/payments/:id/approve-reversal` | **Checker**: Authorize and commit reversal (`maker != checker`) | `SUPER_ADMIN` |

### 2.9 Prize Disbursements & Safety Proof Checklist (`/disbursements`)
| Method | Endpoint | Description | Allowed Roles |
|---|---|---|---|
| `GET` | `/disbursements` | List prize disbursement records across chit groups with pagination | Staff |
| `GET` | `/disbursements/auction/:auctionId` | View auction winner details & disbursement status | Staff, Member |
| `POST` | `/disbursements/auction/:auctionId/verify-safety-proof` | **Maker**: Verify safety proof checklist (agreement, nominee, blank cheques, promissory notes, scans) | `SUPER_ADMIN`, `ACCOUNTANT`, `BRANCH_MANAGER` |
| `POST` | `/disbursements/auction/:auctionId/authorize-payout` | **Checker**: Authorize payout voucher (Cheque, NEFT/RTGS/IMPS, Cash; `maker != checker`) | `SUPER_ADMIN` |
| `POST` | `/disbursements/auction/:auctionId/disburse` | Record payout release reference & generate bilingual voucher | `ACCOUNTANT`, `SUPER_ADMIN` |
| `GET` | `/disbursements/auction/:auctionId/voucher` | Generate bilingual prize disbursement voucher (English + தமிழ்) | Staff, Member |
| `POST` | `/disbursements/group/:chitGroupId/final-settlement` | **Month N Maturity Settlement**: Direct payout to final subscriber without auction (Less 4% Foreman Commission; marks scheme COMPLETED) | `SUPER_ADMIN` |

### 2.10 Statutory Reports, Dashboards & Real-Time Approvals (`/reports`)

> **Note on Statutory Form Labels (`UNVERIFIED-LEGAL`)**: Form numbers XVII, XXI, and XXII are working references from generic chit-fund literature. Do not treat these as confirmed Tamil Nadu statutory layouts until physical specimen forms from the Registrar of Chits are verified. See `compliance-checklist.md` §3.

| Method | Endpoint | Description | Allowed Roles |
|---|---|---|---|
| `GET` | `/reports/dashboard` | Executive KPI dashboard and vault metrics | Staff, Auditor |
| `GET` | `/reports/pending-approvals` | Aggregated Maker-Checker pending approvals queue (Handovers, Payouts, Reversals, Safety Proofs) | Staff, Auditor |
| `GET` | `/reports/approvals-stream` | Real-time Server-Sent Events (SSE) stream for live pending approval counts | Staff, Auditor |
| `GET` | `/reports/day-book` | Daily collection and disbursement journal | `ACCOUNTANT`, `SUPER_ADMIN` |
| `GET` | `/reports/form-xxi` | Form XXI: Subscriber Ledger for Registrar (`UNVERIFIED-LEGAL`) | `AUDITOR`, `SUPER_ADMIN` |
| `GET` | `/reports/form-xvii` | Form XVII: Auction Minutes Consolidated Register (`UNVERIFIED-LEGAL`) — lists all auction results, winning discounts, tied bidders, and physical draw outcomes across all months | `AUDITOR`, `SUPER_ADMIN` |
| `GET` | `/reports/form-xxii` | Form XXII: Cash Book / Day Book Register (`UNVERIFIED-LEGAL`) — daily register of all collections, agent cash handovers, and prize disbursements | `AUDITOR`, `SUPER_ADMIN` |
| `GET` | `/reports/defaulters` | List overdue members with aging buckets | Staff |
