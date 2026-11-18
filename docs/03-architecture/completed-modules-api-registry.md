# Kumaran Chits — Completed Modules API & 6-Persona RBAC Registry

> **Product**: **Kumaran Chits** (Kumaran Finance)  
> **Current Status**: **All 10 Modules, 3 System Components, Branches, Users & Infrastructure Complete**  
> **Target Audience**: Developers, Auditors, Mobile App Developers, Web Frontend Developers  
> **Quality Standard**: Zero assumptions, zero hallucinations, pure whole-rupee math (`BigInt`), and 100% automated test coverage (**1,226 API unit tests across 63 suites + 376 Web tests + 10 SDK tests + 6 Dart suites + PostgreSQL 17 / Redis 7 E2E suites**).

---

## 1. Executive Summary & Verification Metrics

| Module # & Name | HTTP Prefix | Live Ops Count | Key Invariants Enforced |
|---|---|:---:|---|
| **Foundation, Health & Metrics** | `/`, `/health`, `/metrics` | 6 | Root liveness, Terminus `/health`, `/readiness`, `/liveness`, `/sentry-test`, Prometheus APM (`MetricsAuthGuard`) |
| **Module 1: Auth & Staff Identity** | `/auth` | 15 | bcrypt (salt 10-12), RFC 6238 TOTP (Lua claim), Redis Lua SMS-OTP (300s TTL, 3 attempts), MPIN (`F01`), forced onboarding (`F16`), PostgreSQL `Session` Vault (`F04`) |
| **Branches: Company Offices** | `/branches` | 4 | Single company tenancy (ADR-01), bilingual Tamil names, branch metadata `PATCH`, branch-scoping |
| **Users: Staff Administration** | `/users` | 6 | RBAC role management, `isPartner` verified partner flag, atomic session revocation on deactivation/reset (`F02`) |
| **Module 2: Customer & KYC Intake** | `/customers` | 12 | Auto `KC-CUST-XXXXX`, bilingual names, masked `aadhaarLast4`, S3 KYC upload + direct presigned `/confirm`, 15-min presigned URLs, scan deletion |
| **Module 3: Chit Groups & Intake** | `/chits` | 12 | 4% commission lock, fixed 1/4 ceiling ($D \le V/4$), ADR-13 ticket limit, Month 1 pool, draft update/register/activate/cancel/close, ticket unassign |
| **Module 4: In-Office Auctions** | `/auctions` | 13 | Pre-auction defaulter & pending-removal block, Option A paper token draw, Partner-only Maker $\ne$ Checker finalize (`KFC-SEC-003`), finalized correction (`request`/`approve`/`reject`), Registrar filing (`COMPLETED` $\to$ `MINUTES_FILED`) |
| **Module 5: Installments & Passbook** | `/tickets`, `/installments` | 13 | Universal dividend ($I_{net} = I_{base} - Div$), single discrete due, 2-partner 3M defaulter removal (`request`/`approve`/`reject`), substitution, Q25 fail-closed `settle-removal`, NPCI UPI Intent |
| **Module 6: Collections & Handover** | `/collections` | 6 | Exact $I_{net}$ matching, offline queue sync, sequential bilingual receipt, dual control (`collector != acknowledger` + `chk_payment_cash_handover_maker_checker`), BullMQ receipt queue |
| **Module 7: Payments & Reversals** | `/payments` | 10 | Counter payments, bilingual receipt JSON, Partner-only Maker $\ne$ Checker reversal (`KFC-SEC-001`, `chk_reversal_maker_checker`), Bank UTR unique constraint, Customer UPI claims & Desk verification |
| **Module 8: Prize Disbursements** | `/disbursements` | 12 | Safety proof checklist (ADR-15), S3 proof upload & `/confirm-safety-proof`, Partner payout authorization (`KFC-FIN-004`, `PENDING_CORRECTION_LOCKOUT`), TOCTOU arrears guard (`ARREARS_STATE_CHANGED`), 2-stage Month $N$ (`CR-DISB-02`) |
| **Module 9: Reports & Dashboards** | `/reports` | 9 | Executive KPI dashboard, Form XXII physical Cash Book, Form XVII, Form XXI, 8-queue Pending Approvals, SSE stream (`@BypassEnvelope`, `F15`), `SUPER_ADMIN`-only Audit Logs |
| **Component 1: Encrypted Storage** | `/storage` | 3 | Direct presigned PUT (`POST /presigned-upload-url`), local fallback PUT (`PUT /upload/*key`), authenticated file streaming (`GET /file/*key`), default-deny prefixes (`F06`) |
| **Component 2: Bilingual PDF Canvas**| `/pdf` | 4 | A5 digital receipts (with `0.28` red cancelled watermark), A5 vouchers, A4 Form XVII, A4 Landscape Form XXI passbooks, bundled Noto Sans Tamil fonts |
| **Component 3: BullMQ Background Jobs**| `/jobs` (+ `/admin/queues` UI) | 9 (+1 UI) | 00:01 AM arrears scan, 3M default tagging, DLT SMS/Push router, 06:00 AM bank recon, 09:00 AM pre-auction scan, `SUPER_ADMIN`-only queue telemetry & Bull Board |
| **TOTAL VERIFIED LIVE SCOPE** | **18 Controllers** | **134 HTTP Ops (+1 UI)** | **All 11 Guardrails & 8 DB `CHECK` Constraints 100% Enforced (`openapi-spec.json`: 123 paths / 129 ops)** |

---

### 1.1 Automated TypeScript AST Persona Enforcement Verification

An automated AST inspection utility (`apps/api/scripts/audit/audit-persona-enforcement.ts`) parses all **18 NestJS controllers** across `apps/api/src/` using the TypeScript Compiler API (`ts.createSourceFile`, `ts.canHaveDecorators`, `ts.getDecorators`). It maps every class-level and method-level decorator (`@Roles`, `@UseGuards`, `@Get`, `@Post`, `@Patch`, `@Put`, `@Delete`, `@Sse`) to evaluate RBAC and ABAC compliance across all **134 live HTTP operations** (**14 public/non-RBAC** + **120 JWT-guarded operations**):

#### Canonical 6-Persona Scope & Enforcement Boundaries

