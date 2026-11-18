# Customer & Nominee Management Module

> **Module**: `apps/api/src/customer/`  
> **Company**: **Kumaran Finance** (Perundurai, Erode, Tamil Nadu)  
> **Compliance**: Indian DPDP Act 2023 & Tamil Nadu Chit Funds Rules  
> **Guiding ADRs**: [ADR-13, ADR-15, ADR-16, ADR-17, ADR-18, ADR-26](../../../../docs/01-business/decision-log.md)

---

## 1. Overview & Business Rules

The **Customer Module** governs subscriber intake, nominee relationships, optional KYC verification, private S3/R2 document uploads, and mobile push token registration:

1. **Sequential Customer Code Generation**: Every subscriber receives a unique monotonic identifier (`KC-CUST-00001`, `KC-CUST-00002`...) minted atomically inside a transaction.
2. **Lightweight Paper-Notebook Intake (`ADR-16` / `ADR-18`)**:
   - Required API fields mirror Kumaran Finance's physical notebooks: `fullName`, `phone`, and `addressLine1` (`city` is optional and defaults to `'Perundurai'` if omitted).
   - **Strict Indian Mobile Validation (`ADR-18`)**: `REGEX_INDIAN_PHONE` (`/^[6-9]\d{9}$/`) is enforced across `phone`, `altPhone`, and nominee phone fields; numbers starting with `0`–`5` are rejected and email columns are 100% eliminated.
   - **Zero Forced KYC**: Aadhaar, PAN, and KYC scans are strictly optional and never block subscriber registration.
3. **DPDP Act 2023 Data Minimization & Format Normalization (`ADR-17` / `F07`)**:
   - **Masked Aadhaar Only**: Only the last 4 digits (`aadhaarLast4`, strictly `^\d{4}$`) may be persisted; full 12-digit Aadhaar numbers are rejected.
   - **Auto-Uppercase PAN**: `panNumber` is trimmed, auto-uppercased via `@Transform`, and validated against Indian Income Tax syntax `[A-Z]{5}[0-9]{4}[A-Z]{1}`.
   - **Explicit Projection Allowlist (`F07`)**: Prisma `select` allowlists permanently exclude auth secrets (`passwordHash`, `mpinHash`, `totpSecret`, `fcmToken`) from API output.
   - **Compound FK Indexes & Contract Parity**: `Nominee` and `CustomerDocument` carry `@@index([customerId])`; `NomineeResponseDto` exposes `fullName` (preserving `name` alias) in parity with `@kumaran/api-client` and Dart Core `api_models.dart`.
4. **Layer 2 Anti-BOLA Branch Isolation & Collection Agent KYC Boundary**:
   - `POST /customers`, `GET /customers`, `GET /customers/:id`, and `PATCH /customers/:id/fcm-token` enforce branch boundary scoping via `@CurrentUser()`; non-Super-Admin staff attempting cross-branch registration or updates receive `403 Forbidden (BOLA_VIOLATION)`.
   - **Collection Agent Doorstep KYC Upload Boundary**: `COLLECTION_AGENT` is authorized to **upload** doorstep KYC documents (`POST /documents` and `POST /documents/confirm`) for subscribers in their branch, but is **strictly barred from viewing KYC scans or generating presigned URLs** (`GET /documents/:docId/url`) and receives redacted `documents` arrays in directory queries.
   - **Immutable Audit Trail**: Nominee additions (`CUSTOMER_NOMINEE_ADDED`), removals (`CUSTOMER_NOMINEE_REMOVED`), and KYC toggles (`CUSTOMER_KYC_STATUS_UPDATED`) append immutable `AuditLog` entries.
5. **Direct-to-Object-Storage KYC Upload (`DEF-FE-07`)**:
   - Supports both multipart upload (`POST /documents`) and direct-to-S3/R2 presigned PUT confirmation (`POST /documents/confirm`), verifying physical object existence (`HeadObject` / `fileExists`) before committing database metadata.
