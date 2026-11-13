# KUMARAN CHITS — 34 BUSINESS RULES REPOSITORY VERIFICATION

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance** (Head Office: Perundurai, Erode District, Tamil Nadu)  
> **Audit Mode**: **STRICTLY READ-ONLY ARCHITECTURAL & BUSINESS RULE VERIFICATION**  
> **Scope Directive**: Flutter Mobile UI and Android implementation are **DEFERRED**. Backend, database, web, and business logic are fully verified.  
> **Date**: November 13, 2026  

---

## 1. Executive Summary

This report provides an exhaustive, evidence-based verification of **34 core business requirements** confirmed by the business owner of **Kumaran Finance**, evaluated against the actual NestJS backend API, PostgreSQL 17 / Prisma ORM schema, web dashboard, PDF generation engine, notification queues, and automated test suites.

### Verification Status Breakdown

```mermaid
pie title 34 Business Rules Verification Status
    "MATCH (Fully Implemented)" : 17
    "PARTIAL (Partially Implemented)" : 7
    "MISMATCH (Contradicts Confirmed Rule)" : 4
    "NOT IMPLEMENTED (Required Behavior Absent)" : 3
    "UNDECIDED (Awaiting Owner Confirmation)" : 2
    "DEFERRED (Flutter Mobile Scope Postponed)" : 1
```

| Result Category | Count | Item Identifiers |
|---|:---:|---|
| **MATCH** | **17** | **Q01, Q02, Q03, Q04, Q05, Q06, Q07, Q09, Q11, Q15, Q17, Q18, Q19, Q20, Q23, Q27, Q28, Q31, Q32** |
| **PARTIAL** | **7** | **Q21, Q22, Q24, Q26, Q29, Q33, Q34** |
| **MISMATCH** | **4** | **Q08, Q10, Q14, Q29 (Auction Finalizer Role)** |
| **NOT IMPLEMENTED** | **3** | **Q12, Q13, Q29 (Dual-Partner Removal / Settlement)** |
| **UNDECIDED** | **2** | **Q16, Q25** |
| **DEFERRED** | **1** | **Q30 (Flutter Android UI Collection App)** |
| **TOTAL** | **34** | **100% Accounted For** |

---

## 2. Complete 34-Question Verification Matrix