| Persona Role | Scope & Enforcement Boundary |
|---|---|
| **`SUPER_ADMIN` (`isPartner: true`)** | Full global administrative and financial authority on Web & Mobile. `maker != checker` enforced at service and PostgreSQL engine levels (8 `CHECK` constraints). Only verified Partners can authorize reversals, auction finalizations/corrections, prize payouts, and defaulter removals. |
| **`SUPER_ADMIN` (`isPartner: false`)** | Administrative IT access (branches, staff onboarding/resets, `GET /reports/audit-logs`, `GET /jobs/*`, Bull Board `/admin/queues`), strictly barred from financial mutations under Guardrail 11 (`ADR-21`). |
| **`BRANCH_MANAGER`** | Branch-scoped customer intake, auction facilitation (`record-bid`, `tie-break`), safety proof verification, vault cash acknowledgment, and reports. Strictly blocked from scheme creation/activation, user resets, auction finalization (`KFC-SEC-003`), payment reversal initiation/approval (`KFC-SEC-001`), prize payout authorization, defaulter removal (`KFC-SEC-002`), audit logs, and BullMQ telemetry. |
| **`ACCOUNTANT`** | Company-wide financial ledger entries, mid-cycle notebook transcription (Maker), safety proof verification, payout release (`disburse`), cash handover acknowledgment, UPI claim verification, and statutory registers. Strictly blocked from user admin, scheme activation, auction bidding/finalization, payment reversals (`KFC-SEC-001`), payout authorization, audit logs, and BullMQ telemetry. |
| **`COLLECTION_AGENT`** | Scoped strictly to active-ticket customers in assigned branch. Doorstep collections, offline sync, handover submission, viewing assigned dues, generating customer UPI intent. Strictly blocked from customer KYC viewing (`403`), prize disbursements/vouchers, Form XVII minutes, passbooks, payment reversals, audit logs, and BullMQ telemetry. |
| **`CUSTOMER`** | Scoped strictly to own account (`user.phone === customer.phone` or `user.sub === customerId`). Digital passbook, own dues, dividend tracking, own receipts/vouchers (via `/pdf/*`), 1-tap UPI deep-linking, self-reported UPI claims. Strictly blocked from all staff endpoints and raw `/storage/file/receipts/*` or `vouchers/*`. |
| **`AUDITOR`** | Global read-only forensic access to Day Book, Form XXII Cash Book, Form XXI Ledgers, Form XVII Minutes, Defaulters Aging, and staff/branch directories. Strictly blocked (`403`) from **100% of write operations**, internal system audit logs (`GET /reports/audit-logs`), and BullMQ queue telemetry (`GET /jobs/*`, `/admin/queues`) per Guardrail 11. |

---

## 2. Module 1: Auth, Branches & Staff Identity (`apps/api/src/auth/`, `src/branch/`, `src/user/`)

### 2.1 Authentication & Session Endpoints (`/auth`)

| Method | Endpoint | Description | Super Admin | Branch Manager | Desk Accountant | Collection Agent | Customer | Auditor |
|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `POST` | `/auth/web/login` | Office staff credentials login | **Public** | **Public** | **Public** | **Public** | **Public** | **Public** |
| `POST` | `/auth/web/verify-totp` | Verify Microsoft Authenticator code | **Public** | **Public** | **Public** | **Public** | **Public** | **Public** |
| `POST` | `/auth/mobile/request-otp` | Request SMS OTP for mobile onboarding/login | **Public** | **Public** | **Public** | **Public** | **Public** | **Public** |
| `POST` | `/auth/mobile/verify-otp` | Verify SMS OTP; returns setupToken or session | **Public** | **Public** | **Public** | **Public** | **Public** | **Public** |
| `POST` | `/auth/mobile/login-mpin` | Mobile quick unlock with 6-digit MPIN | **Public** | **Public** | **Public** | **Public** | **Public** | **Public** |
| `POST` | `/auth/complete-onboarding` | Exchange `onboarding_restricted` token & set permanent password (`F16`) | **Onboarding Token** | **Onboarding Token** | **Onboarding Token** | **Onboarding Token** | 🚫 **Blocked** | **Onboarding Token** |
| `POST` | `/auth/mobile/set-mpin` | Establish 6-digit MPIN (via single-use `mpin_setup` or `access` token, `F01`) | **Auth / Setup** | **Auth / Setup** | **Auth / Setup** | **Auth / Setup** | 🚫 **Blocked** | 🚫 **Blocked** |
| `POST` | `/auth/refresh-token` | Rotate 15-min access & 7-day refresh tokens | **Public** | **Public** | **Public** | **Public** | **Public** | **Public** |
| `POST` | `/auth/logout` | Revoke active session and refresh token hash | **Auth** | **Auth** | **Auth** | **Auth** | **Auth** | **Auth** |
| `PATCH`| `/auth/fcm-token` | Register or clear staff device FCM token | **Auth (Staff)** | **Auth (Staff)** | **Auth (Staff)** | **Auth (Staff)** | 🚫 **Blocked** | **Auth (Staff)** |
| `GET` | `/auth/me` | Get authenticated user profile and roles (Dual Staff & Customer) | **Auth** | **Auth** | **Auth** | **Auth** | **Auth** | **Auth** |
| `POST` | `/auth/change-password` | Self-service password change with current password | **Allowed** | **Allowed** | **Allowed** | **Allowed** | 🚫 **Blocked (Staff Only)** | 🚫 **Blocked** |
| `POST` | `/auth/totp/setup` | Generate Base32 TOTP secret & QR URI | **Auth** | **Auth** | **Auth** | **Auth** | 🚫 **Blocked** | **Auth** |
| `POST` | `/auth/totp/enable` | Verify 6-digit code and lock 2FA | **Auth** | **Auth** | **Auth** | **Auth** | 🚫 **Blocked** | **Auth** |
| `POST` | `/auth/totp/disable` | Disable 2FA with password confirmation | **Auth** | **Auth** | **Auth** | **Auth** | 🚫 **Blocked** | **Auth** |

### 2.2 Company Branch Office Administration (`/branches`)

| Method | Endpoint | Description | Super Admin | Branch Manager | Desk Accountant | Collection Agent | Customer | Auditor |
|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `GET` | `/branches` | List all company branches (`?activeOnly=true`) | **Allowed** | **Allowed** | **Allowed** | **Allowed** | 🚫 **Blocked** | **Allowed** |
| `GET` | `/branches/:id` | View detailed branch profile and address | **Allowed** | **Allowed** | **Allowed** | **Allowed** | 🚫 **Blocked** | **Allowed** |
| `POST` | `/branches` | Create new branch office with Tamil name | **Allowed** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `PATCH` | `/branches/:id` | Update branch metadata & active flag | **Allowed** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |

### 2.3 Staff User Administration (`/users`)

| Method | Endpoint | Description | Super Admin | Branch Manager | Desk Accountant | Collection Agent | Customer | Auditor |
|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `GET` | `/users` | Paginated staff directory (`search`, `role`, `branchId`, `isActive`) | **Allowed** | **Branch Scope** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | **Allowed** |
| `GET` | `/users/:id` | View staff user profile, roles, and branch | **Allowed** | **Branch Scope** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | **Allowed** |
| `POST` | `/users` | Create staff user with branch & initial password | **Allowed** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `PATCH` | `/users/:id/status` | Activate or deactivate staff user (revokes sessions) | **Allowed** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `PATCH` | `/users/:id/roles` | Update assigned staff RBAC role personas | **Allowed** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `POST` | `/users/:id/reset-password` | Super Admin forced credential reset & session invalidation | **Allowed** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |

