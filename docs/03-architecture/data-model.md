# Kumaran Chits — Database Schema & Entity-Relationship Design

> **Product**: **Kumaran Chits** (Kumaran Finance)  
> **Architecture Decision**: Based on **ADR-01**, this schema is a **strict single-company database**. No redundant `company_id` columns exist.  
> **Key Architectural Mandates (`CONFIRMED-BY-DEVELOPER`)**:
> 1. **Whole Rupee Arithmetic**: All monetary currency values are stored as 64-bit integer Rupees (`BigInt`). Paise are never used in Kumaran Finance operations.
> 2. **Dynamic Personas ($N$ Users per Role)**: The system supports an arbitrary, dynamic number of users per persona; headcounts are never static.
> 3. **Ticket Limit Constraint**: Database-level unique constraint prevents any single customer from holding 2 or more tickets in the same chit group (`@@unique([chitGroupId, customerId])`).
> 4. **Commission Snapshotting**: 4.00% default with immutable group-level and auction-level freezes.
> 5. **Company Safety Proof Recordkeeping**: Flexible security checklist (signed agreements, nominee signatures, blank cheques, promissory notes) on prize winners. Property documents eliminated; collateral is non-mandatory.
> 6. **Fixed 1/4 Discount Ceiling & Physical Tie-Breaks**: Maximum auction discount fixed at strictly 1/4 (25%) of total chit value with support for in-branch physical paper token tie-breaks.
> 7. **Single Discrete Payments & Zero Advance Balance**: Each installment month accepts strictly one payment; zero double payments and zero advance balance concept.
> 8. **Bank UTR Anti-Duplication Constraint (ADR-19)**: Database-level unique constraint on `Payment.transactionRef` (`@unique`) prevents any bank UTR or cheque reference from being submitted or credited twice. Nullable to allow infinite cash payments.

---

## 1. High-Level Entity Relationship Diagram (ERD)

```mermaid
erDiagram
    BRANCH ||--o{ USER : employs
    BRANCH ||--o{ CHIT_GROUP : manages
    BRANCH ||--o{ CUSTOMER : registers
    BRANCH ||--o{ RECEIPT : issues

    USER ||--o{ PAYMENT : records
    USER ||--o{ AUDIT_LOG : authors
    USER ||--o{ SESSION : owns_device_family

    CUSTOMER ||--o{ NOMINEE : designates
    CUSTOMER ||--o{ CUSTOMER_DOCUMENT : uploads
    CUSTOMER ||--o{ SUBSCRIBER_TICKET : owns
    CUSTOMER ||--o{ SESSION : owns_device_family

    CHIT_GROUP ||--o{ SUBSCRIBER_TICKET : contains
    CHIT_GROUP ||--o{ AUCTION : conducts
    CHIT_GROUP ||--o{ INSTALLMENT_DUE : schedules

    SUBSCRIBER_TICKET ||--o{ INSTALLMENT_DUE : owes
    SUBSCRIBER_TICKET ||--o{ PAYMENT_ALLOCATION : credited_via
    SUBSCRIBER_TICKET ||--o{ AUCTION_WINNER : wins
    SUBSCRIBER_TICKET ||--o{ AUCTION_TIE_BIDDER : competes_in

    AUCTION ||--o| AUCTION_WINNER : determines
    AUCTION ||--o| AUCTION_MINUTES : records
    AUCTION ||--o{ AUCTION_TIE_BIDDER : tracks_ties

    PAYMENT ||--o{ PAYMENT_ALLOCATION : splits_into
    PAYMENT ||--o| RECEIPT : generates
    PAYMENT ||--o| PAYMENT_REVERSAL : reversed_by

    INSTALLMENT_DUE ||--o{ PAYMENT_ALLOCATION : satisfied_by
```

---

## 2. Complete Prisma Schema Specification

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// -------------------------------------------------------------
// 1. Branch & Staff Management (Single Company: Kumaran Finance)
// -------------------------------------------------------------

