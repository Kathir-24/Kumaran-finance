# Kumaran Chits — Compliance Readiness Checklist

> **IMPORTANT NOTICE**: Not legal advice. Unverified claims must be reviewed by a qualified Tamil Nadu chit-fund professional.  
> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance**  
> **Status**: Working Specification  
> **Status Labels Used**: `CONFIRMED-BY-DEVELOPER`, `PROPOSED`, `OPEN`, `UNVERIFIED-LEGAL`

---

## 1. Regulatory Items & Software Support Matrix

| Compliance Area | Description / Working Hypothesis | Status | Source | Software Implementation |
|---|---|---|---|---|
| **Prior Sanction & Registration** | Prior government sanction is required before a chit group commences operations. | `CONFIRMED-BY-DEVELOPER` (Workflow) / `PROPOSED` (Statutory) | The Chit Funds Act, 1982, Section 4 | Software enforces full lifecycle `DRAFT` $\to$ `REGISTERED` (`POST /chits/:id/register` with Government Sanction Order Reference, Sub-Registrar Office, and commencement certificate) $\to$ `ACTIVE` (`POST /chits/:id/activate`) $\to$ `COMPLETED` / `CANCELLED` (`POST /chits/:id/cancel`). |
| **Foreman Commission Cap** | Generic statutory references cite 5% or 7% caps (`UNVERIFIED-LEGAL`). Kumaran Chits operates at **4.00%** (`CONFIRMED-BY-DEVELOPER`). | `CONFIRMED-BY-DEVELOPER` (4% rate) / `UNVERIFIED-LEGAL` (Statutory cap) | The Chit Funds Act, 1982, Section 21(1)(b) / Amendment Act, 2019, Section 13 | Software provides a configurable default commission (4.00%), copied and permanently frozen onto each chit group upon activation. |
| **Foreman Security Deposit** | Foreman deposits security (e.g., FDR in approved bank) pledged to Registrar. (100% deposit claim is `UNVERIFIED-LEGAL`). | `UNVERIFIED-LEGAL` | The Chit Funds Act, 1982, Section 22 | Software records optional FDR reference, bank name, deposit amount, and pledged date in chit master fields. |
| **Single Ticket Per Scheme Limit** | A subscriber may join multiple chit schemes, but cannot hold 2 or more tickets in the same chit group (`ADR-13`). | `CONFIRMED-BY-DEVELOPER` | The Chit Funds Act, 1982, Section 24 | Database unique constraint `@@unique([chitGroupId, customerId])` on `SubscriberTicket` strictly prevents duplicate ticket assignment in the same scheme. |
| **Auction Discount Ceilings** | Maximum allowable auction discount ceiling is fixed strictly at **one-fourth (1/4 or 25.00%) of total chit value** ($D_{max} = \frac{V}{4}$) across all auction months (`CONFIRMED-BY-DEVELOPER`). | `CONFIRMED-BY-DEVELOPER` (Kumaran 1/4 Rule) | none | Software validates and rejects entered bids exceeding 1/4 of total chit value ($D \le \frac{V}{4}$) or below the frozen 4% foreman commission ($D \ge C_f$), and rejects non-divisible dividends (`NON_DIVISIBLE_DIVIDEND`, `KFC-FIN-002`). |
| **Auction Tie-Breaker Draw** | Procedure when multiple subscribers bid the maximum ceiling discount simultaneously. | `CONFIRMED-BY-DEVELOPER` (Physical draw) | none | **Option A (Physical Draw)**: Foreman draws paper tokens physically at the branch in front of members; staff enters drawn winner and unique paper token numbers into software (`AuctionTieBidder`). Zero autonomous software RNG draws. |
| **Auction Minutes Filing** | Filing signed minutes of auction with the Registrar (21-day deadline and Form XVII designation are `UNVERIFIED-LEGAL`). | `CONFIRMED-BY-DEVELOPER` (Tracking) / `UNVERIFIED-LEGAL` (Specimen & 21-day rule) | The Chit Funds Act, 1982, Sections 16 & 17; TN Rules 1984, Rule 24/25 | Software generates Form XVII minutes with attendees, Foreman signature declaration, and Option A tie-break details; enforces `PATCH /auctions/:auctionId/mark-filed-with-registrar` with mandatory `filingReference`, IST date bounds (`auctionDate <= filedDate <= now`), and 21-day compliance countdown (`computeRegistrarFilingCompliance`). |
| **Subscribers' Ledger & Passbook** | Maintaining continuous ledger of installments, dividends, and arrears per subscriber (Form XXI designation is `UNVERIFIED-LEGAL`). | `CONFIRMED-BY-DEVELOPER` (Passbook scope) / `UNVERIFIED-LEGAL` (Form XXI) | The Chit Funds Act, 1982, Sections 16 & 38; TN Rules 1984, Rule 28 | Software provides continuous $1..N$ digital passbook (`contiguousSchedule`), 64-bit whole-rupee running cumulative totals (`cumulativeGrossDue`, `cumulativeDividendCredit`, `cumulativeNetPayable`, `cumulativePaid`, `runningBalance`), KC-09 `PRIZE_ARREARS_OFFSET_ALLOCATED` audit provenance, and printable PDF exports. |
| **Cash Book & Day Book** | Daily register of physical cash collections, agent cash handovers, reversals, and prize disbursements (Form XXII designation is `UNVERIFIED-LEGAL`). | `CONFIRMED-BY-DEVELOPER` (Cash book scope) / `UNVERIFIED-LEGAL` (Form XXII) | The Chit Funds Act, 1982, Sections 16 & 38; TN Rules 1984, Rule 29 | Form XXII strictly isolates physical `CASH` movements (excluding UPI/Bank/Cheque), logs approved physical cash payment reversals as outflows on `reversedAt`, keys field cash handover vault entry on `cashHandoverAcknowledgedAt ?? createdAt` (`Opening Safe Cash(T) === Closing Safe Cash(T-1)`), and provides Day Book & payout vouchers. |
| **Defaulter Removal & Exit Settlement (Q25)** | Removal of subscriber defaulting for 3 consecutive months (statutory notice + company damages on early exit). | `CONFIRMED-BY-DEVELOPER` (Removal) / `BLOCKED` (Q25 Settlement Formula) | The Chit Funds Act, 1982, Sections 30, 39 & 40 | Flags 3-month consecutive arrears (`DEFAULT_3_MONTHS`); requires 2-partner dual control (`PENDING_REMOVAL_APPROVAL` $\to$ `REMOVED_DEF_3M`); bars removal/substitution of prized tickets (`PRIZED_TICKET_IMMUTABLE`); `POST /tickets/:id/settle-removal` **strictly fails closed** with `UNAPPROVED_SETTLEMENT_POLICY` pending Partner Board & legal sign-off on 4% vs 5% damages (Q25). |
| **Income Tax Cash Thresholds (KFC-TAX-001)** | IT Act Section 40A(3) (> ₹10,000 cash disallowance) & Section 269ST (₹2,00,000 single-day cash limit). | `CONFIRMED-BY-DEVELOPER` (Zero cash block, ADR-14) / `OPEN` (Partner Board policy) | Income Tax Act, 1961, Sections 40A(3) & 269ST | Software permits hard cash prize disbursements of any whole-rupee amount per ADR-14, while rendering prominent statutory advisories on cash vouchers exceeding ₹10,000. |
| **Books Inspection by Auditor & Registrar** | Statutory right of Registrar and independent Chartered Accountant to inspect books and ledgers. | `CONFIRMED-BY-DEVELOPER` | The Chit Funds Act, 1982, Sections 38 & 67 | Dedicated read-only `Role.AUDITOR` grants global inspection of ledgers, auction minutes, day book, cash book, and defaulters with zero write capability. Immutable audit trail and BullMQ queue telemetry remain restricted strictly to `Role.SUPER_ADMIN`. |
| **TRAI DLT SMS Compliance (Q34)** | Commercial telecom regulations governing automated transactional SMS in India. | `CONFIRMED-BY-DEVELOPER` | TRAI Commercial Communications Customer Preference Regulations, 2018 | Production automated notifications and OTPs route exclusively via Indian TRAI DLT SMS (MSG91 HTTP Flow API, Header `KMRCHT`, registered 19-digit DLT template IDs). WhatsApp simulation stubs purged; FCM push deferred to Phase 2. |
| **Physical Archive & Notebook Onboarding** | Preserving paper ledgers and onboarded records. Active chits onboarded mid-cycle from paper notebooks (`CONFIRMED-BY-DEVELOPER`). | `CONFIRMED-BY-DEVELOPER` (Mid-cycle onboarding) / `UNVERIFIED-LEGAL` (8-year retention) | none | Software maintains persistent digital records (`initMode: ONGOING_GROUP`, `isHistoricalEntry: true`) cross-referencing physical notebook/receipt numbers. |
| **PAN Threshold** | PAN collection for transactions exceeding a threshold (₹50,000 threshold claim is `UNVERIFIED-LEGAL`). | `UNVERIFIED-LEGAL` | none | Software provides optional `panNumber` field (omitted from general search and collection agent views for privacy) and flags profiles when thresholds are crossed. |
| **Company Safety Proof & Collateral Checklist** | Verification of security before prize disbursement. Property documents eliminated. Software acts as a flexible **safety checklist & recordkeeper**; proof is non-mandatory and evaluated case-by-case (`CONFIRMED-BY-DEVELOPER`). | `CONFIRMED-BY-DEVELOPER` | none | Software records on `AuctionWinner`: `isSecurityRequired`, `securityType`, `agreementSigned`, `nomineeSigned`, `blankChequeDetails`, and private S3 `securityDocS3Key`. |
| **PMLA / RBI Regulatory Framework** | Applicability of Prevention of Money Laundering Act or RBI NBFC circulars to local chit operations. | `UNVERIFIED-LEGAL` | none | To be reviewed by qualified legal professional. |
| **Registrar Designation & G.O. References** | Citations such as "G.O. Ms. No. 343" or specific Registrar designations. | `UNVERIFIED-LEGAL` | none | To be reviewed against verified state gazettes and Tamil Nadu government orders. |