---

## 3. Module 2: Customer & Nominee Management (`apps/api/src/customer/`)

### 3.1 Endpoint Catalog & 6-Persona Access Control

| Method | Endpoint | Description | Super Admin | Branch Manager | Desk Accountant | Collection Agent | Customer | Auditor |
|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `POST` | `/customers` | Register customer profile (`KC-CUST-XXXXX`) | **Allowed** | **Branch Scope** | 🚫 **Blocked** | **Allowed (Field Intake)** | 🚫 **Blocked** | 🚫 **Blocked** |
| `GET` | `/customers` | Search & list customers with pagination | **All** | **Branch Scope** | **Company-wide** | **Assigned Scope** | 🚫 **Blocked** | **Read-Only (Global)** |
| `GET` | `/customers/:id` | Get customer profile, nominees & active chits | **All** | **Branch Scope** | **Company-wide** | **Assigned Scope** | **Self Profile Only** | **Read-Only (Global)** |
| `PATCH` | `/customers/:id` | Update customer address and phone | **Allowed** | **Branch Scope** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `POST` | `/customers/:id/nominees` | Link verified nominee with relationship | **Allowed** | **Branch Scope** | **Allowed** | 🚫 **Blocked** | **Self Account Only** | 🚫 **Blocked** |
| `DELETE`| `/customers/:id/nominees/:nomineeId`| Remove linked nominee record | **Allowed** | **Branch Scope** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `PATCH` | `/customers/:id/kyc-status` | Approve or revoke KYC verification flag | **Allowed** | **Branch Scope** | **Allowed** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `PATCH` | `/customers/:id/fcm-token` | Register or clear subscriber device FCM token | **Allowed** | **Branch Scope** | 🚫 **Blocked** | **Allowed (Onboarding)** | **Self Only (Anti-IDOR)** | 🚫 **Blocked** |
| `POST` | `/customers/:id/documents` | Upload KYC scan (Aadhaar, PAN, Photo; legacy multipart) to private S3 | **Allowed** | **Branch Scope** | **Allowed** | **Allowed (Onboarding)** | **Self Only (Anti-IDOR)** | 🚫 **Blocked** |
| `POST` | `/customers/:id/documents/confirm` | Confirm direct presigned PUT KYC scan upload (`fileExists` verified) | **Allowed** | **Branch Scope** | **Allowed** | **Allowed (Onboarding)** | **Self Only (Anti-IDOR)** | 🚫 **Blocked** |
| `GET` | `/customers/:id/documents/:docId/url` | Generate 15-minute S3 presigned viewing URL | **Allowed** | **Branch Scope** | **Allowed** | 🚫 **Blocked (Exempt)** | **Self Only (Anti-IDOR)** | **Read-Only** |
| `DELETE` | `/customers/:id/documents/:docId` | Delete KYC scan from S3 & database | **Allowed** | **Branch Scope** | **Allowed** | 🚫 **Blocked** | **Self Only (Unverified)** | 🚫 **Blocked** |

---

## 4. Module 3: Chit Groups & Mid-Cycle Intake (`apps/api/src/chit/`)

### 4.1 Endpoint Catalog & 6-Persona Access Control

| Method | Endpoint | Description | Super Admin | Branch Manager | Desk Accountant | Collection Agent | Customer | Auditor |
|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `POST` | `/chits` (alias `/chits/new`) | Create fresh chit group in DRAFT status | **Allowed (Exclusive)** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `PATCH` | `/chits/:id` | Update draft chit scheme parameters (names, dates, sanctions) | **Allowed** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `POST` | `/chits/onboard-ongoing` | Mid-Cycle Intake from physical paper notebook | **Allowed** | **Branch Scope** | **Allowed (Maker)** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `GET` | `/chits` | List chit schemes with status & keyword filter | **All** | **Branch Scope** | **Company-wide** | **Assigned Scope** | **Active Chits** | **Read-Only (Global)** |
| `GET` | `/chits/:id` | View chit scheme details, duration & rules | **All** | **Branch Scope** | **Company-wide** | **Assigned Scope** | **Own Chit Info** | **Read-Only (Global)** |
| `POST` | `/chits/:id/tickets/assign` | Assign ticket 1..N (Enforces ADR-13 limit) | **Allowed** | **Branch Scope** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `DELETE` | `/chits/:id/tickets/:ticketNumber` | Unassign ticket before scheme activation (DRAFT only) | **Allowed** | **Branch Scope** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `GET` | `/chits/:id/tickets` | View all ticket assignments in scheme | **All** | **Branch Scope** | **Company-wide** | **Assigned Scope** | **Own Ticket Info**| **Read-Only (Global)** |
| `POST` | `/chits/:id/register` | Record Registrar sanction order (`DRAFT` $\to$ `REGISTERED`) | **Allowed (Exclusive)** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `POST` | `/chits/:id/activate` | Lock terms, freeze 4% commission & Month 1 (`ACTIVE`) | **Allowed (Exclusive)** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `POST` | `/chits/:id/cancel` | Cancel unactivated draft scheme (`DRAFT` $\to$ `CANCELLED`) | **Allowed (Exclusive)** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `POST` | `/chits/:id/close` | Permanently close completed scheme (`COMPLETED` $\to$ `CLOSED`) | **Allowed (Exclusive)** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |

---

## 5. Module 4: In-Office Offline Auctions & Tie-Breakers (`apps/api/src/auction/`)

### 5.1 Endpoint Catalog & 6-Persona Access Control