model Branch {
  id          String   @id @default(uuid())
  code        String   @unique // e.g., "HO", "PRD"
  name        String   // "Head Office - Perundurai"
  nameTamil   String?  // "தலைமை கிளை - பெருந்துறை"
  address     String
  phone       String
  isActive    Boolean  @default(true)
  version     Int      @default(1) // Optimistic concurrency control
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  users       User[]
  chits       ChitGroup[]
  customers   Customer[]
  receipts    Receipt[]
}

// Supports dynamic N persons per persona across present and future
enum Role {
  SUPER_ADMIN      // Partners / Proprietor (full oversight, final checker approval)
  BRANCH_MANAGER   // Operational branch head (maker for auctions, member intake)
  ACCOUNTANT       // Financial verification, day books, reconciliations, voucher prep
  COLLECTION_AGENT // Doorstep field collections, mobile app
  CUSTOMER         // Chit subscribers viewing personal passbook & paying online
  AUDITOR          // Independent chartered accountant (read-only audit views)
}

model User {
  id               String    @id @default(uuid())
  branchId         String?
  branch           Branch?   @relation(fields: [branchId], references: [id])
  name             String
  phone            String    @unique
  passwordHash     String
  roles            Role[]    // Supports multiple roles (e.g., [COLLECTION_AGENT, ACCOUNTANT] or [SUPER_ADMIN])
  isPartner        Boolean   @default(false) // Verified business partner identity (SEC-A)
  isActive         Boolean   @default(true)
  totpSecret       String?   // RFC 6238 TOTP secret for Microsoft Authenticator 2FA
  isTotpEnabled    Boolean   @default(false)
  mpinHash         String?   // 6-digit MPIN bcrypt hash for mobile quick unlock
  refreshTokenHash String?   // Hashed refresh token for active session revocation
  fcmToken         String?   // Firebase Cloud Messaging device push token for mobile instant approvals
  lastLoginAt      DateTime?
  tokenRevokedBefore DateTime? // Authoritative revocation cutoff timestamp for zero resurrection (F02)
  mustChangePassword Boolean   @default(false) // Forced first-login password change flag (F16)
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  collections      Payment[] @relation("AgentPayments")
  auditLogs        AuditLog[]
  sessions         Session[]
}

// -------------------------------------------------------------
// 2. Customer & KYC Management
// -------------------------------------------------------------

model Customer {
  id                 String             @id @default(uuid())
  branchId           String
  branch             Branch             @relation(fields: [branchId], references: [id])
  customerCode       String             @unique // e.g., "KC-CUST-00101"
  fullName           String
  fullNameTamil      String?
  phone              String             @unique
  altPhone           String?
  addressLine1       String
  addressLine2       String?
  city               String
  pincode            String
  panNumber          String?
  aadhaarLast4       String?            // Storing only masked last 4 digits for data minimization
  fcmToken           String?            // Firebase Cloud Messaging device push token for mobile passbook alerts
  refreshTokenHash   String?            // Hashed refresh token for active session revocation (RFC 6819)
  lastLoginAt        DateTime?          // Timestamp of most recent customer authentication
  tokenRevokedBefore DateTime?          // Durable PostgreSQL timestamp for invalidating subscriber sessions
  isKycVerified      Boolean            @default(false)
  version            Int                @default(1) // Optimistic concurrency control
  createdAt          DateTime           @default(now())
  updatedAt          DateTime           @updatedAt

  nominees           Nominee[]
  documents          CustomerDocument[]
  tickets            SubscriberTicket[]
  sessions           Session[]

  @@index([branchId])
}

model Session {
  id               String    @id @default(uuid())
  userId           String?
  user             User?     @relation(fields: [userId], references: [id], onDelete: Cascade)
  customerId       String?
  customer         Customer? @relation(fields: [customerId], references: [id], onDelete: Cascade)
  clientType       String    // 'WEB', 'MOBILE', 'DESKTOP' (F04 Multi-Device Isolation)
  refreshTokenHash String?   // Device-family specific refresh token bcrypt hash
  revokedAt        DateTime?
  expiresAt        DateTime
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  @@unique([userId, clientType])
  @@unique([customerId, clientType])
  @@index([expiresAt])
}

