# Lifecycle 7 Live Server E2E Verification Proof Report

> **Product**: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)  
> **Lifecycle**: **Lifecycle 7 — Counter Payments, Collections Query, A5 Digital Receipts & Dual-Control Reversals (Approval & Rejection)**  
> **Execution Date**: October 25, 2026  
> **Environment**: Live NestJS Server (`http://127.0.0.1:3000/api/v1`) $\longleftrightarrow$ PostgreSQL 17 Docker (`chitflow_dev` on Port 5433) $\longleftrightarrow$ Redis 7 $\longleftrightarrow$ MinIO Private S3 (`:9000`)  
> **Test Script**: [`apps/api/scripts/verify-lifecycle-7.ts`](file:///u:/Kumaran-finance/apps/api/scripts/verify-lifecycle-7.ts)  
> **Result**: **8 / 8 Live Steps Passed (100% Request $\to$ Server $\to$ Database $\to$ S3 $\to$ Queue $\to$ Response Verified)**

---

## 1. Executive Summary

Lifecycle 7 verifies the comprehensive payment lifecycle for Kumaran Chits operations:
1. Recording discrete payments via multiple instruments (**CASH** with physical drawer custody tracking, and electronic **UPI** with transaction reference auto-acknowledgement).
2. Querying paginated collections with multi-criteria filters (`ticketId`, `paymentMethod`, `limit`, `page`).
3. Single payment lookups with complete entity graph resolution (`customer`, `branch`, `recordedBy`, `allocations`, `receipt`) and strict **OWASP BOLA (Broken Object Level Authorization)** protection.
4. Bilingual on-screen receipt layout rendering for the mobile passbook (English + தமிழ்).
5. Standard **ISO A5 portrait PDF digital receipt** streaming and **15-minute presigned S3 / MinIO** download link generation.
6. Maker-Checker dual control on financial reversals (`maker_user_id != checker_user_id`), comprehensively verifying **both lifecycle branches**:
   - **Branch 1 (Rejection)**: Checker rejects reversal $\to$ Payment remains `SUCCESS`, `InstallmentDue` remains `PAID`, `AuditLog` captures rejection.
   - **Branch 2 (Approval)**: Checker approves reversal $\to$ Payment transitions to `REVERSED`, `InstallmentDue` restored to `0|UNPAID`, `AuditLog` captures approval.

```mermaid
flowchart TD
    subgraph S1["1. Collection & Recording"]
        P1["POST /payments (CASH)\nstatus: PENDING_HANDOVER"]
        P2["POST /payments (UPI)\ntransactionRef, status: ACKNOWLEDGED"]
    end

    subgraph S2["2. Discovery & Security"]
        Q["GET /payments\n(Filters, Pagination & Customer Scoping)"]
        D["GET /payments/:id\n(Deep Graph & OWASP BOLA Guard)"]
    end

    subgraph S3["3. Digital Receipts (ISO A5)"]
        RT["GET /payments/:id/receipt\n(Bilingual Text Layout)"]
        PDF1["GET /pdf/receipt/:id\n(Binary Stream: %PDF-)"]
        PDF2["GET /pdf/receipt/:id?download=true\n(15-min Presigned S3 URL)"]
    end

    subgraph S4["4. Maker-Checker Dual-Control Reversals"]
        REV_REQ["POST /payments/:id/request-reversal\n(Maker: Desk Accountant)"]
        REV_REJ["POST /payments/:id/reject-reversal\n(Checker: Partner Rejection -> Remains SUCCESS)"]
        REV_APP["POST /payments/:id/approve-reversal\n(Checker: Partner Approval -> Restores UNPAID)"]
    end

    S1 --> S2 --> S3 --> S4
```

---

## 2. Endpoint-by-Endpoint Live Verification Log

### [1/8] `POST /api/v1/payments` (Record Payment A — CASH with All Fields)
- **Role Required**: `ACCOUNTANT`, `SUPER_ADMIN`, `BRANCH_MANAGER` (Maker: Desk Accountant Priya, `9876543213`)
- **HTTP Status**: `201 Created`
- **Request Payload**:
  ```json
  {
    "ticketId": "ed087ad5-ee76-481b-bc65-6de55ba61db0",
    "installmentMonth": 2,
    "amount": 3950,
    "paymentMethod": "CASH",
    "notes": "Counter collection by Priya at Perundurai desk",
    "idempotencyKey": "pay-cash-79d003a8-a07d-4da6-8aa2-54df44f82f5f",
    "collectedAt": "2026-10-24T20:05:19.883Z"
  }
  ```
- **API Response**:
  ```json
  {
    "payment": {
      "id": "652ad723-85d2-49cb-8862-e1b1a3a87f29",
      "branchId": "07c70d9d-a8aa-45d3-b34e-15a2dd0cc88c",
      "recordedByUserId": "5460c6e3-607f-4931-b789-d269b65f852a",
      "customerId": "f6d65f2c-260e-4012-b622-8312f86a9742",
      "amount": 3950,
      "paymentMethod": "CASH",
      "paymentStatus": "SUCCESS",
      "idempotencyKey": "pay-cash-79d003a8-a07d-4da6-8aa2-54df44f82f5f",
      "cashHandoverStatus": "PENDING_HANDOVER",
      "notes": "Counter collection by Priya at Perundurai desk"
    },
    "allocation": {
      "id": "c41fc541-482c-47ad-a0a0-78af4957211f",
      "paymentId": "652ad723-85d2-49cb-8862-e1b1a3a87f29",
      "ticketId": "ed087ad5-ee76-481b-bc65-6de55ba61db0",
      "amountAllocated": 3950
    },
    "receipt": {
      "id": "4651c28d-203b-4837-8f36-cbcfddb94e6f",
      "receiptNumber": "KC-REC-PRD-2026-00014",
      "isBilingual": true
    },
    "dueStatus": "PAID",
    "paidAmount": 3950,
    "netPayableAmount": 3950
  }
  ```
- **PostgreSQL 17 Database Proof (`public."Payment"`, `public."Receipt"`, `public."InstallmentDue"`)**:
  ```sql
  SELECT id, amount, "paymentMethod", "paymentStatus", "cashHandoverStatus" 
  FROM public."Payment" WHERE id = '652ad723-85d2-49cb-8862-e1b1a3a87f29';
  ```
  **Output**: `652ad723...|3950|CASH|SUCCESS|PENDING_HANDOVER`
  ```sql
  SELECT "receiptNumber", "isBilingual" 
  FROM public."Receipt" WHERE "paymentId" = '652ad723-85d2-49cb-8862-e1b1a3a87f29';
  ```
  **Output**: `KC-REC-PRD-2026-00014|t` (`isBilingual = true`)
  ```sql
  SELECT "paidAmount", status FROM public."InstallmentDue" 
  WHERE "ticketId" = 'ed087ad5-ee76-481b-bc65-6de55ba61db0' AND "installmentMonth" = 2;
  ```
  **Output**: `3950|PAID`
- **BullMQ Queue Check**:
  - `JOB_DISPATCH_PAYMENT_RECEIPT` enqueued to `notification-queue` for receipt `KC-REC-PRD-2026-00014`.

---

### [2/8] `POST /api/v1/payments` (Record Payment B — UPI with `transactionRef`)
- **Role Required**: `ACCOUNTANT`, `SUPER_ADMIN`, `BRANCH_MANAGER`
- **HTTP Status**: `201 Created`
- **Request Payload**:
  ```json
  {
    "ticketId": "643f6f41-5bbd-4dbb-ae39-9d2e43383306",
    "installmentMonth": 2,
    "amount": 3950,
    "paymentMethod": "UPI",
    "transactionRef": "UPI-REF-998877661122",
    "notes": "Google Pay counter QR scan by Balasubramani",
    "idempotencyKey": "pay-upi-a0019bc3-84e7-481e-9866-620b8c8d1219",
    "collectedAt": "2026-10-24T20:05:21.100Z"
  }
  ```
- **API Response**:
  - `payment.id`: `"84413ed8-d3c8-40b9-bfa3-cbc8a17f75bc"`
  - `payment.paymentMethod`: `"UPI"`
  - `payment.transactionRef`: `"UPI-REF-998877661122"`
  - `payment.cashHandoverStatus`: `"ACKNOWLEDGED"` *(Digital payments directly credit the bank, bypassing physical cash drawer handover)*
  - `receipt.receiptNumber`: `"KC-REC-PRD-2026-00015"`
- **PostgreSQL 17 Database Proof**:
  ```sql
  SELECT id, amount, "paymentMethod", "transactionRef", "cashHandoverStatus" 
  FROM public."Payment" WHERE id = '84413ed8-d3c8-40b9-bfa3-cbc8a17f75bc';
  ```
  **Output**: `84413ed8...|3950|UPI|UPI-REF-998877661122|ACKNOWLEDGED`

---

### [3/8] `GET /api/v1/payments` (Paginated Query & Filters)
- **Step 3A (Staff Query with Filters)**:
  - Query: `?ticketId=ed087ad5...&paymentMethod=CASH&page=1&limit=5`
  - Token: Desk Accountant (`ACCOUNTANT`)
  - Status: `200 OK`
  - Response Data: Total matching records = `1`, Payment returned = `652ad723...`, Amount = `₹3,950`, Method = `CASH`.
- **Step 3B (Customer Query Automatic Scoping)**:
  - Query: `?page=1&limit=10`
  - Token: Customer 5 (`CUSTOMER`)
  - Status: `200 OK`
  - Customer Scoping Proof: All returned records strictly have `customerId == "f6d65f2c-260e-4012-b622-8312f86a9742"`. Zero leakage of other customer records.

---

### [4/8] `GET /api/v1/payments/:id` (Deep Relations & OWASP BOLA Defense)
- **Step 4A (Authorized Staff Deep Lookup)**:
  - Endpoint: `/api/v1/payments/652ad723-85d2-49cb-8862-e1b1a3a87f29`
  - Token: Desk Accountant (`ACCOUNTANT`)
  - Status: `200 OK`
  - Deep Relations Resolved:
    - `customer`: G. Arumugam (`+919876543214`)
    - `branch`: Perundurai Branch (`07c70d9d...`)
    - `recordedBy`: S. Priya (Desk Accountant)
    - `allocations`: Ticket #5, Month 2, `amountAllocated: ₹3,950`
    - `receipt`: `KC-REC-PRD-2026-00014`
- **Step 4B (OWASP BOLA Defense Enforcement)**:
  - Scenario: Customer 5 attempts to fetch Customer 6's payment (`84413ed8-d3c8-40b9-bfa3-cbc8a17f75bc`).
  - Status: **`403 Forbidden`**
  - Message: `Access denied: You can only view your own payment records`
  - Result: OWASP BOLA attack successfully blocked.

---

### [5/8] `GET /api/v1/payments/:id/receipt` (Bilingual On-Screen Receipt Layout)
- **Role Required**: Authenticated Staff, Member (Self)
- **HTTP Status**: `200 OK`
- **Extracted Bilingual Receipt Data**:
  - `receiptNumber`: `"KC-REC-PRD-2026-00014"`
  - `subscriberName`: `"G. Arumugam"`
  - `subscriberTamilName`: `"ஜி. ஆறுமுகம்"`
  - `schemeCode`: `"KC-LIVE-20M-01"`
  - `ticketNumber`: `5`
  - `installmentMonth`: `2`
  - `amountPaid`: `₹3,950`
- **Formatted Monospace Excerpt**:
  ```
  ================================================================================
                    KUMARAN FINANCE / குமரன் பைனான்ஸ்
               Chit Fund Operations / சீட்டு நிறுவனம்
        Main Road, Perundurai, Erode / தலைமை கிளை - பெருந்துறை
  ================================================================================
  Receipt No / ரசீது எண் : KC-REC-PRD-2026-00014
  Date / தேதி            : 24/10/2026
  Subscriber / சந்தாதாரர்: G. Arumugam / ஜி. ஆறுமுகம்
  Group / குழு           : KC-LIVE-20M-01 | Ticket / டிக்கெட் எண்: 5
  Month / தவணை மாதம்     : 2 | Amount Paid / செலுத்திய தொகை: ₹3950 (CASH)
  ================================================================================
  ```

---

### [6/8] `GET /api/v1/pdf/receipt/:paymentId` (ISO A5 Digital PDF Canvas & Presigned S3)
- **6A: Direct Binary Stream (`application/pdf`)**:
  - Request: `GET /api/v1/pdf/receipt/652ad723-85d2-49cb-8862-e1b1a3a87f29`
  - Status: `200 OK`
  - Header: `Content-Type: application/pdf`, `Content-Disposition: inline; filename="KC-REC-PRD-2026-00014.pdf"`
  - Buffer Verification: Size `26,931 bytes`, Magic Header: `%PDF-`
  - Geometry: ISO A5 portrait (`419.53 x 595.28 pt`), margins 20pt.
- **6B: Presigned S3 Download URL (`?download=true`)**:
  - Request: `GET /api/v1/pdf/receipt/652ad723-85d2-49cb-8862-e1b1a3a87f29?download=true`
  - Status: `200 OK`
  - Payload:
    ```json
    {
      "key": "receipts/15a2dd0cc88c/2026/KC-REC-PRD-2026-00014.pdf",
      "presignedUrl": "http://127.0.0.1:9000/kumaran-chits-private/receipts/15a2dd0cc88c/2026/KC-REC-PRD-2026-00014.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256...",
      "expiresInSeconds": 900
    }
    ```
  - S3 / MinIO Storage Proof: Object permanently vaulted in private encrypted bucket `kumaran-chits-private`.

---

### [7/8] `POST /api/v1/payments/:id/reject-reversal` (Checker Rejection Flow)
- **Step 7A (Maker Requests Reversal)**:
  - Endpoint: `POST /api/v1/payments/84413ed8.../request-reversal`
  - Maker: Desk Accountant (`5460c6e3...`)
  - Status: `200 OK` (`reversal.status: REQUESTED`)
  - Payload: `{"reason": "WRONG_TICKET_ENTERED", "notes": "Mistaken ticket entered"}`
- **Step 7B (Maker Self-Rejection Violation Guard)**:
  - Maker attempts to call `/reject-reversal`: **`403 Forbidden`**
  - Result: Dual-control guard prevents Maker from rejecting own request.
- **Step 7C (Checker Partner Rejection Commit)**:
  - Endpoint: `POST /api/v1/payments/84413ed8.../reject-reversal`
  - Checker: Super Admin (`ebf67759...`)
  - Status: `200 OK` (`reversal.status: REJECTED`)
  - Message: `Payment reversal request rejected successfully. Payment remains in SUCCESS status.`
- **PostgreSQL 17 Database Proof**:
  ```sql
  SELECT "paymentStatus" FROM public."Payment" WHERE id = '84413ed8...';
  -- Output: SUCCESS
  SELECT "paidAmount", status FROM public."InstallmentDue" 
  WHERE "ticketId" = '643f6f41...' AND "installmentMonth" = 2;
  -- Output: 3950|PAID
  SELECT action, "entityId", "userId" FROM public."AuditLog" 
  WHERE "entityId" = '84413ed8...' AND action = 'PAYMENT_REVERSAL_REJECTED' 
  ORDER BY "timestamp" DESC LIMIT 1;
  -- Output: PAYMENT_REVERSAL_REJECTED|84413ed8...|ebf67759-bf05-4fa6-b653-577b3f144900
  ```

---

### [8/8] `POST /api/v1/payments/:id/approve-reversal` (Checker Approval Flow)
- **Step 8A (Maker Requests Reversal)**:
  - Endpoint: `POST /api/v1/payments/652ad723.../request-reversal`
  - Maker: Desk Accountant (`5460c6e3...`)
  - Status: `200 OK` (`reversal.status: REQUESTED`)
  - Payload: `{"reason": "CHEQUE_BOUNCE", "notes": "Bank returned memo Insufficient Funds"}`
- **Step 8B (Maker Self-Approval Violation Guard)**:
  - Maker attempts to call `/approve-reversal`: **`403 Forbidden`**
  - Result: Dual-control guard blocks Maker self-approval.
- **Step 8C (Checker Partner Approval Commit)**:
  - Endpoint: `POST /api/v1/payments/652ad723.../approve-reversal`
  - Checker: Super Admin (`ebf67759...`)
  - Status: `200 OK` (`reversal.status: APPROVED`, `paymentStatus: REVERSED`, `dueStatus: UNPAID`)
- **PostgreSQL 17 Database Proof**:
  ```sql
  SELECT "paymentStatus" FROM public."Payment" WHERE id = '652ad723...';
  -- Output: REVERSED
  SELECT status, "initiatedByUserId", "approvedByUserId" 
  FROM public."PaymentReversal" WHERE "paymentId" = '652ad723...';
  -- Output: APPROVED|5460c6e3-607f-4931-b789-d269b65f852a|ebf67759-bf05-4fa6-b653-577b3f144900
  SELECT "paidAmount", status FROM public."InstallmentDue" 
  WHERE "ticketId" = 'ed087ad5...' AND "installmentMonth" = 2;
  -- Output: 0|UNPAID (Ledger restored to UNPAID)
  SELECT action, "entityId", "userId" FROM public."AuditLog" 
  WHERE "entityId" = '652ad723...' AND action = 'PAYMENT_REVERSED' 
  ORDER BY "timestamp" DESC LIMIT 1;
  -- Output: PAYMENT_REVERSED|652ad723...|ebf67759-bf05-4fa6-b653-577b3f144900
  ```

---

## 3. Compliance & Architectural Invariants Verified

| Invariant | Result | Verification Proof |
|---|---|---|
| **Maker $\ne$ Checker Financial Dual Control (Guardrail #10)** | ✅ 100% Enforced | Self-approval and self-rejection by Maker strictly rejected with `HTTP 403 Forbidden`. Only distinct Super Admin could authorize or reject. |
| **Reversal Rejection Safe Preservation** | ✅ 100% Verified | When Checker rejected reversal, payment remained `SUCCESS`, and subscriber installment due remained `3950|PAID`. |
| **Reversal Approval Ledger Rollback** | ✅ 100% Verified | When Checker approved reversal, payment transitioned to `REVERSED`, and subscriber installment due was atomically restored to `0|UNPAID`. |
| **OWASP BOLA Protection** | ✅ 100% Enforced | Customer trying to access another customer's payment returned `HTTP 403 Forbidden`. |
| **Zero Thermal Printers & Standard ISO A5 Canvas** | ✅ 100% Compliant | No thermal receipt endpoints or 80mm roll layouts exist. Digital receipts rendered in standard ISO A5 (`419.53 x 595.28 pt`) with Tamil + English bilingual typography. |
| **Private S3 Vault & 15-Minute Expiry** | ✅ 100% Verified | Receipt PDFs stored in private MinIO/S3 bucket with 900s time-limited presigned URLs. |
| **Whole Rupee BigInt Math** | ✅ 100% Enforced | All amounts (`3950`) stored and processed as integer Rupees without floating points or paise. |

---

## 4. Status: 100% Passed & Verified

- **Lifecycle 7 Scope**: **8 / 8 Steps Passed (100%)** ✅
- **Database Verified**: Direct PostgreSQL 17 Docker `chitflow-db` queries confirmed counter payments, receipts, reversal states, and automatic ledger restoration.
- **Queue Verified**: BullMQ `notification-queue` async receipt jobs dispatched post-commit.
- **S3 Verified**: Presigned URLs and S3 object keys generated cleanly.