| Method | Endpoint | Description | Super Admin | Branch Manager | Desk Accountant | Collection Agent | Customer | Auditor |
|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `GET` | `/auctions/group/:chitGroupId` | List past auctions, winners & dividend history | **All** | **Branch Scope** | **Company-wide** | **Assigned Scope** | **Own Group Only** | **Read-Only (Global)** |
| `GET` | `/auctions/:id` | Get single auction record & tie-break results (Fellow subscriber phone masked as `+91 ******0000`) | **All** | **Branch Scope** | **Company-wide** | **Assigned Scope** | **Own Group Only** | **Read-Only (Global)** |
| `GET` | `/auctions/:id/eligible-bidders`| Pre-auction guard: active non-prized 0-arrears | **Allowed** | **Branch Scope** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | **Read-Only (Audit)** |
| `POST` | `/auctions/:id/record-bid` | **Maker**: Enter winning ticket & bid discount | **Maker** | **Maker (Branch)** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `POST` | `/auctions/:id/tie-break` | **Option A**: Record paper token lot draw winner | **Maker** | **Maker (Branch)** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `POST` | `/auctions/:id/tie-break-record` | **Option A (Alias)**: Record paper token lot draw winner | **Maker** | **Maker (Branch)** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `POST` | `/auctions/:id/finalize` | **Checker**: Commit results & mark `isPrized` (`KFC-SEC-003`) | **Checker (Partner)** (`maker != checker`) | 🚫 **STRICTLY BLOCKED** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `POST` | `/auctions/:id/correction/request` | **Maker (Partner A)**: Request finalized auction correction (`KFC-FIN-005`) | **Maker (Partner)** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `POST` | `/auctions/:id/correction/approve` | **Checker (Partner B)**: Approve & apply correction (`maker != checker`) | **Checker (Partner)** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `POST` | `/auctions/:id/correction/reject` | **Checker (Partner B)**: Reject pending correction (`maker != checker`) | **Checker (Partner)** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `GET` | `/auctions/:id/minutes` | Form XVII statutory auction minutes summary | **Allowed** | **Branch Scope** | **Company-wide** | 🚫 **Blocked** | 🚫 **Blocked** | **Read-Only (Global)** |
| `GET` | `/auctions/:id/minutes/pdf` | Form XVII statutory auction minutes layout for PDF | **Allowed** | **Branch Scope** | **Company-wide** | 🚫 **Blocked** | 🚫 **Blocked** | **Read-Only (Global)** |
| `PATCH` | `/auctions/:auctionId/mark-filed-with-registrar` | Record physical filing of Form XVII at Registrar (`COMPLETED` $\to$ `MINUTES_FILED`) | **Allowed (Partner)** | **Branch Scope** | **Allowed** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |

---

## 6. Module 5: Installment Dues, Passbook & Defaulter Removal (`apps/api/src/installment/`)

### 6.1 Endpoint Catalog & 6-Persona Access Control

| Method | Endpoint | Description | Super Admin | Branch Manager | Desk Accountant | Collection Agent | Customer | Auditor |
|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `GET` | `/tickets/:ticketId/dues` | Full monthly dues schedule for ticket | **All** | **Branch Scope** | **Company-wide** | **Assigned Tickets** | **Own Ticket Only** | **Read-Only (Global)** |
| `GET` | `/tickets/:ticketId/passbook` | Detailed digital passbook statement | **All** | **Branch Scope** | **Company-wide** | **Assigned Tickets** | **Own Ticket Only** | **Read-Only (Global)** |
| `GET` | `/tickets/defaulters` | List subscribers with continuous arrears | **All** | **Branch Scope** | **Company-wide** | 🚫 **Blocked** | 🚫 **Blocked** | **Read-Only (Global)** |
| `GET` | `/installments/defaulters` | **Defaulters (Alias)**: Query 3-month consecutive defaulter report | **All** | **Branch Scope** | **Company-wide** | 🚫 **Blocked** | 🚫 **Blocked** | **Read-Only (Global)** |
| `POST` | `/tickets/:id/remove-defaulter`| Legacy removal route (enforces SEC-B two-partner policy) | **Partner Only** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `POST` | `/tickets/:id/remove-defaulter/request` | **Maker (Partner A)**: Request 3M defaulter removal (`PENDING_REMOVAL_APPROVAL`) | **Maker (Partner)** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `POST` | `/tickets/:id/remove-defaulter/approve` | **Checker (Partner B)**: Approve removal (`REMOVED_DEF_3M`, `maker != checker`) | **Checker (Partner)** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `POST` | `/tickets/:id/remove-defaulter/reject` | **Checker (Partner B)**: Reject removal (reverts to `DEFAULT_3_MONTHS`) | **Checker (Partner)** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `POST` | `/tickets/:id/substitute` | Substitute subscriber for `REMOVED_DEF_3M` ticket (ADR-13) | **Allowed (Exclusive)** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `POST` | `/tickets/:id/settle-removal` | **BLOCKED / Q25**: Fails closed with `400 UNAPPROVED_SETTLEMENT_POLICY` | **Allowed (Fail-Closed Q25)** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `GET` | `/installments/group/:chitGroupId/month/:month`| View member dues list for month | **All** | **Branch Scope** | **Company-wide** | 🚫 **Blocked** | 🚫 **Blocked** | **Read-Only (Global)** |
| `POST` | `/installments/group/:chitGroupId/month/:month/generate`| Generate dues from auction dividend | **Allowed** | **Branch Scope** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `GET` | `/installments/:dueId/upi-intent` | Generate NPCI 1-tap `upi://pay` URI locking exact $I_{net}$ | **All** | **Branch Scope** | **Company-wide** | **Assigned Tickets** | **Own Ticket Only** | 🚫 **Blocked (Exempt)** |

---

## 7. Module 6: Field Collections & Cash Handover (`apps/api/src/collection/`)

### 7.1 Endpoint Catalog & 6-Persona Access Control

| Method | Endpoint | Description | Super Admin | Branch Manager | Desk Accountant | Collection Agent | Customer | Auditor |
|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `GET` | `/collections/agent-dues` | View dues for field collection rounds | **All** | **Branch Scope** | **Company-wide** | **Assigned Scope** | 🚫 **Blocked** | **Read-Only (Global)** |
| `POST` | `/collections/record` | Record doorstep cash collection (Exact $I_{net}$) | **Allowed** | **Allowed (Branch)** | **Allowed (Desk)** | **Allowed (Field)** | 🚫 **Blocked** | 🚫 **Blocked** |
| `POST` | `/collections/sync-offline-queue` | Batch sync offline field collection queue (1 to 100 items) | **Allowed** | **Allowed (Branch)** | **Allowed (Desk)** | **Allowed (Field)** | 🚫 **Blocked** | 🚫 **Blocked** |
| `GET` | `/collections/daily-summary` | View today's collection register & vault cash | **All** | **Branch Scope** | **Company-wide** | **Own Collections**| 🚫 **Blocked** | **Read-Only (Global)** |
| `POST` | `/collections/cash-handover/submit` | Submit evening cash handover batch | **Allowed** | 🚫 **Blocked** | 🚫 **Blocked** | **Allowed (Collector)** | 🚫 **Blocked** | 🚫 **Blocked** |
| `POST` | `/collections/cash-handover/acknowledge` | Acknowledge physical cash into vault | **Checker** | **Checker (Branch)** | **Checker** | 🚫 **STRICTLY BLOCKED** *(collector != acknowledger)* | 🚫 **Blocked** | 🚫 **Blocked** |

---

## 8. Module 7: Payments, Bilingual Receipts & Maker-Checker Reversals (`apps/api/src/payment/`)

### 8.1 Endpoint Catalog & 6-Persona Access Control