model Nominee {
  id           String    @id @default(uuid())
  customerId   String
  customer     Customer  @relation(fields: [customerId], references: [id], onDelete: Cascade)
  fullName     String
  relationship String    // "Spouse", "Son", "Father"
  phone        String
  aadhaarLast4 String?
  createdAt    DateTime  @default(now())

  @@index([customerId])
}

model CustomerDocument {
  id           String    @id @default(uuid())
  customerId   String
  customer     Customer  @relation(fields: [customerId], references: [id], onDelete: Cascade)
  docType      String    // "AADHAAR_FRONT", "PAN", "PHOTO", "SIGNATURE"
  s3Key        String    // Private S3 object key
  fileName     String
  verified     Boolean   @default(false)
  uploadedAt   DateTime  @default(now())

  @@index([customerId])
}

// -------------------------------------------------------------
// 3. Chit Groups, Mid-Cycle Onboarding & Fixed 1/4 Ceiling
// -------------------------------------------------------------

enum ChitStatus {
  DRAFT
  REGISTERED // Sanction order recorded
  ACTIVE     // In progress
  COMPLETED  // All installments finished
  CLOSED     // Accounts reconciled and closed
  CANCELLED  // Cancelled draft scheme
}

enum InitializationMode {
  NEW_GROUP      // Starts from Month 1
  ONGOING_GROUP  // Mid-cycle onboarding from physical paper notebooks (e.g. at Month 7)
}

model ChitGroup {
  id                     String                  @id @default(uuid())
  branchId               String
  branch                 Branch                  @relation(fields: [branchId], references: [id])
  groupCode              String                  @unique // e.g., "KCA-1L-20M-01"
  groupName              String                  // "₹1 Lakh 20 Months Group A"
  groupNameTamil         String?
  chitValue              BigInt                  // Whole integer Rupees (e.g., 100000)
  durationMonths         Int                     // 20
  totalTickets           Int                     // 20
  baseInstallment        BigInt                  // Whole integer Rupees: chitValue / durationMonths (e.g., 5000)
  
  // Commission Snapshot Pattern: 4.00% default, frozen per group
  foremanCommissionRate  Decimal                 @default(4.00) @db.Decimal(5, 2)
  
  // Fixed 1/4 (25%) Discount Ceiling: chitValue / 4
  maxDiscountCeiling     BigInt                  // Whole integer Rupees: chitValue / 4 (e.g., 25000)
  
  // Mid-cycle onboarding support
  initMode               InitializationMode      @default(NEW_GROUP)
  onboardedAtMonth       Int                     @default(1) // e.g., 7 if onboarded at Month 7
  
  status                 ChitStatus              @default(DRAFT)
  createdByUserId        String?                 // User ID who created or onboarded the scheme (Maker)
  activatedByUserId      String?                 // Partner User ID who approved and activated scheme (Checker)
  sanctionOrderNumber    String?                 // Regulatory reference from Chit Registrar
  sanctionDate           DateTime?
  startDate              DateTime
  endDate                DateTime
  createdAt              DateTime                @default(now())
  updatedAt              DateTime                @updatedAt

  tickets                SubscriberTicket[]
  auctions               Auction[]
  dues                   InstallmentDue[]
}