6. **Subscriber Device FCM Push Token (`ADR-26`)**:
   - `PATCH /api/v1/customers/:id/fcm-token`: Customers can update **only** their own device token (`currentUser.sub === id`, Anti-IDOR); branch-scoped staff may update tokens during doorstep onboarding *(API live; Android FCM delivery activates in Phase 2 Q2 2027 per `ADR-26`)*.

---

## 2. Endpoint Catalog (`CustomerController` — 12 Live Routes)

All 12 routes are served by `apps/api/src/customer/customer.controller.ts`:

| # | Method | Endpoint | Description | Allowed Personas |
| :-: |---|---|---|---|
| 1 | `POST` | `/api/v1/customers` | Register customer profile (`KC-CUST-XXXXX`; branch-scoped) | `SUPER_ADMIN`, `BRANCH_MANAGER`, `COLLECTION_AGENT` |
| 2 | `GET` | `/api/v1/customers` | Search & list subscribers with pagination (branch/route-scoped; docs redacted for agents) | Staff & `AUDITOR` |
| 3 | `GET` | `/api/v1/customers/:id` | View profile, nominees & active chits | Staff, `AUDITOR`, or Self `CUSTOMER` |
| 4 | `PATCH` | `/api/v1/customers/:id` | Update contact, address, masked Aadhaar, or PAN | `SUPER_ADMIN`, `BRANCH_MANAGER` |
| 5 | `POST` | `/api/v1/customers/:id/nominees` | Link nominee record & append `CUSTOMER_NOMINEE_ADDED` audit event | Staff or Self `CUSTOMER` |
| 6 | `DELETE` | `/api/v1/customers/:id/nominees/:nomineeId` | Remove linked nominee & append `CUSTOMER_NOMINEE_REMOVED` audit event | `SUPER_ADMIN`, `BRANCH_MANAGER` |
| 7 | `PATCH` | `/api/v1/customers/:id/kyc-status` | Approve or revoke KYC verification & append `CUSTOMER_KYC_STATUS_UPDATED` audit event | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT` |
| 8 | `PATCH` | `/api/v1/customers/:id/fcm-token` | Register subscriber FCM device token (Anti-IDOR + branch guard; Phase 2 push) | Branch-scoped Staff or Self `CUSTOMER` |
| 9 | `POST` | `/api/v1/customers/:id/documents` | Upload KYC scan (Aadhaar, PAN, Photo) to private S3/R2 | Staff (incl. branch `COLLECTION_AGENT`) or Self `CUSTOMER` |
| 10 | `POST` | `/api/v1/customers/:id/documents/confirm` | Confirm direct presigned PUT KYC upload after `HeadObject` existence check (`DEF-FE-07`) | Staff (incl. branch `COLLECTION_AGENT`) or Self `CUSTOMER` |
| 11 | `GET` | `/api/v1/customers/:id/documents/:docId/url` | Generate 15-minute private S3/R2 presigned viewing URL (`COLLECTION_AGENT` strictly barred) | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, `AUDITOR`, or Self `CUSTOMER` |
| 12 | `DELETE` | `/api/v1/customers/:id/documents/:docId` | Delete KYC scan from object storage & database | Staff or Self `CUSTOMER` |

---

## 3. Testing & Verification

Verified by **67 automated Jest unit tests** across **2 spec files** under `apps/api/test/unit/` (plus `5/5` Dart customer model tests in `apps/mobile/test/customer_models_test.dart`):

| Spec File | Tests | Verified Scope |
|---|:---:|---|
| `apps/api/test/unit/customer.spec.ts` | **48** | Code sequencing, Layer 2 Anti-BOLA branch isolation, `COLLECTION_AGENT` upload-only/redaction guard, nominee & KYC audit logs, direct-upload `confirm`, Anti-IDOR FCM guard |
| `apps/api/test/unit/customer-validation.spec.ts` | **19** | `REGEX_INDIAN_PHONE` (`/^[6-9]\d{9}$/`), masked 4-digit Aadhaar rejection of 12-digit inputs, PAN uppercase normalization & syntax validation |

```bash
pnpm --filter api test -- test/unit/customer.spec.ts test/unit/customer-validation.spec.ts
```