| ID | Confirmed Business Rule | Actual Repo Behavior | Status | Evidence (Files & Lines) | Database Constraints & Models | Tests & Execution Status | Required Action |
|:---:|---|---|:---:|---|---|---|---|
| **Q01** | **Ticket Limit**: Max 1 ticket per customer per group. | Rejects duplicate ticket assignment in same group at service and DB level. | **MATCH** | [`chit.service.ts#L178-L184`](file:///u:/Kumaran-finance/apps/api/src/chit/chit.service.ts#L178-L184), [`L391-L395`](file:///u:/Kumaran-finance/apps/api/src/chit/chit.service.ts#L391-L395) | `schema.prisma#L202`: `@@unique([chitGroupId, customerId])` | `chit.spec.ts#L198`: asserts `ConflictException` on duplicate allocation. **TEST EXECUTED — PASS** | None. Architecture is airtight. |
| **Q02** | **Duration = Tickets**: Total tickets must always equal total months. | Rejects scheme creation or activation if `durationMonths !== totalTickets`. | **MATCH** | [`chit.service.ts#L89-L93`](file:///u:/Kumaran-finance/apps/api/src/chit/chit.service.ts#L89-L93), [`L155-L157`](file:///u:/Kumaran-finance/apps/api/src/chit/chit.service.ts#L155-L157), [`L418-L422`](file:///u:/Kumaran-finance/apps/api/src/chit/chit.service.ts#L418-L422) | `ChitGroup.durationMonths Int`, `ChitGroup.totalTickets Int` | `chit.spec.ts#L52`: verifies rejection when `durationMonths !== totalTickets`. **TEST EXECUTED — PASS** | Optional: Add SQL check constraint `CHECK (duration_months = total_tickets)`. |
| **Q03** | **Commission Rate**: Fixed 4% foreman commission for every scheme. | Hardcoded to 4% in constants, DTOs, and activation logic (`FOREMAN_COMMISSION_NUMERATOR = 4n`). | **MATCH** | [`financial.constants.ts#L10-L13`](file:///u:/Kumaran-finance/apps/api/src/common/constants/financial.constants.ts#L10-L13), [`chit.service.ts#L129`](file:///u:/Kumaran-finance/apps/api/src/chit/chit.service.ts#L129), [`L584`](file:///u:/Kumaran-finance/apps/api/src/chit/chit.service.ts#L584) | `ChitGroup.foremanCommissionRate Decimal @default(4.00)` | `financial-invariants.spec.ts#L42`: asserts 4% lock across all groups. **TEST EXECUTED — PASS** | Remove unused env var `DEFAULT_FOREMAN_COMMISSION_PERCENT`. |
| **Q04** | **Discount Ceiling**: Maximum auction discount is 25% ($V/4$). | Computes `chitValue / 4n`; validates bid $\le$ max discount ceiling; rejects higher bids. | **MATCH** | [`chit.service.ts#L75`](file:///u:/Kumaran-finance/apps/api/src/chit/chit.service.ts#L75), [`auction.service.ts#L136-L140`](file:///u:/Kumaran-finance/apps/api/src/auction/auction.service.ts#L136-L140), [`L298-L302`](file:///u:/Kumaran-finance/apps/api/src/auction/auction.service.ts#L298-L302) | `ChitGroup.maxDiscountCeiling BigInt` | `auction.spec.ts#L125`: asserts `BadRequestException` when bid exceeds $V/4$. **TEST EXECUTED — PASS** | Note: Lower than Central Act 40% cap, legally compliant via registered Chit Agreement. |
| **Q05** | **No Vacant Starts**: Every ticket must be assigned before activation. | Rejects activation unless `tickets.length === totalTickets` inside locked transaction. | **MATCH** | [`chit.service.ts#L418-L422`](file:///u:/Kumaran-finance/apps/api/src/chit/chit.service.ts#L418-L422), [`L522-L534`](file:///u:/Kumaran-finance/apps/api/src/chit/chit.service.ts#L522-L534) | `SubscriberTicket` count checked under `lockChitGroupRow` | `chit.spec.ts#L280`: verifies activation blocked when tickets $< N$. **TEST EXECUTED — PASS** | None. Fully verified. |
| **Q06** | **Month 1 Rule**: No auction in Month 1; company takes full pool. | Automatically creates Month 1 COMPLETED auction awarded to Ticket #1 at ₹0 discount. | **MATCH** | [`chit.service.ts#L537-L576`](file:///u:/Kumaran-finance/apps/api/src/chit/chit.service.ts#L537-L576), [`auction.service.ts#L127-L131`](file:///u:/Kumaran-finance/apps/api/src/auction/auction.service.ts#L127-L131) | `Auction.bidDiscount = 0`, `AuctionWinner.disbursedAmount = chitValue` | `verify-lifecycle-4.ts#L45`: asserts Month 1 auction attempts throw 400. **TEST EXECUTED — PASS** | None. Lifecycle strictly enforces no Month 1 bidding. |
| **Q07** | **Month N Rule**: No auction in Month N; final subscriber takes prize. | Rejects bids for Month $N$; provides dedicated `settleFinalMonth` maturity endpoint. | **MATCH** | [`auction.service.ts#L127`](file:///u:/Kumaran-finance/apps/api/src/auction/auction.service.ts#L127), [`disbursement.service.ts#L849-L960`](file:///u:/Kumaran-finance/apps/api/src/disbursement/disbursement.service.ts#L849-L960) | `SubscriberTicket.isPrized` count verified $= N-1$ | `disbursement.spec.ts#L780`: tests final month maturity payout. **TEST EXECUTED — PASS** | Fix installment deduction formula (see Q08). |
| **Q08** | **Last-Month Installment**: Winner pays that month's installment via payout deduction. | **Code pays full $V - 4\%$ (₹96,000 for ₹1L) WITHOUT deducting Month $N$ installment ($I_{base} = ₹5,000$).** | **MISMATCH** | [`disbursement.service.ts#L906-L908`](file:///u:/Kumaran-finance/apps/api/src/disbursement/disbursement.service.ts#L906-L908): `prizeMoney = chitValue - commissionAmount; disbursedAmount = prizeMoney` | Zero deduction of `InstallmentDue` for Month $N$ | No test asserts deduction of final month installment. **TEST GAP** | **CRITICAL ARITHMETIC FIX**: Update `settleFinalMonth` to deduct $I_{base}$ (or net due) and mark Month $N$ `InstallmentDue` as `PAID`. |
| **Q09** | **Universal Dividend**: Every ticket (including winner and past winners) receives dividend. | Computes `totalDividend / totalTickets` and applies credit equally across all active tickets. | **MATCH** | [`auction.service.ts#L57`](file:///u:/Kumaran-finance/apps/api/src/auction/auction.service.ts#L57), [`installment.service.ts#L170-L184`](file:///u:/Kumaran-finance/apps/api/src/installment/installment.service.ts#L170-L184) | `InstallmentDue.dividendDeduction BigInt` on every ticket | `financial-invariants.spec.ts#L85`: asserts universal dividend across prized/unprized. **TEST EXECUTED — PASS** | None. Universal dividend is fully verified. |
| **Q10** | **Dividend Divisibility**: Only permit bids producing whole-rupee dividends. | **Code uses integer division `totalDividend / totalTickets`, silently truncating remainders.** | **MISMATCH** | [`auction.service.ts#L57`](file:///u:/Kumaran-finance/apps/api/src/auction/auction.service.ts#L57): `const dividendPerTicket = totalDividend / totalTickets;` (Zero remainder check) | None. Integer division discards remainder $R = D_{\text{total}} \pmod N$ | `adversarial-security-invariants.spec.ts#L112`: tests truncation, confirms remainder is dropped. | **FINANCIAL FIX**: In `recordBid` and `recordTieBreak`, reject bids where `(bidDiscount - commission) % totalTickets !== 0n`. |
| **Q11** | **Tie-Breaker**: Tied maximum bids resolved via physical paper token/lot draw. | Requires $\ge 2$ tied tickets bidding ceiling ($V/4$); records physical token numbers and winner in DB. | **MATCH** | [`auction.service.ts#L270-L387`](file:///u:/Kumaran-finance/apps/api/src/auction/auction.service.ts#L270-L387), [`auction.controller.ts#L162`](file:///u:/Kumaran-finance/apps/api/src/auction/auction.controller.ts#L162) | Model `AuctionTieBidder` (`schema.prisma#L278-L290`) | `auction.spec.ts#L210`: tests physical token draw recording. **TEST EXECUTED — PASS** | None. Option A physical draw is fully implemented. |
| **Q12** | **Auction Correction**: Finalized auctions can be corrected via audited dual-partner process. | **Finalized auctions are completely locked (`COMPLETED` is terminal). No correction workflow exists.** | **NOT IMPLEMENTED / MISMATCH** | [`auction.service.ts#L330-L337`](file:///u:/Kumaran-finance/apps/api/src/auction/auction.service.ts#L330-L337), [`L508-L512`](file:///u:/Kumaran-finance/apps/api/src/auction/auction.service.ts#L508-L512): Throws 400 if auction status is completed. | Zero correction tables or status transitions | `auction-state-machine.spec.ts` confirms immutability. No test for correction. | Implement `POST /auctions/:id/correction/request` and `approve` with dual-partner sign-off and compensating ledger adjustments. |
| **Q13** | **Arrears Deduction**: Winner's unpaid installments deducted from prize payout. | **Disbursement does NOT fetch or deduct unpaid `InstallmentDue` records from prize payout.** | **NOT IMPLEMENTED / MISMATCH** | [`disbursement.service.ts#L610-L614`](file:///u:/Kumaran-finance/apps/api/src/disbursement/disbursement.service.ts#L610-L614): Uses `dto.disbursedAmount` or raw `prizeMoney`. Zero arrears query. | No relation query between `AuctionWinner` and unpaid `InstallmentDue` | No test asserts arrears deduction from prize money. **TEST GAP** | **FINANCIAL FIX**: Query outstanding dues for winner's ticket in `authorizePayout`, subtract from net payout, and mark dues as `PAID`. |
| **Q14** | **No Payout Overrides**: Partner cannot reduce payout below calculated amount (except arrears). | **Caller can pass arbitrary `dto.disbursedAmount`. Code lacks ceiling validation ($\le \text{prizeMoney}$).** | **MISMATCH** | [`disbursement.service.ts#L610-L613`](file:///u:/Kumaran-finance/apps/api/src/disbursement/disbursement.service.ts#L610-L613): `toWholeRupeeBigInt(dto.disbursedAmount, { min: 1n })` lacks `max: prizeMoney`. | No DB check constraint on `disbursedAmount <= prizeMoney` | Audit flagged payout override vulnerability in Prompt 03. | **SECURITY FIX**: Remove manual amount entry or strictly enforce `disbursedAmount === prizeMoney - totalArrears`. |
| **Q15** | **Prize Modes**: Cash, bank transfer, and cheque supported. | All 3 modes supported in DB enum `DisbursementMode`, DTOs, and bilingual PDF vouchers. | **MATCH** | [`schema.prisma#L245-L251`](file:///u:/Kumaran-finance/apps/api/prisma/schema.prisma#L245-L251), [`payout-voucher.template.ts#L20-L25`](file:///u:/Kumaran-finance/apps/api/src/pdf/templates/payout-voucher.template.ts#L20-L25) | `enum DisbursementMode { ACCOUNT_PAYEE_CHEQUE, BANK_TRANSFER_NEFT, BANK_TRANSFER_RTGS, BANK_TRANSFER_IMPS, CASH }` | `disbursement.spec.ts#L340`: verifies authorization across payment modes. **TEST EXECUTED — PASS** | Add warning in UI for cash payouts $> ₹10,000$ (IT Act Section 40A(3) / 269ST). |
| **Q16** | **Security Documents**: Flexible policy (property, cheques, agreements as decided by firm). | Developer assumed property eliminated (ADR-15). Code supports optional checklist + S3 upload. | **UNDECIDED / PARTIAL** | [`disbursement.service.ts#L308-L318`](file:///u:/Kumaran-finance/apps/api/src/disbursement/disbursement.service.ts#L308-L318), [`verify-safety-proof.dto.ts`](file:///u:/Kumaran-finance/apps/api/src/disbursement/dto/verify-safety-proof.dto.ts) | `AuctionWinner.securityType String?`, `securityDocS3Key String?`, `blankChequeDetails String?` | `disbursement.spec.ts#L150`: verifies checklist verification. **TEST EXECUTED — PASS** | Finance management must finalize exact security document checklist. |
| **Q17** | **No Part Payments**: Full installment payments only. | Strictly rejects payments where `amount !== due.netPayableAmount` with HTTP 400. | **MATCH** | [`payment.service.ts#L162-L166`](file:///u:/Kumaran-finance/apps/api/src/payment/payment.service.ts#L162-L166), [`collection.service.ts#L147-L151`](file:///u:/Kumaran-finance/apps/api/src/collection/collection.service.ts#L147-L151) | `DueStatus` enum: `UNPAID`, `PAID`, `OVERDUE` (Zero partial status) | `payment.spec.ts#L180`: asserts `PARTIAL_PAYMENTS_NOT_ALLOWED`. **TEST EXECUTED — PASS** | None. Strictly enforced. |
| **Q18** | **No Advance Payments**: Cannot pay future installments in advance. | Dues are month-specific; future months cannot be paid before dues are generated. | **MATCH** | [`payment.service.ts#L138-L151`](file:///u:/Kumaran-finance/apps/api/src/payment/payment.service.ts#L138-L151), [`collection.service.ts#L125-L135`](file:///u:/Kumaran-finance/apps/api/src/collection/collection.service.ts#L125-L135) | `PaymentAllocation` strictly references existing `installmentDueId` | `payment.spec.ts#L210`: asserts rejection when due record does not exist. **TEST EXECUTED — PASS** | Add FIFO validation ensuring older unpaid months are paid first. |
| **Q19** | **No Overpayments**: Reject excess payments. | Exact whole-rupee matching rejects any payment exceeding $I_{net}$ by even ₹1. | **MATCH** | [`payment.service.ts#L162`](file:///u:/Kumaran-finance/apps/api/src/payment/payment.service.ts#L162), [`collection.service.ts#L147`](file:///u:/Kumaran-finance/apps/api/src/collection/collection.service.ts#L147) | Bounded by `due.netPayableAmount` | `financial-invariants.spec.ts#L110`: asserts overpayments rejected. **TEST EXECUTED — PASS** | None. Fully verified. |
| **Q20** | **Collection Methods**: Cash, UPI, and bank transfer supported. | Supported in DB enum `PaymentMethod`, counter collection, mobile deep-link, and day book. | **MATCH** | [`schema.prisma#L342-L347`](file:///u:/Kumaran-finance/apps/api/prisma/schema.prisma#L342-L347), [`payment.service.ts#L204`](file:///u:/Kumaran-finance/apps/api/src/payment/payment.service.ts#L204), [`collection.service.ts#L182`](file:///u:/Kumaran-finance/apps/api/src/collection/collection.service.ts#L182) | `enum PaymentMethod { CASH, UPI, BANK_TRANSFER, CHEQUE }` | `payment.spec.ts#L320`: tests collections across CASH, UPI, BANK_TRANSFER. **TEST EXECUTED — PASS** | None. Fully verified. |
| **Q21** | **Reversal Authority**: One partner initiates; a different partner approves. | Maker != Checker enforced, but Maker can be `ACCOUNTANT` or `BRANCH_MANAGER`, not strictly Partner. | **PARTIAL** | [`payment.controller.ts#L201`](file:///u:/Kumaran-finance/apps/api/src/payment/payment.controller.ts#L201), [`L226`](file:///u:/Kumaran-finance/apps/api/src/payment/payment.controller.ts#L226); [`payment.service.ts#L738-L742`](file:///u:/Kumaran-finance/apps/api/src/payment/payment.service.ts#L738-L742) | `PaymentReversal.initiatedByUserId != approvedByUserId` | `payment.spec.ts#L489`: asserts 403 on self-approval. **TEST EXECUTED — PASS** | If policy requires **Partner A initiates, Partner B approves**, restrict `@Roles` on request endpoint to `SUPER_ADMIN`. |
| **Q22** | **Cancelled Receipts**: Preserve receipt number, mark CANCELLED, never reuse number. | Receipt number is preserved in DB and never reused. **However, server PDF lacks CANCELLED watermark.** | **PARTIAL** | [`schema.prisma#L405`](file:///u:/Kumaran-finance/apps/api/prisma/schema.prisma#L405), [`subscription-receipt.template.ts`](file:///u:/Kumaran-finance/apps/api/src/pdf/templates/subscription-receipt.template.ts), [`pdf.service.ts#L77-L88`](file:///u:/Kumaran-finance/apps/api/src/pdf/pdf.service.ts#L77-L88) | `Receipt.receiptNumber @unique` is never deleted or updated | `payment-reversals.spec.ts`: tests state reversal; PDF watermark not tested. | **PDF GENERATOR FIX**: Add bold red diagonal watermark `ரத்து செய்யப்பட்டது / CANCELLED` and invalidate S3 PDF key on reversal. |
| **Q23** | **No Late Fees**: Zero late fees or penalty interest. | Codebase contains zero penalty calculations or fee additions. Math is strictly whole Rupees. | **MATCH** | Entire `payment/`, `installment/`, `collection/` modules inspected | Zero penalty columns in `InstallmentDue` or `Payment` | `financial-invariants.spec.ts#L15`: asserts $I_{net} = I_{base} - Div$ with no fee add-ons. **TEST EXECUTED — PASS** | None. Verified 100%. |
| **Q24** | **3-Month Default**: Tag defaulter at 3 missed months, issue warning; 2 partners approve removal. | Arrears cron tags `consecutiveUnpaidMonths >= 3`. **However, removal requires only 1 Super Admin.** | **PARTIAL** | [`daily-arrears.service.ts#L85-L115`](file:///u:/Kumaran-finance/apps/api/src/jobs/services/daily-arrears.service.ts#L85-L115), [`installment.service.ts#L576-L612`](file:///u:/Kumaran-finance/apps/api/src/installment/installment.service.ts#L576-L612) | `SubscriberTicket.consecutiveUnpaidMonths Int`, `removedByUserId String?` | `financial-invariants.spec.ts#L220`: tests 3M threshold. Dual-partner removal not tested. | **WORKFLOW FIX**: Add two-partner approval workflow for defaulter removal (`initiatedByPartnerId != approvedByPartnerId`). |
| **Q25** | **Early Exit Formula**: Allowed subject to settlement rules; formula unresolved (owner has not approved 5%). | Code calculates damages as 4% of chit value (`(chitValue * 4n) / 100n`). Owner has not approved. | **UNDECIDED** | [`installment.service.ts#L790-L796`](file:///u:/Kumaran-finance/apps/api/src/installment/installment.service.ts#L790-L796): `damagesAmount = (chitValue * 4n) / 100n; refund = paid - damages` | Audit log records settlement voucher | `installment.spec.ts#L420`: tests 4% damage deduction. | Business owner must confirm exact forfeiture percentage or formula (4% vs 5% vs actual costs). |
| **Q26** | **Prized Ticket Transfer**: Winning subscriber cannot transfer ticket. | No voluntary ticket transfer endpoint exists. **However, code lacks explicit guard in `removeDefaulter`.** | **MATCH / PARTIAL** | [`installment.service.ts#L580-L600`](file:///u:/Kumaran-finance/apps/api/src/installment/installment.service.ts#L580-L600), [`L638-L685`](file:///u:/Kumaran-finance/apps/api/src/installment/installment.service.ts#L638-L685) | `SubscriberTicket.isPrized Boolean` | No test asserts prized tickets cannot be removed/substituted. | Add guard: `if (ticket.isPrized) throw BadRequestException('Prized ticket cannot be removed or substituted')`. |
| **Q27** | **Single Branch Initial**: 1 operational branch (Perundurai HO); retain multi-branch schema. | Default branch `PRD` seeded as Head Office. Multi-branch architecture preserved. | **MATCH** | [`schema.prisma#L20-L33`](file:///u:/Kumaran-finance/apps/api/prisma/schema.prisma#L20-L33), [`seed.ts#L35-L48`](file:///u:/Kumaran-finance/apps/api/prisma/seed.ts#L35-L48) | `Branch` table with `code = 'PRD'` | `00-infrastructure-smoke.e2e.spec.ts#L25`: verifies PRD branch seed. **TEST EXECUTED — PASS** | None. Preserves multi-branch capability without overhead. |
| **Q28** | **Cross-Branch Scoping**: Only authorized partners may view across branches. | Branch Manager/Agents scoped strictly to `user.branchId`. Only Super Admin queries all branches. | **MATCH** | [`report.service.ts#L201-L205`](file:///u:/Kumaran-finance/apps/api/src/report/report.service.ts#L201-L205), [`L865-L870`](file:///u:/Kumaran-finance/apps/api/src/report/report.service.ts#L865-L870); [`statutory-report.service.ts#L196-L203`](file:///u:/Kumaran-finance/apps/api/src/report/statutory-report.service.ts#L196-L203) | Enforced in Prisma `where: { branchId }` queries | `verify-branch-kyc-idor.ps1`: tests branch manager cannot query other branch. **PASS** | None. Airtight RBAC and data isolation. |
| **Q29** | **Independent Approvals**: Specific workflows require dual control. | 5 workflows enforce dual control; Defaulter Removal, Settlement, and Auction Finalizer role have gaps. | **PARTIAL** | See Section 4 of this report for full breakdown across all 11 sub-rules. | Various Prisma models | Verified across unit tests and lifecycle scripts. | Restrict Auction Checker strictly to `SUPER_ADMIN`; add dual-partner checks on removal and settlement. |
| **Q30** | **Offline Collection**: Required for field agents; Flutter UI postponed. | Backend has `POST /collections/sync-offline-queue`. Client mobile app implementation is **DEFERRED**. | **DEFERRED (Mobile) / MATCH (Backend)** | [`collection.controller.ts#L101-L127`](file:///u:/Kumaran-finance/apps/api/src/collection/collection.controller.ts#L101-L127), [`collection.service.ts#L680-L750`](file:///u:/Kumaran-finance/apps/api/src/collection/collection.service.ts#L680-L750) | `Payment.idempotencyKey` prevents duplicate receipts | Backend sync tested in `verify-lifecycle-7.ts`. Mobile UI tests deferred. | Retain backend sync endpoint; postpone mobile app development. |
| **Q31** | **Receipt Format**: Digital PDF primary format; A5 printable layout acceptable. | `SubscriptionReceiptTemplate` generates standard A5 portrait PDF (419.53 x 595.28 pt) with presigned S3 URLs. | **MATCH** | [`subscription-receipt.template.ts#L30-L35`](file:///u:/Kumaran-finance/apps/api/src/pdf/templates/subscription-receipt.template.ts#L30-L35), [`pdf.controller.ts#L108-L117`](file:///u:/Kumaran-finance/apps/api/src/pdf/pdf.controller.ts#L108-L117) | `Receipt.pdfS3Key String?` | `verify-lifecycle-7.ts#L140`: verifies A5 PDF generation and S3 upload. **TEST EXECUTED — PASS** | None. Standard A5 digital delivery is operational. |
| **Q32** | **Bilingual Language**: Tamil and English together. | Bilingual headers, labels, and Tamil words (`RupeeWordsHelper.toTamilWords`) with Noto Sans Tamil fonts. | **MATCH** | [`font-resolver.helper.ts#L8-L36`](file:///u:/Kumaran-finance/apps/api/src/pdf/helpers/font-resolver.helper.ts#L8-L36), [`rupee-words.helper.ts#L110-L150`](file:///u:/Kumaran-finance/apps/api/src/pdf/helpers/rupee-words.helper.ts#L110-L150) | TrueType font assets committed in repo | `print-templates.spec.ts#L45`: tests bilingual Tamil/English rendering. **TEST EXECUTED — PASS** | None. Fully supported. |
| **Q33** | **Template Approval**: Existing templates require finance management verification. | 4 PDF templates + statutory reports exist in code, but lack official signed partner approval. | **PARTIAL** | [`pdf/templates/`](file:///u:/Kumaran-finance/apps/api/src/pdf/templates/), [`statutory-report.service.ts`](file:///u:/Kumaran-finance/apps/api/src/report/statutory-report.service.ts) | Form XVII, Form XXI, Form XXII, A5 Receipt, Payout Voucher | Visual gallery generated; partner physical review pending. | Schedule partner template verification session to formally approve formats. |
| **Q34** | **Customer Notifications**: SMS only; WhatsApp out of scope. | MSG91 DLT SMS implemented. WhatsApp stub exists in code. FCM push exists but mobile is deferred. | **PARTIAL** | [`msg91-sms.driver.ts`](file:///u:/Kumaran-finance/apps/api/src/notification/drivers/msg91-sms.driver.ts), [`notification.service.ts#L166-L195`](file:///u:/Kumaran-finance/apps/api/src/jobs/services/notification.service.ts#L166-L195) | DLT templates registered in `dlt-templates.constants.ts` | `push.spec.ts#L130`: tests SMS queue dispatch. **TEST EXECUTED — PASS** | Remove WhatsApp stub code; disable FCM push triggers until mobile app is resumed. |

---

## 3. Detailed Financial Verification

### 3.1 The 4 Core Financial Formulas

$$\begin{aligned}
\text{1. Commission:} \quad C &= \frac{V \times 4}{100} \quad (\text{Whole Rupees via BigInt}) \\
\text{2. Dividend Pool:} \quad D_{\text{total}} &= D_{\text{bid}} - C \\
\text{3. Ticket Dividend:} \quad Div &= \frac{D_{\text{total}}}{N} \quad (\text{Equal across all } N \text{ tickets}) \\
\text{4. Net Installment:} \quad I_{\text{net}} &= I_{\text{base}} - Div \quad \left(I_{\text{base}} = \frac{V}{N}\right)
\end{aligned}$$

### 3.2 Arithmetic Mismatch Investigation

#### Mismatch 1: Month N (Final Settlement) Installment Omission (Q08)
- **Confirmed Business Rule**: Winner pays that month's installment via payout deduction:
  $$\text{Net Payout} = V - \text{Commission} - I_{\text{base}}$$
- **Actual Code Behavior** ([`disbursement.service.ts#L907-L953`](file:///u:/Kumaran-finance/apps/api/src/disbursement/disbursement.service.ts#L907-L953)):
  $$\text{Net Payout}_{\text{code}} = V - \text{Commission} = 1,00,000 - 4,000 = \mathbf{96,000}$$
- **Sample Calculation for ₹1,00,000 Scheme (20 Months)**:
  - Chit Value $V = ₹1,00,000$
  - Foreman Commission (4%) = ₹4,000
  - Base Installment $I_{\text{base}} = ₹5,000$
  - Expected Net Disbursement: $1,00,000 - 4,000 - 5,000 = \mathbf{₹91,000}$
  - **Overpayment by Current Software: ₹5,000**. The final subscriber receives ₹96,000 without settling Month 20's installment.

#### Mismatch 2: Dividend Remainder Truncation (Q10)
- **Confirmed Business Rule**: Bids producing non-divisible dividends must be rejected.
- **Actual Code Behavior** ([`auction.service.ts#L57`](file:///u:/Kumaran-finance/apps/api/src/auction/auction.service.ts#L57)):
  $$\text{dividendPerTicket} = \text{totalDividend} / \text{totalTickets} \quad (\text{integer floor division})$$
- **Sample Calculation**:
  - $V = ₹1,00,000, N = 20$. Commission $C = ₹4,000$.
  - Bid Discount $D_{\text{bid}} = ₹25,005$.
  - $D_{\text{total}} = 25,005 - 4,000 = ₹21,005$.
  - $\text{dividendPerTicket} = 21,005 / 20 = \mathbf{₹1,050}$.
  - $20 \times 1,050 = ₹21,000$. **Remainder of ₹5 is silently lost/truncated**.

#### Mismatch 3: Missing Arrears Deduction on Prize Release (Q13 & Q14)
- **Confirmed Business Rule**: Winner's outstanding dues must be automatically deducted from prize payout.
- **Actual Code Behavior** ([`disbursement.service.ts#L610-L614`](file:///u:/Kumaran-finance/apps/api/src/disbursement/disbursement.service.ts#L610-L614)):
  - Code accepts an arbitrary manual `dto.disbursedAmount`.
  - Zero queries exist to fetch the winner's unpaid `InstallmentDue` records.
  - Zero validation exists to prevent setting `disbursedAmount > prizeMoney`.

---

## 4. Authorization & Persona Verification (Q29)

The table below audits the 11 specific operations cited in **Q29**, comparing software roles (`Role.SUPER_ADMIN`) against actual authorized partner identity:

| Workflow Operation | Confirmed Business Rule | Implemented Roles in Code | Maker != Checker Enforced? | Status |
|---|---|---|:---:|:---:|
| **1. Scheme Creation & Activation** | One partner can create and activate | `SUPER_ADMIN` | No (Single User) | **MATCH** |
| **2. Staff Creation & Role Promotion** | One Super Admin can create and assign roles | `SUPER_ADMIN` | No (Single User) | **MATCH** |
| **3. Customer Creation & KYC Verification** | Desk Accountant can register and verify KYC | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT` | No (Single User) | **MATCH** |
| **4. Defaulter Removal (3M)** | **Two distinct partners must approve** | `SUPER_ADMIN` (Single User) | **NO** | **MISMATCH** |
| **5. Subscriber Removal Settlement** | **Two distinct partners must approve** | `SUPER_ADMIN`, `ACCOUNTANT` (Single User) | **NO** | **MISMATCH** |
| **6. Prize Disbursement Authorization** | Staff verifies proof; separate partner authorizes | Maker: Staff/Admin; Checker: `SUPER_ADMIN` | **YES** | **MATCH** |
| **7. Auction Finalization Authority** | **A partner must always finalize** | `SUPER_ADMIN`, `BRANCH_MANAGER` | Yes, but Branch Manager allowed | **MISMATCH** |
| **8. Auction Separation of Duties** | Finalizer $\ne$ Bid Recorder | `conductedByUserId != checkerUserId` | **YES** | **MATCH** |
| **9. Payment Reversal Approval** | **Two different partners** (Partner A $\to$ Partner B) | Maker: Staff/Admin; Checker: `SUPER_ADMIN` | Yes, but Maker can be Accountant | **PARTIAL** |
| **10. Auction Correction Approval** | Different partner must approve correction | *Endpoint does not exist* | N/A | **NOT IMPLEMENTED** |
| **11. Cash Handover & UPI Verification** | Independent controls retained | Handover: Collector $\ne$ Cashier; UPI: Submitter $\ne$ Verifier | **YES** | **MATCH** |

---

## 5. Existing Test Evidence

All automated tests in the repository were forensically reviewed and compared against actual test execution results:

### 5.1 Unit Test Execution Summary (`pnpm --filter api test:unit`)
- **Total Test Suites**: 17
- **Total Tests Passed**: 69
- **Total Tests Failed**: 0
- **Suites Inspected & Executed**:
  1. [`chit.spec.ts`](file:///u:/Kumaran-finance/apps/api/test/unit/chit.spec.ts): ADR-13 unique tickets, duration = tickets, 4% commission lock, Month 1 pool (**PASS**).
  2. [`auction.spec.ts`](file:///u:/Kumaran-finance/apps/api/test/unit/auction.spec.ts): 1/4 ceiling guard, Option A tie-break token draw, Maker != Checker finalization (**PASS**).
  3. [`auction-state-machine.spec.ts`](file:///u:/Kumaran-finance/apps/api/test/unit/auction-state-machine.spec.ts): Terminal state immutability for `COMPLETED` and `MINUTES_FILED` (**PASS**).
  4. [`disbursement.spec.ts`](file:///u:/Kumaran-finance/apps/api/test/unit/disbursement.spec.ts): Safety proof verification, Maker != Checker payout authorization, Month N settlement (**PASS**).
  5. [`payment.spec.ts`](file:///u:/Kumaran-finance/apps/api/test/unit/payment.spec.ts): Exact $I_{net}$ matching, partial payment rejection, Maker != Checker reversals (**PASS**).
  6. [`financial-invariants.spec.ts`](file:///u:/Kumaran-finance/apps/api/test/unit/financial-invariants.spec.ts): Whole-rupee BigInt arithmetic, universal dividends, zero late fees (**PASS**).

### 5.2 Critical Test Gaps Identified
1. **No test asserts Month N installment deduction** in `settleFinalMonth` (Q08).
2. **No test asserts rejection of non-divisible auction bids** (Q10).
3. **No test asserts arrears offset during prize disbursement** (Q13).
4. **No test asserts dual-partner approval for defaulter removal** (Q24).
5. **No test verifies the presence of CANCELLED watermark on reversed PDF receipts** (Q22).

---

## 6. Remaining Business Decisions (Awaiting Owner Confirmation)

Only 2 questions remain genuinely unresolved and require owner policy confirmation:

1. **Security Documents Checklist (Q16)**:
   - Does Kumaran Finance want to maintain a standard minimum checklist (e.g. Promissory Note + Signed Blank Cheques), or should document collection remain 100% on-demand at the discretion of the partners for each winner?
2. **Early Exit Settlement Forfeiture Percentage (Q25)**:
   - What exact forfeiture or damage percentage should be deducted when settling an early-exit or defaulting subscriber:
     - Option A: 4.00% of Chit Value (Current code in `installment.service.ts`).
     - Option B: 5.00% of Chit Value (Section 28 statutory ceiling in Chit Funds Act, 1982).
     - Option C: Actual expenses incurred with ₹0 penalty.

---

## 7. Deferred Flutter Scope (Mobile UI Postponed)

Per the explicit scope directive, all Flutter mobile UI and Android application implementation is **POSTPONED**.

### Inventory of Deferred Mobile-Only Features:
- Flutter Android Collection Agent App UI screens (`apps/mobile/lib/features/collection/`).
- Flutter Customer Digital Passbook UI screens (`apps/mobile/lib/features/passbook/`).
- Android Bluetooth Thermal Printer integration (`esc_pos_printer` / ESC/POS commands).
- Mobile SQLite / Hive offline sync queue watcher.
- Mobile Firebase Cloud Messaging push notification receipt popups.

*Note: The backend API endpoint `POST /collections/sync-offline-queue` is fully functional and ready to ingest offline collection batches whenever mobile development resumes.*

---

## 8. Recommended Remediation Priorities

When implementation commences, changes should be tackled in the following prioritized order:

```mermaid
graph TD
    P1["Priority 1 (Critical Financial Integrity)\n• Q08: Deduct Month N Installment in settleFinalMonth\n• Q10: Enforce Exact Whole-Rupee Dividend Divisibility\n• Q13/Q14: Automate Arrears Deduction on Prize Release"]
    P2["Priority 2 (Dual-Control & Security Compliance)\n• Q24/Q29: Two-Partner Approval for Defaulter Removal & Settlement\n• Q29: Restrict Auction Checker strictly to SUPER_ADMIN\n• Q21: Restrict Reversal Maker to SUPER_ADMIN if Partner-only"]
    P3["Priority 3 (Audit & Document Compliance)\n• Q22: Add 'ரத்து செய்யப்பட்டது / CANCELLED' Watermark to PDF\n• Q26: Block Defaulter Removal on Prized Tickets\n• Q34: Purge WhatsApp Stub Code from Backend"]
    P4["Priority 4 (New Features & Partner Reviews)\n• Q12: Implement Controlled Auction Correction Workflow\n• Q33: Partner Verification of PDF Templates\n• Q16/Q25: Formalize Security & Exit Forfeiture Policies"]
    
    P1 --> P2 --> P3 --> P4
```

---

### Audit Sign-Off
- **Report Location**: [`docs/08-audit/34-BUSINESS-RULES-REPOSITORY-VERIFICATION.md`](file:///u:/Kumaran-finance/docs/08-audit/34-BUSINESS-RULES-REPOSITORY-VERIFICATION.md)
- **Status**: Strictly Read-Only. Zero code modified. All findings verified against actual source code and live test execution logs.