model SubscriberTicket {
  id                      String           @id @default(uuid())
  chitGroupId             String
  chitGroup               ChitGroup        @relation(fields: [chitGroupId], references: [id])
  customerId              String
  customer                Customer         @relation(fields: [customerId], references: [id])
  ticketNumber            Int              // 1 to 20
  isPrized                Boolean          @default(false)
  prizedAuctionId         String?
  openingBalance          BigInt           @default(0) // Whole integer Rupees for mid-cycle onboarding
  consecutiveUnpaidMonths Int              @default(0) // Tracks continuous unpaid months (triggers removal rights at 3)
  joiningDate             DateTime         @default(now())
  status                  String           @default("ACTIVE") // ACTIVE, DEFAULT_3_MONTHS, PENDING_REMOVAL_APPROVAL, REMOVED_DEF_3M, SURRENDERED
  removalRequestedAt      DateTime?        // Timestamp of Partner A removal request
  removalRequestedByUserId String?         // Partner A user UUID
  removalReason           String?          // Mandatory reason for removal request
  removedAt               DateTime?        // Timestamp if approved by Partner B (maker != checker)
  removedByUserId         String?          // Partner B user UUID who authorized removal

  dues                    InstallmentDue[]
  allocations             PaymentAllocation[]
  winningAuction          AuctionWinner?
  tieBids                 AuctionTieBidder[]

  @@unique([chitGroupId, ticketNumber])
  // Architectural Constraint: Prevents a single customer from holding 2 or more tickets in the SAME chit group
  @@unique([chitGroupId, customerId])
  @@index([customerId]) // Fast lookup for customer mobile passbooks
}

// -------------------------------------------------------------
// 4. In-Office Staff-Recorded Auction Engine & Tie-Breakers
// -------------------------------------------------------------

enum AuctionStatus {
  SCHEDULED
  COMPLETED
  MINUTES_FILED
}

model Auction {
  id                     String           @id @default(uuid())
  chitGroupId            String
  chitGroup              ChitGroup        @relation(fields: [chitGroupId], references: [id])
  installmentMonth       Int              // Month 1 to 20 (Month 1 & Month N have NO auction)
  auctionDate            DateTime
  status                 AuctionStatus    @default(SCHEDULED)
  isHistoricalEntry      Boolean          @default(false) // True if imported during mid-cycle onboarding
  
  // Auction financial snapshots (Strictly whole integer Rupees)
  bidDiscount            BigInt?          // Whole Rupees
  foremanCommissionRate  Decimal?         @db.Decimal(5, 2) // Rate frozen at auction time (4.00%)
  foremanCommissionAmount BigInt?         // Exact whole ₹ amount
  totalDividend          BigInt?          // Whole Rupees: bidDiscount - commission
  dividendPerTicket      BigInt?          // Whole Rupees: divided equally across all tickets in group (including winner)
  prizeMoney             BigInt?          // Whole Rupees: chitValue - bidDiscount
  
  conductedByUserId      String?          // Staff/Manager who entered the result (Maker)
  finalizedByUserId      String?          // Partner/Super Admin who approved result (Checker)
  createdAt              DateTime         @default(now())
  updatedAt              DateTime         @updatedAt

  winner                 AuctionWinner?
  tieBidders             AuctionTieBidder[]
  minutes                AuctionMinutes?

  @@unique([chitGroupId, installmentMonth])
}

enum DisbursementMode {
  ACCOUNT_PAYEE_CHEQUE
  BANK_TRANSFER_NEFT
  BANK_TRANSFER_RTGS
  BANK_TRANSFER_IMPS
  CASH
}

model AuctionWinner {
  id                     String            @id @default(uuid())
  auctionId              String            @unique
  auction                Auction           @relation(fields: [auctionId], references: [id])
  ticketId               String            @unique
  ticket                 SubscriberTicket  @relation(fields: [ticketId], references: [id])
  wasTieBreakWinner      Boolean           @default(false)
  
  // Company Safety Proof Checklist (Recordkeeper pattern)
  isSecurityRequired     Boolean           @default(false) // Evaluated case-by-case (not mandatory)
  securityType           String?           // "BLANK_CHEQUE", "SIGNED_AGREEMENT", "PROMISSORY_NOTE", "OTHER"
  blankChequeDetails     String?           // Bank name, cheque numbers, account holder name
  agreementSigned        Boolean           @default(false) // Winner agreement signature
  nomineeSigned          Boolean           @default(false) // Nominee signature
  securityDocS3Key       String?           // Scanned papers, signed cheques, agreements
  verifiedByUserId       String?           // Staff / Branch Manager (Maker)
  
  disbursementStatus     String            @default("PENDING_VERIFICATION") // PENDING_VERIFICATION, VERIFIED_BY_MAKER, AUTHORIZED_BY_CHECKER, DISBURSED
  disbursementMode       DisbursementMode? // Cheque, NEFT/RTGS/IMPS, Cash
  disbursedAmount        BigInt?           // Whole integer Rupees
  authorizedByUserId     String?           // Super Admin / Partner (Checker)
  disbursedAt            DateTime?
  paymentReference       String?           // Cheque number, Bank UTR, or Cash voucher receipt number
  isHistoricalEntry      Boolean           @default(false) // True if imported during mid-cycle onboarding
}