| Method | Endpoint | Description | Super Admin | Branch Manager | Desk Accountant | Collection Agent | Customer | Auditor |
|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `POST` | `/payments` | Record discrete payment (Exact $I_{net}$) | **Allowed** | **Branch Scope** | **Company-wide** | **Allowed (Office/Field)** | 🚫 **Blocked** | 🚫 **Blocked** |
| `GET` | `/payments` | Query & filter payments list | **All** | **Branch Scope** | **Company-wide** | **Own Recorded** | **Own Payments Only** | **Read-Only (Global)** |
| `GET` | `/payments/:id` | Get single payment details & history | **All** | **Branch Scope** | **Company-wide** | **Own Recorded** | **Own Payment Only** | **Read-Only (Global)** |
| `GET` | `/payments/:id/receipt` | Generate bilingual receipt (EN + தமிழ்) | **All** | **Branch Scope** | **Company-wide** | **Own Recorded** | **Own Receipt Only** | **Read-Only (Global)** |
| `POST` | `/payments/upi-claim` | Customer self-submits bank UTR claim (`INITIATED`) | **Allowed** | **Branch Scope** | **Company-wide** | 🚫 **Blocked** | **Own Ticket Only** | 🚫 **Blocked** |
| `GET` | `/payments/pending-upi-claims` | List paginated pending UPI claims (`?page=1&limit=20`, max `100`) for Accounting Desk verification | **All** | **Branch Scope** | **Company-wide** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked (Desk Workbench)** |
| `POST` | `/payments/:id/verify-upi-claim` | **Checker**: Verify UTR credit & issue receipt (`maker != checker`) | **Allowed (Checker)** | **Allowed (Branch)** | **Allowed (Checker)** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `POST` | `/payments/:id/request-reversal` | **Maker (Partner A)**: Request payment reversal (`KFC-SEC-001`) | **Allowed (Partner Maker)** | 🚫 **STRICTLY BLOCKED** | 🚫 **STRICTLY BLOCKED** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `POST` | `/payments/:id/approve-reversal` | **Checker (Partner B)**: Commit reversal (`maker != checker`) | **Allowed (Partner Checker)** | 🚫 **STRICTLY BLOCKED** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `POST` | `/payments/:id/reject-reversal` | **Checker (Partner B)**: Dismiss reversal request | **Allowed (Partner Checker)** | 🚫 **STRICTLY BLOCKED** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |

---

## 9. Module 8: Prize Disbursements & Company Safety Proof Checklist (`apps/api/src/disbursement/`)

### 9.1 Endpoint Catalog & 6-Persona Access Control

| Method | Endpoint | Description | Super Admin | Branch Manager | Desk Accountant | Collection Agent | Customer | Auditor |
|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `GET` | `/disbursements` | List disbursements across chit schemes | **All** | **Branch Scope** | **Company-wide** | 🚫 **Blocked** | 🚫 **Blocked** | **Read-Only (Global)** |
| `GET` | `/disbursements/auction/:auctionId` | View winner disbursement details | **All** | **Branch Scope** | **Company-wide** | 🚫 **Blocked** | **Own Winner Only** | **Read-Only (Global)** |
| `POST` | `/disbursements/auction/:auctionId/upload-safety-proof` | **Maker**: Upload photos of signed agreement & blank cheques (legacy multipart) to S3 | **Allowed (Maker)** | **Allowed (Branch)** | **Allowed (Desk)** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `POST` | `/disbursements/auction/:auctionId/confirm-safety-proof` | **Maker**: Confirm direct-to-S3 presigned PUT safety proof upload (`fileExists` verified) | **Allowed (Maker)** | **Allowed (Branch)** | **Allowed (Desk)** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `GET` | `/disbursements/auction/:auctionId/safety-proof-url` | **Checker**: Generate 15-min presigned URL to view safety proof photos | **Allowed** | **Branch Scope** | **Allowed** | 🚫 **Blocked** | 🚫 **Blocked** | **Read-Only (Global)** |
| `POST` | `/disbursements/auction/:auctionId/verify-safety-proof` | **Maker**: Verify safety checklist & scans | **Allowed (Maker)** | **Allowed (Branch)** | **Allowed (Desk)** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `POST` | `/disbursements/auction/:auctionId/authorize-payout` | **Checker**: Authorize payout (`maker != checker`) | **Allowed (Checker)** | 🚫 **STRICTLY BLOCKED** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `POST` | `/disbursements/auction/:auctionId/disburse` | Record payout release & reference | **Allowed** | 🚫 **Blocked** | **Allowed** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `GET` | `/disbursements/auction/:auctionId/voucher` | Generate bilingual payout voucher | **All** | **Branch Scope** | **Company-wide** | 🚫 **Blocked** | **Own Voucher Only**| **Read-Only (Global)** |
| `POST` | `/disbursements/group/:chitGroupId/prepare-final-settlement` | **Stage 1 Final Settlement (Maker)**: Compute settlement snapshot & voucher | **Allowed (Maker)** | **Allowed (Branch)** | **Allowed (Desk)** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `POST` | `/disbursements/group/:chitGroupId/approve-final-settlement` | **Stage 2 Final Settlement (Checker)**: Approve & disburse payout (`isPartner: true`, `maker != checker`) | **Allowed (Checker)** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |
| `POST` | `/disbursements/group/:chitGroupId/final-settlement` | **Month N Direct Settlement**: Combined payout execution with verified Maker DTO | **Allowed (Checker)** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |

## 10. Module 9: Dashboards & Statutory Reports (`apps/api/src/report/`)

### 10.1 Endpoint Catalog & 6-Persona Access Control

| Method | Endpoint | Description | Super Admin | Branch Manager | Desk Accountant | Collection Agent | Customer | Auditor |
|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `GET` | `/reports/dashboard` | Executive KPI dashboard & vault metrics | **Global** | **Branch Scope** | **Global** | 🚫 **Blocked** | 🚫 **Blocked** | **Read-Only (Global)** |
| `GET` | `/reports/pending-approvals` | Aggregated Maker-Checker pending approvals queue | **Global** | **Branch Scope** | **Global** | 🚫 **Blocked** | 🚫 **Blocked** | **Read-Only (Global)** |
| `GET` | `/reports/approvals-stream` | Real-time SSE event stream for pending approvals | **Global** | **Branch Scope** | **Global** | 🚫 **Blocked** | 🚫 **Blocked** | **Read-Only (Global)** |
| `GET` | `/reports/day-book` | Daily collection & disbursement journal | **Global** | **Branch Scope** | **Global** | 🚫 **Blocked** | 🚫 **Blocked** | **Read-Only (Global)** |
| `GET` | `/reports/form-xxii` | Form XXII: Cash Book (Physical Cash Only) | **Global** | **Branch Scope** | **Global** | 🚫 **Blocked** | 🚫 **Blocked** | **Read-Only (Global)** |
| `GET` | `/reports/form-xvii` | Form XVII: Auction Minutes Register | **Global** | **Branch Scope** | **Global** | 🚫 **Blocked** | 🚫 **Blocked** | **Read-Only (Global)** |
| `GET` | `/reports/form-xxi` | Form XXI: Subscriber Ledger Register | **Global** | **Branch Scope** | **Global** | 🚫 **Blocked** | **Own Ticket Only** | **Read-Only (Global)** |
| `GET` | `/reports/defaulters` | Overdue members with 1M, 2M, 3M aging | **Global** | **Branch Scope** | **Global** | **Branch / Assigned** | 🚫 **Blocked** | **Read-Only (Global)** |
| `GET` | `/reports/audit-logs` | Immutable audit trail of dual-control actions | **Global (Super Admin Only)** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** |

