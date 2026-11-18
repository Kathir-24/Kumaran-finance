# Kumaran Chits — Native Zero-Fee UPI & Bank Reconciliation Specification

> **Product**: **Kumaran Chits** (Kumaran Finance, Perundurai, Tamil Nadu)  
> **Mandate (`CONFIRMED-BY-DEVELOPER` / ADR-19)**: **Strictly ZERO third-party payment gateways (No Razorpay, Cashfree, PayU, or 2% MDR fees)**. All online payments settle directly into Kumaran Finance's Karur Vysya Bank (KVB) Current Account in Perundurai using NPCI's Native UPI Intent Protocol.

---

## 1. Native One-Tap UPI Architecture & Lifecycles

In place of costly aggregator gateways that charge 1.5%–2% + GST per transaction, Kumaran Chits leverages the **NPCI UPI 2.0 Intent Protocol**:

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Subscriber (Phase 1 Web/UPI Link & Dart Core / Phase 2 Flutter App — ADR-26)
    participant UPIApp as GPay / PhonePe / Paytm / BHIM
    participant Backend as NestJS API (apps/api)
    participant DB as PostgreSQL 17 (chitflow_dev)
    actor Accountant as Desk Accountant / Cashier (Checker)
    participant KVB as Karur Vysya Bank (KVB) NetBanking
    participant Queue as BullMQ (notification-queue)

    Customer->>Backend: GET /installments/:dueId/upi-intent
    Backend->>DB: Validates due is UNPAID & caller owns ticket (Anti-BOLA)
    Backend-->>Customer: Returns NPCI URI (upi://pay?pa=kumaranfinance@kvb&am=Inet&tn=...)
    Customer->>UPIApp: 1-Tap Deep-Link launches UPI app with amount LOCKED
    Customer->>UPIApp: Enters secret UPI PIN
    UPIApp->>KVB: Immediate IMPS credit to Kumaran Finance KVB Current Account
    UPIApp-->>Customer: Payment Successful (Displays 12-digit Bank UTR)
    Customer->>Backend: POST /payments/upi-claim { dueId, utrNumber, notes }
    Backend->>DB: Asserts Bank UTR uniqueness (Payment.transactionRef @unique)
    Backend->>DB: Transaction: Create Payment (status = INITIATED), Create Allocation
    DB-->>Backend: Commit Successful
    Backend-->>Customer: HTTP 201 Created ("Claim recorded pending bank verification")

    Note over Accountant,KVB: Accounting Desk Verification (Maker != Checker)

    Accountant->>Backend: GET /payments/pending-upi-claims
    Backend-->>Accountant: Returns pending claims with subscriber name, due & UTR
    Accountant->>KVB: Checks KVB NetBanking / Mobile App for matching ₹ credit & UTR
    Accountant->>Backend: POST /payments/:id/verify-upi-claim { verificationNotes }
    Backend->>Backend: Enforces Maker != Checker (Submitter != Accountant)
    Backend->>DB: Transaction: Payment -> SUCCESS, Issue Sequential Receipt, Mark Due -> PAID
    DB-->>Backend: Commit Successful
    Backend->>Queue: Enqueue JOB_DISPATCH_PAYMENT_RECEIPT (TRAI DLT SMS Phase 1 / FCM Push Phase 2)
    Backend-->>Accountant: HTTP 200 OK (Receipt KC-REC-PRD-YYYY-XXXXX issued)
    Queue-->>Customer: Bilingual TRAI DLT SMS (Phase 1 primary, ADR-23) / FCM Push (Phase 2) & Passbook updated to PAID!
```

---

## 2. The 3 Security & Financial Invariant Guards

### 2.1 Whole-Rupee Amount Locking ($I_{net} = I_{base} - Div$)
The generated NPCI URI dynamically locks the exact net installment due into the `am` parameter:
```
upi://pay?pa=kumaranfinance@kvb&pn=Kumaran+Finance&am=3950&cu=INR&tn=KCA-1L-20M-01+Ticket+%231+Month+3&tr=80210f78...
```
When launched on Android, the payment app does not allow the subscriber to edit or change the amount, preventing underpayments or overpayments.

### 2.2 Bank UTR & Payout Reference Anti-Duplication Constraints (PostgreSQL 17)
- In [`apps/api/prisma/schema.prisma`](file:///u:/Kumaran-finance/apps/api/prisma/schema.prisma):
  ```prisma
  transactionRef String? @unique // UPI Ref, Cheque number, Bank UTR
  ```
- Migration [`20261027094809_add_transaction_ref_unique_constraint`](file:///u:/Kumaran-finance/apps/api/prisma/migrations/20261027094809_add_transaction_ref_unique_constraint/migration.sql) establishes a B-tree unique index in PostgreSQL (`Payment_transactionRef_key`).
- In addition, migration [`20261118124500_case_insensitive_payout_ref_index`](file:///u:/Kumaran-finance/apps/api/prisma/migrations/20261118124500_case_insensitive_payout_ref_index/migration.sql) enforces case-insensitive partial unique index **`uq_auction_winner_non_cash_payment_ref`** preventing duplicate non-cash prize payout cheque/NEFT/UPI references.
- Standard SQL rule: `NULL` entries are permitted infinitely for physical cash transactions, but any non-null 12-digit UTR string can only be entered once across the lifetime of the database.
- Collision attempts return `HTTP 409 Conflict` (`DUPLICATE_TRANSACTION_REF`).

### 2.3 Strict Maker != Checker Separation
- If an office staff member or collection agent enters a payment claim on behalf of a customer, they are permanently recorded as the `maker` (`recordedByUserId`).
- The endpoint `POST /payments/:id/verify-upi-claim` enforces that `recordedByUserId != checkerUserId`.
- Only an independent staff member (`ACCOUNTANT`, `BRANCH_MANAGER`, or `SUPER_ADMIN`) who did not submit the claim can verify the credit against KVB NetBanking.

---

## 3. Endpoints & API Contract Reference

| Method & Path | Exact Live `@Roles(...)` | Description |
|---|---|---|
| `GET /api/v1/installments/:dueId/upi-intent` | `CUSTOMER`, `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT`, `COLLECTION_AGENT` ([`installment.controller.ts:132-138`](file:///u:/Kumaran-finance/apps/api/src/installment/installment.controller.ts#L132-L138); excludes `AUDITOR`) | Builds standard NPCI 1-tap `upi://pay` URI locking exact whole-rupee $I_{net}$ amount and KVB account payee VPA (`kumaranfinance@kvb`). |
| `POST /api/v1/payments/upi-claim` | `CUSTOMER`, `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT` ([`payment.controller.ts:309`](file:///u:/Kumaran-finance/apps/api/src/payment/payment.controller.ts#L309); excludes `COLLECTION_AGENT` & `AUDITOR`) | Customer/staff submits 12-digit bank UTR reference. Validates UTR uniqueness; records payment in `INITIATED` status pending bank check. |
| `GET /api/v1/payments/pending-upi-claims` | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT` ([`payment.controller.ts:140`](file:///u:/Kumaran-finance/apps/api/src/payment/payment.controller.ts#L140)) | Lists paginated (`?page=1&limit=20`, max `100`) pending UPI claims via `ApiPaginatedResponseEnvelope` for Accounting Desk statement matching. |
| `POST /api/v1/payments/:id/verify-upi-claim` | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT` ([`payment.controller.ts:330`](file:///u:/Kumaran-finance/apps/api/src/payment/payment.controller.ts#L330)) | Confirms bank credit. Transitions payment to `SUCCESS`, issues bilingual receipt, marks due `PAID`. **Enforces `maker != checker`**. |

---

## 4. Automated Tests & Live Verification Proofs

- **Unit Test Suite**: [`apps/api/test/unit/payment.spec.ts`](file:///u:/Kumaran-finance/apps/api/test/unit/payment.spec.ts)
  - Bank UTR anti-duplication collision rejection (`ConflictException 409`)
  - Customer UPI claim submission in `INITIATED` status
  - Duplicate pending claim prevention on same due
  - Dual control verification with sequential bilingual receipt issuance
  - Submitter self-verification rejection (`maker != checker`)
- **Live Server Integration Script**: [`apps/api/scripts/stress/verify-upi-intent-and-claims.ts`](file:///u:/Kumaran-finance/apps/api/scripts/stress/verify-upi-intent-and-claims.ts)
  - Proves end-to-end execution against live PostgreSQL 17 on Port 5433 with 100% pass rate.