model AuctionTieBidder {
  id                 String           @id @default(uuid())
  auctionId          String
  auction            Auction          @relation(fields: [auctionId], references: [id], onDelete: Cascade)
  ticketId           String
  ticket             SubscriberTicket @relation(fields: [ticketId], references: [id])
  bidDiscount        BigInt           // All tied at ceiling (Whole Rupees)
  tokenNumber        Int?             // Physical paper token drawn at branch
  isWinner           Boolean          @default(false)

  @@unique([auctionId, ticketId])
  @@index([ticketId])
}

model AuctionMinutes {
  id                 String    @id @default(uuid())
  auctionId          String    @unique
  auction            Auction   @relation(fields: [auctionId], references: [id])
  subscribersPresent Int
  minutesText        String    @db.Text
  signedByForeman    Boolean   @default(false)
  filedAtRegistrar   Boolean   @default(false)
  filedDate          DateTime?
  filingReference    String?   // Government Challan No / Acknowledgement Slip No
  filingNotes        String?   // Staff remarks or filing details
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @default(now()) @updatedAt
}

// -------------------------------------------------------------
// 5. Installment Dues, Payments, & Bilingual Receipts
// -------------------------------------------------------------

enum DueStatus {
  UNPAID
  PAID
  OVERDUE
}

model InstallmentDue {
  id                 String              @id @default(uuid())
  chitGroupId        String
  chitGroup          ChitGroup           @relation(fields: [chitGroupId], references: [id])
  ticketId           String
  ticket             SubscriberTicket    @relation(fields: [ticketId], references: [id])
  installmentMonth   Int                 // Month 1 to 20
  cycleStartDate     DateTime?           // Payment Date / Cycle start (e.g. 22/11/2022)
  cycleEndDate       DateTime?           // Cycle end date (e.g. 22/12/2022)
  dueDate            DateTime            // Payment Due Date
  grossAmount        BigInt              // Base installment in whole Rupees (e.g., 5000)
  dividendDeduction  BigInt              @default(0) // Allocated dividend in whole Rupees
  netPayableAmount   BigInt              // grossAmount - dividendDeduction
  paidAmount         BigInt              @default(0)
  status             DueStatus           @default(UNPAID)
  createdAt          DateTime            @default(now())
  updatedAt          DateTime            @updatedAt

  allocations        PaymentAllocation[]

  @@unique([ticketId, installmentMonth])
  @@index([chitGroupId, installmentMonth])
  @@index([status, dueDate]) // Optimizes midnight arrears and defaulter batch processing
}

enum PaymentMethod {
  CASH
  UPI
  BANK_TRANSFER
  CHEQUE
}

enum PaymentStatus {
  INITIATED
  SUCCESS
  FAILED
  REVERSED
}