> [!NOTE]
> All statutory register outputs (`form-xvii`, `form-xxi`, `form-xxii`) transparently include `statutoryStatus: 'UNVERIFIED-LEGAL'` per `compliance-checklist.md` §3 until physical specimens from the Registrar of Chits (Erode/Perundurai) are officially inspected.

## 11. Component 1: Encrypted Storage Service (`apps/api/src/storage/`)

### 11.1 Overview & Architecture
- **Dual-Driver Pattern**:
  - `LocalStorageDriver`: Default for local development. Automatically writes files to `./storage/uploads/` and resolves absolute paths with path-traversal safeguards.
  - `S3StorageDriver` (also aliased as `AwsS3StorageDriver`): Production driver using S3 SDK v3 (`@aws-sdk/client-s3`) supporting Cloudflare R2 / MinIO / S3 with `ServerSideEncryption: 'AES256'` and `@aws-sdk/s3-request-presigner`.
- **15-Minute Presigned Lifespan**: All presigned download URLs strictly expire in **900 seconds (15 minutes)** per `AGENTS.md` §1 and `prd.md` §3.
- **Path Traversal Protection**: `StorageKeyHelper.sanitizeKey()` rejects any `..` or double slashes with `BadRequestException`.
- **Deterministic Key Taxonomy**:
  - Customer KYC: `kyc/{customerId}/{docType}-{uuid}.{ext}`
  - Bilingual Receipts: `receipts/{branchCode}/{year}/{receiptNumber}.pdf`
  - Prize Vouchers: `vouchers/{branchCode}/{year}/{voucherNumber}.pdf`
  - Safety Proof Scans: `safety-proof/{auctionId}/{uuid}-{filename}`
  - Form XVII Minutes: `minutes/{chitGroupId}/month-{installmentMonth}.pdf`

### 11.2 Endpoint Catalog
| Method | Endpoint | Description | Allowed Roles |
|---|---|---|:---:|
| `POST` | `/storage/presigned-upload-url` | Request 300s direct-to-S3/R2 presigned `PUT` upload URL (`kyc/` or `safety-proof/`, ABAC-guarded) | Staff, Customer (Self KYC) |
| `PUT` | `/storage/upload/*key` | Local-driver fallback binary `PUT` upload target (`STORAGE_DRIVER=local` only, 10 MB ceiling, 120s timeout) | Staff, Customer (Self KYC) |
| `GET` | `/storage/file/*key` | Authenticated file retrieval (`302` presigned redirect under S3 mode or `?redirect=true`, raw stream via `?stream=true` or local; strict default-deny prefixes) | Staff, Customer (Scoped), Auditor |

---

## 12. Component 2: Bilingual PDF Canvas Engine (`apps/api/src/pdf/`)

### 12.1 Overview & Architecture
- **Self-Contained Tamil Fonts**: Bundles `NotoSansTamil-Regular.ttf` and `NotoSansTamil-Bold.ttf` directly in `apps/api/src/assets/fonts/` (automatically copied to `dist/` on build) ensuring 100% OS font independence across Windows, Linux, and Docker Alpine.
- **Rupee Words Converter (`RupeeWordsHelper`)**: Mathematically converts whole rupees (`BigInt`) into legal words in both English and Tamil:
  - English: e.g. `3750n` $\to$ `"Three Thousand Seven Hundred Fifty Rupees Only"`
  - Tamil: e.g. `3750n` $\to$ `"ரூபாய் மூன்றாயிரத்து எழுநூற்று ஐம்பது மட்டும்"`
- **Canvas Templates**:
  - `SubscriptionReceiptTemplate`: Standard A5 portrait digital receipt document (419.53 x 595.28 pt) for instant digital viewing and digital passbook archival. Zero thermal printers deployed (ADR-11).
  - `PayoutVoucherTemplate`: A5 landscape prize payout voucher with safety proof checklist stamps and Maker-Checker signature lines.
  - `FormXviiMinutesTemplate`: A4 statutory auction minutes with financial breakdown, tie-breaker paper token lot draw table, and Foreman declaration.
  - `FormXxiPassbookTemplate`: A4 landscape 20-month continuous schedule showing monthly base dues, dividend credits, payments, and arrears.
- **Storage Integration & 6-Persona Access Guardians**: Seamlessly saves generated PDF buffers via `StorageService`, updates database keys (`Receipt.pdfS3Key`), and returns 15-minute presigned URLs. Guarded at Layer 2 (Ownership/ABAC) via `DocumentAccessHelper` to eliminate OWASP BOLA/IDOR vulnerabilities:
  - `CUSTOMER`: strictly restricted to own receipts, own payout vouchers, and own passbooks; barred from internal minutes and other customers' files.
  - `BRANCH_MANAGER`: restricted strictly to own branch data; barred from accessing other branches' documents.
  - `COLLECTION_AGENT`: can only download receipts for payments they personally collected; strictly barred from prize vouchers, passbooks, and statutory minutes.
  - `SUPER_ADMIN`, `ACCOUNTANT`, and `AUDITOR`: full oversight per permissions matrix.

### 12.2 Endpoint Catalog
| Method | Endpoint | Description | Allowed Roles |
|---|---|---|:---:|
| `GET` | `/pdf/receipt/:paymentId` | Stream or download bilingual A5 subscription receipt PDF (Ownership-guarded) | Staff, Customer, Auditor |
| `GET` | `/pdf/voucher/:auctionId` | Stream or download bilingual prize payout voucher PDF (Ownership-guarded) | Staff, Customer, Auditor |
| `GET` | `/pdf/minutes/:auctionId` | Stream or download Form XVII statutory auction minutes PDF (Branch-guarded) | Staff, Auditor |
| `GET` | `/pdf/passbook/:ticketId` | Stream or download Form XXI 20-month passbook statement PDF (Ownership-guarded) | Staff, Customer, Auditor |

