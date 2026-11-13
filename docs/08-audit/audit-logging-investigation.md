# AUDIT LOGGING & STATUTORY IMMUTABILITY INVESTIGATION — KUMARAN CHITS
**Kumaran Finance — Perundurai Head Office, Erode District, Tamil Nadu**  
**Audit Stage**: Independent Verification & Statutory Audit Logging Audit  
**Date**: November 2026  
**Auditor**: Antigravity Senior Engineering & Audit Swarm  

---

## 1. Statutory Compliance & Legal Mandate

Under Section 67 and Section 38 of the **Chit Funds Act, 1982** (and Tamil Nadu Chit Funds Rules, 1984), every chit fund company is legally obligated to maintain an immutable, tamper-evident record of all operational and financial transactions.

In Kumaran Chits, audit trails serve two essential purposes:
1. **Internal Dual Control Verification**: Tracking Maker and Checker identities across payment reversals, auction corrections, prize payouts, and defaulter removals.
2. **Statutory Auditor Inspection**: Providing the independent Chartered Accountant (Auditor) and Tamil Nadu Chit Registrar inspectors with unalterable historical evidence.

---

## 2. Audit Trail Data Model & Immutability Guarantees

All events are recorded in the `AuditLog` table (`apps/api/prisma/schema.prisma`):

```prisma
model AuditLog {
  id         String   @id @default(uuid())
  entityType String   // "Payment", "Auction", "SubscriberTicket", "CollectionBatch"
  entityId   String   // Target entity UUID
  action     String   // Specific action verb
  oldValue   Json?    // Snapshot of entity state before mutation
  newValue   Json?    // Snapshot of entity state after mutation
  userId     String   // Actor user UUID
  ipAddress  String?  // Client IP address
  userAgent  String?  // Client user agent
  timestamp  DateTime @default(now())

  user       User     @relation(fields: [userId], references: [id])

  @@index([entityType, entityId])
  @@index([userId])
  @@index([timestamp])
}
```

### Core Immutability Guarantees:
1. **Append-Only Architecture**: Zero `PUT`, `PATCH`, or `DELETE` endpoints exist for the `AuditLog` model in NestJS controllers.
2. **Database Level Protection**: The application user connection has no permissions to alter existing audit log rows.
3. **Structured JSON Diffs**: `oldValue` and `newValue` store full JSON state representations, allowing granular before-and-after state reconstruction.

---

## 3. Inventory of Audited Operational Events

| Domain | Action Verb | Trigger Condition & State Change | Captured Data |
|---|---|---|---|
| **Payments** | `PAYMENT_RECORDED` | Cashier records installment collection | Amount, Receipt No, Payment Mode, Due ID |
| **Payments** | `PAYMENT_REVERSAL_REQUESTED` | Maker requests receipt reversal | Payment ID, Reason, Maker User ID |
| **Payments** | `PAYMENT_REVERSAL_APPROVED` | Partner approves receipt reversal | Partner User ID, Reversal Timestamp, Watermark |
| **Payments** | `PAYMENT_REVERSAL_REJECTED` | Partner rejects receipt reversal | Partner User ID, Rejection Notes |
| **Auctions** | `AUCTION_FINALIZED` | Partner commits auction proceedings | Winning Ticket, Discount, Dividends, Minutes |
| **Auctions** | `AUCTION_CORRECTION_REQUESTED` | Partner A requests correction | Corrected Discount, Corrected Winner, Reason |
| **Auctions** | `AUCTION_CORRECTION_APPROVED` | Partner B approves correction | Reconciled Dividends, Downstream Dues Updated |
| **Disbursements** | `PRIZE_SAFETY_PROOF_VERIFIED` | Maker verifies checklist & docs | Agreement, Blank Cheques, Nominee, S3 Key |
| **Disbursements** | `PRIZE_PAYOUT_AUTHORIZED` | Partner authorizes prize payout | Authorized Disbursed, Arrears Offset |
| **Disbursements** | `PRIZE_PAYOUT_RELEASED` | Cashier releases funds to winner | Transaction Ref, Payment Mode, Payout Time |
| **Disbursements** | `PRIZE_ARREARS_OFFSET_ALLOCATED` | TOCTOU arrears settled from prize | Ticket ID, Due ID, Settled Amount |
| **Defaulters** | `DEFAULTER_REMOVAL_REQUESTED` | Partner A requests removal | Ticket ID, Customer ID, 3-Month Arrears |
| **Defaulters** | `DEFAULTER_REMOVAL_APPROVED` | Partner B approves removal | Removal Reason, Vacated Ticket ID |
| **Handovers** | `CASH_HANDOVER_SUBMITTED` | Field agent submits route cash | Batch ID, Cash Total, Route Count |
| **Handovers** | `CASH_HANDOVER_ACKNOWLEDGED` | Accountant acknowledges cash | Note Denominations, Discrepancy (if any) |

---

## 4. Test Suite Verification Evidence

| Test Suite | File Path | Invariants Tested | Result |
|---|---|---|---|
| State Matrix Sweep | `test/unit/state-matrix-sweep.spec.ts` | Complete audit log emission across every lifecycle mutation | **PASS** (100%) |
| Web Audit Register | `apps/web/test/audit-register.spec.ts` | Read-only immutability, persona isolation, diff formatting | **PASS** (100%) |
| Concurrency Audit | `test/unit/concurrency-postgres.spec.ts` | Audit log creation inside ACID transaction boundary | **PASS** (100%) |