---

## 2. Customer KYC & Data Minimization Principles (`CONFIRMED-BY-DEVELOPER` / DPDP Act 2023)

Customer data handling strictly enforces **data minimization and privacy-by-design safeguards**:

1. **Aadhaar Data Minimization**:
   - Collect only the minimum information necessary for identity verification (KYC documents remain strictly optional per ADR-16).
   - The database stores **strictly the last 4 digits** (`aadhaarLast4` on `Customer` and `Nominee`)—full 12-digit Aadhaar numbers are never stored in plaintext.
   - Minor nominees require mandatory guardian details.
2. **Document & PII Access Controls**:
   - Customer identity proofs (`AADHAAR_FRONT`, `PAN`, `PHOTO`, `SIGNATURE`) and surety documents are stored in private S3-compatible object storage with directory sandboxing (`kyc/`, `safety-proof/`).
   - Access is granted strictly through short-lived 15-minute presigned URLs after branch and ownership verification.
   - MSISDNs are masked in operational logs (`+91******3210`), and `panNumber` is stripped from general customer search and `COLLECTION_AGENT` payloads.
3. **DPDP Act, 2023 Legal Governance (`OPEN`)**:
   - Technical privacy safeguards (minimization, masking, private storage, access isolation) are implemented and tested; formal legal consent forms, retention schedules, and erasure policies under the **Digital Personal Data Protection (DPDP) Act, 2023** remain **to be reviewed** by legal counsel.