model Payment {
  id                 String              @id @default(uuid())
  branchId           String
  recordedByUserId   String
  recordedByUser     User                @relation("AgentPayments", fields: [recordedByUserId], references: [id])
  customerId         String
  amount             BigInt              // Whole integer Rupees
  paymentMethod      PaymentMethod
  paymentStatus      PaymentStatus       @default(INITIATED)
  idempotencyKey     String?             @unique
  transactionRef     String?             @unique // UPI Ref, Cheque number, Bank UTR (Unique per bank credit)
  chequeStatus                     String?             // PENDING, CLEARED, BOUNCED
  cashHandoverStatus               String?             // PENDING_HANDOVER, ACKNOWLEDGED
  cashHandoverAcknowledgedByUserId String?             // Partner / Cashier who counted and verified physical cash
  cashHandoverAcknowledgedAt       DateTime?
  notes                            String?             // Optional cashier remarks or collection notes
  createdAt                        DateTime            @default(now())

  allocations        PaymentAllocation[]
  receipt            Receipt?
  reversal           PaymentReversal?

  @@index([createdAt])
  @@index([recordedByUserId, cashHandoverStatus])
  @@index([branchId, createdAt])
  @@index([paymentStatus])
}

model PaymentAllocation {
  id                 String           @id @default(uuid())
  paymentId          String
  payment            Payment          @relation(fields: [paymentId], references: [id])
  ticketId           String
  ticket             SubscriberTicket @relation(fields: [ticketId], references: [id])
  installmentDueId   String
  due                InstallmentDue   @relation(fields: [installmentDueId], references: [id])
  amountAllocated    BigInt           // Whole integer Rupees

  @@index([paymentId])
  @@index([ticketId])
  @@index([installmentDueId])
}

model Receipt {
  id                 String   @id @default(uuid())
  branchId           String
  branch             Branch   @relation(fields: [branchId], references: [id])
  paymentId          String   @unique
  payment            Payment  @relation(fields: [paymentId], references: [id])
  receiptNumber      String   @unique // e.g., "KC-REC-PRD-2026-00045"
  issuedAt           DateTime @default(now())
  isBilingual        Boolean  @default(true) // Generates English + Tamil receipt
  pdfS3Key           String?

  @@index([issuedAt])
  @@index([branchId, issuedAt])
}

model PaymentReversal {
  id                String    @id @default(uuid())
  paymentId         String    @unique
  payment           Payment   @relation(fields: [paymentId], references: [id])
  reason            String
  status            String    @default("REQUESTED") // REQUESTED, APPROVED, REJECTED
  notes             String?
  initiatedByUserId String    // Maker
  approvedByUserId  String?   // Checker (Super Admin / Partner) - maker != checker
  reversedAt        DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
}

// -------------------------------------------------------------
// 6. Immutable Audit Trail
// -------------------------------------------------------------