---

## 13. Component 3: BullMQ Background Queue & Daily Cron Worker (`apps/api/src/jobs/`)

### 13.1 Overview & Architecture
- **Dual Conveyor Architecture**: BullMQ running on Redis 7 (`127.0.0.1:6379`) with resilient direct-execution fallback mode when Redis is offline during local test suites.
- **Daily Midnight Arrears Cron (`DailyArrearsService`)**:
  - Automatically transitions all `UNPAID` dues with past due dates (`dueDate < now`) strictly to `OVERDUE`.
  - Recalculates consecutive unpaid months for each subscriber ticket.
  - Automatically tags tickets with 3+ consecutive unpaid months as `DEFAULT_3_MONTHS` per ADR-07 and emits statutory warning notices.
  - Automatically restores tickets from `DEFAULT_3_MONTHS` back to `ACTIVE` when delinquent dues are cleared.
- **Smart Notification Router (`NotificationService` & `PushService`, `ADR-23` / `ADR-26`)**:
  - **Indian Telecom DLT SMS (Primary Phase 1 Channel — `ADR-23`)**: Header `KMRCHT` / DLT templates via `SmsService` (`Msg91SmsDriver` + `MockSmsDriver` wrapped in `CircuitBreaker`) for OTP authentication, payment receipts, auction results, and 3-month default notices. WhatsApp Business API parked in V1.
  - **In-App Mobile Push Notifications (FCM HTTP v1 — Phase 2 Ready, `ADR-26`)**: Powered by `PushService` (`FirebasePushDriver` + `MockPushDriver`) with automatic stale token pruning (`fcmToken = null` on `registration-token-not-registered`). Ready for Phase 2 Flutter mobile client activation.
  - **In-Memory Audit Registry**: Preserves full notification payloads for `SUPER_ADMIN` review and automated test assertions.
- **Automated Repeatable Cron Schedulers (`Asia/Kolkata` Timezone)**:
  - **00:01 AM IST (`1 0 * * *`)**: `DailyArrearsService` runs daily arrears recalculation, marks past-due items `OVERDUE`, tags 3-month defaults (`DEFAULT_3_MONTHS`), and emits warnings.
  - **06:00 AM IST (`0 6 * * *`)**: `ReconciliationService` runs daily direct KVB bank settlement reconciliation (`ADR-19`, zero third-party gateways), auto-resolving confirmed drops and flagging exceptions.
  - **09:00 AM IST (`0 9 * * *`)**: `AuctionReminderSchedulerService` scans upcoming auctions 3 days ahead and broadcasts bilingual DLT SMS / Push reminders.
- **Payment Settlement Reconciliation (`ReconciliationService`)**:
  - Runs daily at 06:00 AM IST to compare Karur Vysya Bank settlement records against internal database entries.
  - Auto-resolves confirmed settlements (updates internal `INITIATED` payment to `SUCCESS` and issues receipts) and flags amount/status discrepancies for Accountant review.

### 13.2 Endpoint Catalog
| Method | Endpoint | Description | Allowed Roles |
|---|---|---|:---:|
| `POST` | `/jobs/run-daily-arrears` | Manually trigger daily midnight arrears recalculation & default tagging | Super Admin, Branch Manager |
| `POST` | `/jobs/enqueue-daily-arrears` | Enqueue daily arrears check job onto BullMQ conveyor belt | Super Admin |
| `POST` | `/jobs/run-reconciliation` | Manually trigger payment settlement reconciliation | Super Admin, Accountant |
| `POST` | `/jobs/enqueue-reconciliation` | Enqueue payment reconciliation job onto BullMQ queue | Super Admin, Accountant |
| `POST` | `/jobs/send-auction-reminder/:chitGroupId/:month` | Broadcast bilingual upcoming auction reminder to subscribers | Super Admin, Branch Manager |
| `POST` | `/jobs/run-pre-auction-scan` | Manually trigger pre-auction scan & reminder broadcast (default 3 days ahead) | Super Admin, Branch Manager |
| `GET` | `/jobs/repeatable-schedules` | List active BullMQ repeatable cron jobs and next execution timestamps | Super Admin Only |
| `GET` | `/jobs/queue-status` | Inspect BullMQ queue health and active/waiting/failed job counts | Super Admin Only |
| `GET` | `/jobs/notification-audit-logs` | Retrieve audit history of dispatched Push Notifications and DLT SMS messages | Super Admin Only |
| `GET/UI` | `/admin/queues` | **Bull Board Visual Dashboard**: Real-time queue inspection, job progress & dead letter retry | Super Admin JWT Session (or configured Basic Auth) |

---

## 14. Foundation: System Health, Metrics & Observability (`/`, `/health`, `/metrics`)

### 14.1 Endpoint Catalog & 6-Persona Access Control

| Method | Endpoint | Description | Super Admin | Branch Manager | Desk Accountant | Collection Agent | Customer | Auditor |
|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `GET` | `/` | System root ping and version string | **Public** | **Public** | **Public** | **Public** | **Public** | **Public** |
| `GET` | `/health` | Terminus system health check (Postgres, Redis, Storage) | **Public** | **Public** | **Public** | **Public** | **Public** | **Public** |
| `GET` | `/health/readiness` | Kubernetes/Docker readiness probe (DB & Redis) | **Public** | **Public** | **Public** | **Public** | **Public** | **Public** |
| `GET` | `/health/liveness` | Lightweight process liveness probe | **Public** | **Public** | **Public** | **Public** | **Public** | **Public** |
| `GET` | `/health/sentry-test` | Sentry exception diagnostic verification | **Public** | **Public** | **Public** | **Public** | **Public** | **Public** |
| `GET` | `/metrics` | Prometheus metrics scrape endpoint | **Basic Auth (`METRICS_USER`)** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | 🚫 **Blocked** | **Basic Auth (`METRICS_USER`)** |

---

### 14.2 Complete Audit & Proof of All 14 Public / Non-RBAC Operations

The system exposes **14 public / non-JWT-RBAC operations** representing the authentication front-entrance and infrastructure probes. Each is hardened with specialized defense layers:

| # | Endpoint & Method | Purpose & Target | Security & Hardening Mechanism | Automated Test Proof |
|:---:|---|---|---|---|
| **1** | `GET /` | Root server liveness check | Zero sensitive data returned (`"Kumaran Chits API is running"`). | [`apps/api/test/e2e/app.e2e-spec.ts`](../test/e2e/app.e2e-spec.ts) |
| **2** | `GET /health` | Container & cloud health probe | Checks Postgres, Redis, and Storage connectivity (`@SkipThrottle()`). | [`apps/api/test/e2e/app.e2e-spec.ts`](../test/e2e/app.e2e-spec.ts) |
| **3** | `GET /health/readiness` | Readiness probe | Validates live PostgreSQL & Redis readiness before routing traffic. | [`apps/api/test/unit/health.spec.ts`](../test/unit/health.spec.ts) |
| **4** | `GET /health/liveness` | Liveness probe | Lightweight process heartbeat check. | [`apps/api/test/unit/health.spec.ts`](../test/unit/health.spec.ts) |
| **5** | `GET /health/sentry-test` | Crash diagnostic validation | Verifies Sentry APM reporting without leaking stack traces. | [`apps/api/test/unit/client-contract.spec.ts`](../test/unit/client-contract.spec.ts) |
| **6** | `POST /auth/web/login` | Staff office web portal login | Rate-limited (`5 req/60s`); `bcrypt.compare`; challenges for TOTP or `onboarding_restricted` (`F16`). | [`apps/api/test/unit/auth.spec.ts`](../test/unit/auth.spec.ts) |
| **7** | `POST /auth/web/verify-totp` | Staff 2FA authentication | Validates `totp_pending` JWT (5m TTL) + RFC 6238 6-digit code. | [`apps/api/test/unit/auth.spec.ts`](../test/unit/auth.spec.ts) |
| **8** | `POST /auth/complete-onboarding` | Forced first-login password setup (`F16`) | Validates single-use `onboarding_restricted` token (15m TTL) & enforces permanent password change. | [`apps/api/test/unit/phase1-security-remediation.spec.ts`](../test/unit/phase1-security-remediation.spec.ts) |
| **9** | `POST /auth/refresh-token` | Session token pair rotation (`F04`) | Rotates 15-min access JWT; validates 7-day refresh token against PostgreSQL `Session` Vault (`sid`, `clientType`); RFC 6819 replay revocation. | [`apps/api/test/unit/auth-token-lifecycle.spec.ts`](../test/unit/auth-token-lifecycle.spec.ts) |
| **10**| `POST /auth/mobile/request-otp` | Mobile SMS OTP onboarding | Rate-limited; cryptographic 6-digit OTP in Redis (300s TTL); Indian DLT SMS (`ADR-23`). | [`apps/api/test/unit/auth.spec.ts`](../test/unit/auth.spec.ts) |
| **11**| `POST /auth/mobile/verify-otp` | Mobile SMS OTP validation (`F13`) | Atomic Redis Lua `verifyOtpLua` script; 3-attempt 5-minute lockout; single-use consumption. | [`apps/api/test/unit/phase4-concurrency-queues-sse.spec.ts`](../test/unit/phase4-concurrency-queues-sse.spec.ts) |
| **12**| `POST /auth/mobile/login-mpin` | Mobile quick unlock | Validates 6-digit MPIN against bcrypt hash; 5-failure lockout + `mustChangePassword` check. | [`apps/api/test/unit/auth.spec.ts`](../test/unit/auth.spec.ts) |
| **13**| `POST /auth/mobile/set-mpin` | MPIN configuration (`F01`) | Strictly requires `tokenType: 'access'` Bearer or single-use `mpin_setup` token; rejects `totp_pending`/`refresh`. | [`apps/api/test/unit/phase1-security-remediation.spec.ts`](../test/unit/phase1-security-remediation.spec.ts) |
| **14**| `GET /metrics` | Prometheus telemetry scraper | Protected by `MetricsAuthGuard` using explicit non-default HTTP Basic Auth (`METRICS_USER` / `METRICS_PASSWORD`). | [`apps/api/test/unit/metrics.spec.ts`](../test/unit/metrics.spec.ts) |

---

## 15. Summary of Completion Deliverables

- **Single Tenancy**: Zero `company_id` columns exist across all tables.
- **Whole Rupee Arithmetic**: Pure `BigInt` / native `bigint` throughout; zero paise, floats, or decimal fractions in currency code.
- **Universal Equal Dividend Deduction**: Distributed equally to all members, including auction winner and past prized winners ($I_{net} = I_{base} - Div$).
- **Single Discrete Payment & Zero Partial Payments**: Exactly one payment per monthly installment matching $I_{net}$; zero partials, zero doubles, zero advances (`UNPAID`, `PAID`, `OVERDUE`).
- **Flexible Company Safety Proof Checklist (ADR-15)**: Property documents eliminated; non-mandatory, on-demand safety proof checklist (signed agreement, nominee signature, signed blank cheques, promissory notes).
- **Maker-Checker Dual Control Hard Guards**:
  - `conductedByUserId != finalizedByUserId` on offline auctions.
  - `collector_user_id != acknowledger_user_id` on cash handover into branch vault.
  - `maker_user_id != checker_user_id` on payment reversals (with `BRANCH_MANAGER` strictly blocked from approving reversals per permissions-matrix §6).
  - `verifiedByUserId != authorizedByUserId` on prize money disbursements (with `BRANCH_MANAGER` strictly blocked from authorizing payouts per permissions-matrix §6).
- **Physical Safe Cash Reconciliation Invariant**:
  $$\text{Closing Cash in Safe} = \text{Opening Cash} + \text{Cash Inflows} - \text{Cash Outflows}$$
  Enforced by Form XXII Cash Book Register (`/reports/form-xxii`) to match physical notes in vault to the exact Rupee.
- **Encrypted Storage Service**: Dual-driver with local disk fallback and S3-compatible cloud storage (Cloudflare R2 / MinIO) with `AES256` and 15-minute presigned URLs.
- **Bilingual PDF Canvas Engine**: A5 digital receipts, payout vouchers, Form XVII minutes, and Form XXI passbooks with bundled Noto Sans Tamil fonts.
- **OWASP BOLA/IDOR Ownership Guardians**: `DocumentAccessHelper` strictly enforces horizontal isolation across all 6 personas and branch boundaries.
- **BullMQ Background Queue & Daily Cron Worker**: Daily midnight arrears recalculation, 3-month default tagging (ADR-07), Smart Push and Indian DLT SMS dispatchers, 06:00 AM settlement reconciliation, and **Bull Board visual queue monitor at `/admin/queues`**.
- **Total Production Endpoints**: **134 live HTTP controller operations across 18 NestJS controllers (+1 Bull Board visual monitor at `/admin/queues`)** (`docs/03-architecture/openapi-spec.json`: **123 paths / 129 operations**).
- **Strongly-Typed OpenAPI Response Schemas (MIS-01 Resolution)**: **100% of exported OpenAPI operations** declare typed response content schemas matching the standard `{ success, statusCode, timestamp, data }` JSON envelope, enabling automated TypeScript and Dart client SDK generation with zero untyped gaps.
- **Automated Test Coverage**: **1,226 API unit tests across 63 suites + 376 Web unit tests (14 suites) + 10 `@kumaran/api-client` tests + 6 Dart test suites (100% pass rate)**.