---

## 3. Statutory Forms & Registers (`CONFIRMED-BY-DEVELOPER`)

The platform implements unified digital generation, authenticated binary streaming (`Cache-Control: private, no-store`), and print styling for all statutory forms and registers:

| Document / Register | Statutory Reference | Software Implementation | Delivery & Print Architecture |
|---|---|---|---|
| **Form XVII (Minutes of Auction)** | Chit Funds Act 1982, Sec 17 & Tamil Nadu Chit Funds Rules 1984, Rule 24 | `PdfService.generateAuctionMinutesPdf` & `/reports/minutes` | Streams binary `application/pdf` via BFF (`/api/v1/pdf/minutes/:auctionId`) with automatic blob download (`downloadMinutesPdf`). Clean `@media print` strips dashboard navigation. |
| **Form XXI (Subscribers' Ledger / Passbook)** | Chit Funds Act 1982, Sec 16 & Tamil Nadu Chit Funds Rules 1984, Rule 28 | `PdfService.generatePassbookPdf` & `/reports/ledger` | Continuous $1..N$ schedule with running cumulative totals and KC-09 arrears offset provenance streamed as binary PDF via BFF (`/api/v1/pdf/passbook/:ticketId`) with one-click download (`downloadPassbookPdf`) and print stylesheet. |
| **Form XXII (Day Book / Cash Book)** | Chit Funds Act 1982, Sec 16 & Tamil Nadu Chit Funds Rules 1984, Rule 29 | `/reports/cash-book` 12-column ledger | Physical cash-only ledger (including approved cash reversal outflows & handover acknowledgement timing) with direct browser print (`window.print()`) via `@media print` CSS rendering high-contrast black-on-white tables. |
| **Subscription Receipt (A5 Counter Slip)** | ADR-11 Statutory Receipt Standard (`KFC-PDF-001`) | `PdfService.generateReceiptPdf` & `ReceiptPrintTemplate` | Dual-mode: Direct binary PDF download (`downloadReceiptPdf`) and exact 148mm A5 browser print view. Reversed receipts dynamically render a bold red diagonal watermark **`ரத்து செய்யப்பட்டது / CANCELLED`** and bypass stale S3 cache. |
| **Prize Payout Voucher** | ADR-11 & Section 15 Disbursement Protocol | `PdfService.generatePayoutVoucherPdf` & `VoucherPrintTemplate` | Dual-mode: Direct binary PDF download (`downloadVoucherPdf`) and exact 148mm A5 voucher print view (`KC-VOU-` numbering + IT Act §40A(3) advisory for cash payouts $> ₹10,000$). |

> **Operational Standard**: All PDF downloads are strictly routed through the Next.js BFF proxy as authenticated binary blobs via `@kumaran/api-client` (`parseAs: 'blob'`). This completely eliminates browser pop-up blocker issues, cross-origin CORS blocks, and internal Docker/MinIO hostname resolution errors (`ERR_NAME_NOT_RESOLVED`).