model AuditLog {
  id                 String   @id @default(uuid())
  userId             String?
  user               User?    @relation(fields: [userId], references: [id])
  action             String   // e.g., "AUCTION_FINALIZED", "TIE_BREAK_DRAWN", "PAYMENT_REVERSED"
  entityType         String   // "Payment", "Auction", "ChitGroup"
  entityId           String
  ipAddress          String?
  oldValue           Json?
  newValue           Json?
  timestamp          DateTime @default(now())

  @@index([entityType, entityId])
  @@index([timestamp])
}
```

---

## 7. PostgreSQL 17 Engine-Level CHECK Constraints & Partial Unique Indexes (`CONFIRMED-BY-DEVELOPER` / Invariant 10 & F12)

To enforce Invariant 2 (Whole Rupee non-negativity) and Invariant 10 (Maker $\neq$ Checker Dual Control) at both application and physical database storage levels, **8 PostgreSQL 17 engine-level `CHECK` constraints** and **1 case-insensitive partial unique index** are deployed across migrations:
- `20261115060000_complete_maker_checker_constraints`
- `20261117170000_add_ticket_removal_maker_checker`
- `20261118110000_harden_auction_disbursement_constraints`
- `20261118124500_case_insensitive_payout_ref_index`

These constraints execute inside PostgreSQL transactions and reject self-approval, invalid states, negative amounts, or duplicate bank UTR references regardless of the calling application, script, or migration tool (PostgreSQL SQLSTATE `23514` / `23505`):

### 7.1 Complete 8-Constraint & Partial Unique Index Matrix

| # | Table | Constraint / Index Name | Enforcement Scope | Business Rule & Invariant |
| :---: |---|---|---|---|
| **1** | `Payment` | `chk_payment_cash_handover_maker_checker` | `("cashHandoverAcknowledgedByUserId" IS NULL OR "recordedByUserId" != "cashHandoverAcknowledgedByUserId")` | Collector cannot acknowledge their own physical cash handover (`ADR-25` / Invariant 10). |
| **2** | `Auction` | `chk_auction_maker_checker` | State-aware dual-control on **both** `COMPLETED` and `MINUTES_FILED` states (`conductedByUserId <> finalizedByUserId`, non-null Maker & Checker for `installmentMonth > 1`; Month 1 company pool allows null Maker; `isHistoricalEntry = true` exempt). | Invariant 5, Invariant 10, `ADR-25` (`20261118110000`). |
| **3** | `Auction` | `chk_auction_non_negative_amounts` | `bidDiscount`, `foremanCommissionAmount`, `totalDividend`, `dividendPerTicket`, `prizeMoney` must each be `NULL` or `>= 0`. | Invariant 2 Whole Rupee non-negativity (`20261118110000`). |
| **4** | `AuctionMinutes` | `chk_auction_minutes_attendees` | `CHECK ("subscribersPresent" >= 1)` | Statutory Form XVII requires at least 1 attendee recorded (`20261118110000`). |
| **5** | `AuctionWinner` | `chk_winner_maker_checker` | State-aware dual-control across `VERIFIED_BY_MAKER` (non-null `verifiedByUserId`) and **both** `AUTHORIZED_BY_CHECKER` and `DISBURSED` (`verifiedByUserId <> authorizedByUserId` + non-null identities; Month 1 `COMPANY_POOL_MONTH_1` and `isHistoricalEntry = true` exempt). | Invariant 10, `ADR-15`, `ADR-25`, `F12` (`20261118110000`). |
| **6** | `AuctionWinner` | `chk_winner_positive_disbursed_amount` | `CHECK ("disbursedAmount" IS NULL OR "disbursedAmount" > 0)` | Disbursed prize money must be strictly positive (`20261118110000`). |
| **7** | `PaymentReversal` | `chk_reversal_maker_checker` | State-aware dual-control on `APPROVED` reversal (`initiatedByUserId != approvedByUserId`). | Invariant 10 / `KFC-SEC-001` (`20261115060000`). |
| **8** | `SubscriberTicket` | `chk_ticket_removal_maker_checker` | `("removalRequestedByUserId" IS NULL OR "removedByUserId" IS NULL OR "removalRequestedByUserId" != "removedByUserId")` | Two-Partner defaulter removal (`SEC-B`, `20261117170000`). |
| **9** | `AuctionWinner` | `uq_auction_winner_non_cash_payment_ref` *(Partial Unique Index)* | `UNIQUE ON "AuctionWinner" (UPPER(BTRIM("paymentReference")))` where `isHistoricalEntry = false`, `disbursementStatus = 'DISBURSED'`, `disbursementMode IN (ACCOUNT_PAYEE_CHEQUE, BANK_TRANSFER_NEFT, BANK_TRANSFER_RTGS, BANK_TRANSFER_IMPS)`, excluding statutory sentinel refs (`COMPANY_POOL_MONTH_1`, `FINAL_SETTLEMENT_*`). | Eliminates duplicate & case-variant (`utr-123` vs `UTR-123`) bank UTR / cheque references on prize payouts (`CR-DISB-05`, `20261118124500`). |

### 7.2 Ternary Logic NULL-Trap Protection
In standard SQL three-valued logic (`TRUE`, `FALSE`, `UNKNOWN`/`NULL`), PostgreSQL `CHECK` constraints pass if the predicate evaluates to `TRUE` or `NULL` (it only fails if strictly `FALSE`). Expressions like `(status != 'DISBURSED' OR paymentReference = 'COMPANY_POOL_MONTH_1')` evaluate to `NULL` when `paymentReference` is null, causing unapproved `DISBURSED` rows to pass unchecked.
To ensure zero bypass:
- All conditional branches in `chk_winner_maker_checker` and `chk_auction_maker_checker` explicitly enforce `("paymentReference" IS NOT NULL AND ...)` and explicit non-null conjunctions.
- `isHistoricalEntry = true` is explicitly tracked for legacy notebook imports, eliminating synthetic fake makers on historical records while strictly enforcing dual control on all live business operations.

---

## 8. Foreign Key Integrity, Deletion Safety & AuditLog Immutability Triggers

The live schema comprises **18 relational models** and **8 enum types** dedicated solely to Kumaran Finance (`ADR-01`). Referential integrity is engineered so financial history can **never** be cascade-deleted:

### 8.1 Foreign Key Deletion Behavior Policy
1. **Strict Financial History Preservation (`ON DELETE RESTRICT`)**:
   - `Branch` $\to$ `Customer`, `ChitGroup`, `Receipt`
   - `User` $\to$ `Payment` (`recordedByUserId`) — staff accounts that ever recorded a payment cannot be deleted.
   - `Customer` $\to$ `SubscriberTicket` — customers who joined any chit group cannot be deleted (which also prevents cascading their `Nominee` or `CustomerDocument` rows).
   - `ChitGroup` $\to$ `SubscriberTicket`, `InstallmentDue`, `Auction`
   - `SubscriberTicket` $\to$ `InstallmentDue`, `PaymentAllocation`, `AuctionWinner`, `AuctionTieBidder`
   - `Auction` $\to$ `AuctionWinner`, `AuctionMinutes`
   - `Payment` $\to$ `PaymentAllocation`, `Receipt`, `PaymentReversal`
   - Raw SQL `DELETE` attempts on any active financial record fail at PostgreSQL with SQLSTATE `23503` (`foreign_key_violation`).
2. **Bounded Safe Cascades (`ON DELETE CASCADE`, 5 edges only)**:
   - `Nominee.customerId` $\to$ `Customer(id)` (blocked if customer holds any `SubscriberTicket`)
   - `CustomerDocument.customerId` $\to$ `Customer(id)` (blocked if customer holds any `SubscriberTicket`)
   - `AuctionTieBidder.auctionId` $\to$ `Auction(id)` (blocked if `AuctionWinner` or `AuctionMinutes` exists)
   - `Session.userId` $\to$ `User(id)` and `Session.customerId` $\to$ `Customer(id)` (ephemeral refresh vault cleanup only)
3. **Audit Preservation (`ON DELETE SET NULL`)**:
   - `User.branchId` $\to$ `Branch(id)` and `AuditLog.userId` $\to$ `User(id)` preserve historical audit entries (`oldValue`/`newValue` JSONB intact) even if a user record were removed.

### 8.2 Complete Database-Level `AuditLog` Immutability (`20261114010000_audit_log_complete_immutability`)
`AuditLog` is strictly append-only at the PostgreSQL kernel level — even for superuser or replication-role sessions:
- **Row-Level Trigger (`trg_prevent_audit_log_mutation`)**: `BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW` executes `prevent_audit_log_mutation()`, raising an exception on any `UPDATE` or `DELETE`, hardened with `ALTER TABLE "AuditLog" ENABLE ALWAYS TRIGGER`.
- **Statement-Level Trigger (`trg_prevent_audit_log_truncate`)**: `BEFORE TRUNCATE ON "AuditLog" FOR EACH STATEMENT` executes `prevent_audit_log_truncate()`, rejecting `TRUNCATE`, hardened with `ENABLE ALWAYS TRIGGER`.
- **Privilege Revocation**: `REVOKE UPDATE, DELETE, TRUNCATE ON "AuditLog" FROM PUBLIC;`.
- **Application Guarantee**: Zero `auditLog.update` or `auditLog.delete` calls exist anywhere in `apps/api/src/`.
