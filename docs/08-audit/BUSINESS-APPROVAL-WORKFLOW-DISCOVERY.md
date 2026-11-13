# KUMARAN CHITS — MAKER-CHECKER APPROVAL WORKFLOW DISCOVERY

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance** (Head Office: Perundurai, Erode District, Tamil Nadu)  
> **Operational Reality**: Single physical branch office, managed by 4 equal partners and 2–3 field collection agents. Transitioning from physical hand-written ledgers to an automated digital system.  
> **Audit Status**: **STRICTLY READ-ONLY ARCHITECTURAL & BUSINESS WORKFLOW DISCOVERY**  
> **Date**: November 13, 2026  

---

## Executive Summary

Under **Architectural Guardrail 10 (ADR-08 / Invariant 10)**, Kumaran Chits mandates **Maker-Checker Separation of Duties** (`maker_user_id != checker_user_id`) to prevent unilateral fraud, embezzlement, or accidental misallocations in critical financial and operational workflows.

This discovery audit systematically inspected the actual NestJS controllers, services, guards, Prisma schema, frontend views, and automated test suites to identify:
1. Which operations currently enforce strict dual control (`maker_user_id != checker_user_id`).
2. Which operations allow unilateral single-person execution without a second authorized approval.
3. Which operations are completely missing approval workflows or operate purely via external CLI scripts.

### High-Level Discovery Verdict

| Category | Count | Operations Included |
|---|:---:|---|
| **Fully Enforced Dual Control (`Maker != Checker`)** | **5** | Auction Finalization, Prize Disbursement Authorization, Cash Handover Acknowledgment, UPI Claim Verification, Payment Reversal Approval. |
| **Single-Person Execution (Unilateral Authority)** | **8** | Customer Creation & KYC Verification, Chit Scheme Creation & Activation, Ticket Assignment, Cash Collection & Receipt Issuance, Defaulter Removal, Subscriber Substitution & Settlement, Staff Creation & Role Promotion, Statutory Minutes Filing. |
| **Downstream Execution Step** | **1** | Prize Payment Release (Requires prior Checker authorization, but release transaction itself is single-person). |
| **Feature Intentionally Absent (Statutory / Ledger Invariant)** | **3** | Auction Correction / Reopening (FIN-04), Prize Payment Cancellation (FIN-05), Financial Report Overrides (Immutable Ledger). |
| **Data Model / Process Gaps (CLI Only or Unmodeled)** | **2** | Bank Account Profile Changes (No persistent bank account model; captured ephemerally), Database Backup Restoration & Admin Overrides (External CLI scripts only). |

---

## Section A. Current Implementation Matrix

The table below provides a forensic breakdown of every major business operation involving administrative or financial authority across Kumaran Chits.

| # | Business Operation | Initiator Roles (Maker) | Approver Roles (Checker) | Different Person Enforced? (`Maker != Checker`) | Backend Evidence (File & Line) | Test Evidence | Status |
|---|---|---|---|:---:|---|---|:---:|
| **1** | **Customer Creation & KYC Approval** | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT` | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT` | **NO** | [`customer.controller.ts#L74`](file:///u:/Kumaran-finance/apps/api/src/customer/customer.controller.ts#L74), [`L199`](file:///u:/Kumaran-finance/apps/api/src/customer/customer.controller.ts#L199); [`customer.service.ts#L355-L390`](file:///u:/Kumaran-finance/apps/api/src/customer/customer.service.ts#L355-L390) | Unit tests in `customer.spec.ts` test creation and KYC status independently; no dual-control assertion | **SINGLE-PERSON ONLY** |
| **2** | **Chit Scheme Creation & Activation** | `SUPER_ADMIN` | `SUPER_ADMIN` | **NO** | [`chit.controller.ts#L57`](file:///u:/Kumaran-finance/apps/api/src/chit/chit.controller.ts#L57), [`L203`](file:///u:/Kumaran-finance/apps/api/src/chit/chit.controller.ts#L203); [`chit.service.ts#L494-L610`](file:///u:/Kumaran-finance/apps/api/src/chit/chit.service.ts#L494-L610) | `chit.spec.ts` verifies ticket capacity and Month 1 pool generation; no second partner check | **SINGLE-PERSON ONLY** |
| **3** | **Subscriber Ticket Assignment** | `SUPER_ADMIN`, `BRANCH_MANAGER` | None | **NO** | [`chit.controller.ts#L150`](file:///u:/Kumaran-finance/apps/api/src/chit/chit.controller.ts#L150); [`chit.service.ts#L430-L485`](file:///u:/Kumaran-finance/apps/api/src/chit/chit.service.ts#L430-L485) | `chit.spec.ts` verifies ADR-13 unique constraint; no approval required | **SINGLE-PERSON ONLY** |
| **4** | **Auction Finalization** | `SUPER_ADMIN`, `BRANCH_MANAGER` (Records bid/lot draw) | `SUPER_ADMIN`, `BRANCH_MANAGER` (Finalizes auction) | **YES (STRICT)** | [`auction.controller.ts#L115`](file:///u:/Kumaran-finance/apps/api/src/auction/auction.controller.ts#L115), [`L202`](file:///u:/Kumaran-finance/apps/api/src/auction/auction.controller.ts#L202); [`auction.service.ts#L472-L476`](file:///u:/Kumaran-finance/apps/api/src/auction/auction.service.ts#L472-L476), [`L515-L519`](file:///u:/Kumaran-finance/apps/api/src/auction/auction.service.ts#L515-L519) | `auction.spec.ts#L425-L440`; `verify-lifecycle-4.ts#L104-L117` (**100% Pass**) | **IMPLEMENTED & ENFORCED** |
| **5** | **Auction Correction or Cancellation** | *None* | *None* | **N/A** | [`auction.service.ts#L508-L512`](file:///u:/Kumaran-finance/apps/api/src/auction/auction.service.ts#L508-L512) rejects changes to completed auctions; zero endpoints exist | `auction-state-machine.spec.ts` confirms terminal state immutability | **MISSING BY DESIGN (FIN-04)** |
| **6** | **Prize Disbursement Authorization** | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT` (Verifies Safety Proof) | `SUPER_ADMIN` (Authorizes Payout) | **YES (STRICT)** | [`disbursement.controller.ts#L186`](file:///u:/Kumaran-finance/apps/api/src/disbursement/disbursement.controller.ts#L186), [`L209`](file:///u:/Kumaran-finance/apps/api/src/disbursement/disbursement.controller.ts#L209); [`disbursement.service.ts#L604-L608`](file:///u:/Kumaran-finance/apps/api/src/disbursement/disbursement.service.ts#L604-L608) | `disbursement.spec.ts#L297-L345`; `verify-lifecycle-8.ts` (**100% Pass**) | **IMPLEMENTED & ENFORCED** |
| **7** | **Prize Payment Release** | `SUPER_ADMIN`, `ACCOUNTANT` | None (Requires state `AUTHORIZED_BY_CHECKER`) | **NO (Step 3 Execution)** | [`disbursement.controller.ts#L234`](file:///u:/Kumaran-finance/apps/api/src/disbursement/disbursement.controller.ts#L234); [`disbursement.service.ts#L670-L720`](file:///u:/Kumaran-finance/apps/api/src/disbursement/disbursement.service.ts#L670-L720) | `disbursement.spec.ts` verifies release succeeds only when status is authorized | **IMPLEMENTED** |
| **8** | **Prize Payment Cancellation** | *None* | *None* | **N/A** | [`disbursement.service.ts`](file:///u:/Kumaran-finance/apps/api/src/disbursement/disbursement.service.ts) contains zero cancellation endpoints; terminal state | `state-matrix-sweep.spec.ts` verifies `DISBURSED` is terminal | **MISSING BY DESIGN (FIN-05)** |
| **9** | **Cash Collection & Receipt Issuance** | `COLLECTION_AGENT`, `ACCOUNTANT`, `SUPER_ADMIN` | None (Direct issuance) | **NO** | [`collection.controller.ts#L70`](file:///u:/Kumaran-finance/apps/api/src/collection/collection.controller.ts#L70); [`collection.service.ts#L100-L240`](file:///u:/Kumaran-finance/apps/api/src/collection/collection.service.ts#L100-L240) | `payment.spec.ts`; `verify-lifecycle-7.ts` | **IMPLEMENTED** |
| **10** | **Cash Handover Acknowledgment** | `COLLECTION_AGENT`, `ACCOUNTANT` (Submits batch) | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT` (Acknowledges custody) | **YES (STRICT)** | [`collection.controller.ts#L174`](file:///u:/Kumaran-finance/apps/api/src/collection/collection.controller.ts#L174); [`collection.service.ts#L387-L391`](file:///u:/Kumaran-finance/apps/api/src/collection/collection.service.ts#L387-L391) | `payment.spec.ts`; `verify-lifecycle-7.ts` (**100% Pass**) | **IMPLEMENTED & ENFORCED** |
| **11** | **UPI Claim Verification** | `CUSTOMER` (Self-service), `ACCOUNTANT` (Submits UTR) | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT` (Verifies bank statement) | **YES (STRICT)** | [`payment.controller.ts#L332`](file:///u:/Kumaran-finance/apps/api/src/payment/payment.controller.ts#L332); [`payment.service.ts#L1111-L1115`](file:///u:/Kumaran-finance/apps/api/src/payment/payment.service.ts#L1111-L1115) | `payment.spec.ts#L1022`; `verify-upi-intent-and-claims.ts` (**100% Pass**) | **IMPLEMENTED & ENFORCED** |
| **12** | **Payment Reversal & Receipt Cancellation** | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT` (Requests reversal) | `SUPER_ADMIN` strictly (Approves / Rejects) | **YES (STRICT)** | [`payment.controller.ts#L201`](file:///u:/Kumaran-finance/apps/api/src/payment/payment.controller.ts#L201), [`L226`](file:///u:/Kumaran-finance/apps/api/src/payment/payment.controller.ts#L226); [`payment.service.ts#L738-L742`](file:///u:/Kumaran-finance/apps/api/src/payment/payment.service.ts#L738-L742), [`L858-L862`](file:///u:/Kumaran-finance/apps/api/src/payment/payment.service.ts#L858-L862) | `payment.spec.ts#L489`; `verify-lifecycle-7.ts`; `payment-reversals.spec.ts` (**100% Pass**) | **IMPLEMENTED & ENFORCED** |
| **13** | **Subscriber Default & Removal** | `SUPER_ADMIN` | None (Unilateral removal) | **NO** | [`ticket.controller.ts#L142`](file:///u:/Kumaran-finance/apps/api/src/installment/ticket.controller.ts#L142); [`installment.service.ts#L630-L685`](file:///u:/Kumaran-finance/apps/api/src/installment/installment.service.ts#L630-L685) | `financial-invariants.spec.ts` verifies 3-month arrears check; no maker-checker | **SINGLE-PERSON ONLY** |
| **14** | **Subscriber Substitution & Exit Settlement** | `SUPER_ADMIN` (Substitute); `SUPER_ADMIN`, `ACCOUNTANT` (Settlement) | None | **NO** | [`ticket.controller.ts#L170`](file:///u:/Kumaran-finance/apps/api/src/installment/ticket.controller.ts#L170), [`L196`](file:///u:/Kumaran-finance/apps/api/src/installment/ticket.controller.ts#L196); [`installment.service.ts#L690-L845`](file:///u:/Kumaran-finance/apps/api/src/installment/installment.service.ts#L690-L845) | Unit tests verify 5% forfeiture math; no dual sign-off | **SINGLE-PERSON ONLY** |
| **15** | **Bank Account Changes** | `SUPER_ADMIN`, `ACCOUNTANT` | `SUPER_ADMIN` (Indirectly via Prize Disbursement) | **PARTIAL** | Captured as free-text fields in `AuctionWinner` ([`schema.prisma#L272`](file:///u:/Kumaran-finance/apps/api/prisma/schema.prisma#L272)); no dedicated `bank_account` table exists | Tested only within disbursement test suite | **PARTIAL / NO DEDICATED MODEL** |
| **16** | **Staff Creation & Role Changes** | `SUPER_ADMIN` | None | **NO** | [`user.controller.ts#L68`](file:///u:/Kumaran-finance/apps/api/src/user/user.controller.ts#L68), [`L105`](file:///u:/Kumaran-finance/apps/api/src/user/user.controller.ts#L105); [`user.service.ts#L110-L185`](file:///u:/Kumaran-finance/apps/api/src/user/user.service.ts#L110-L185) | `user.spec.ts` tests single-admin role mutation; no quorum or secondary partner check | **SINGLE-PERSON ONLY** |
| **17** | **Financial Report Corrections** | *None* | *None* | **N/A** | All endpoints in [`report.controller.ts`](file:///u:/Kumaran-finance/apps/api/src/report/report.controller.ts) are strictly `@Get()`. Zero mutation endpoints exist. | `report.spec.ts` validates real-time ledger aggregates | **IMMUTABLE LEDGER (NO OVERRIDES)** |
| **18** | **Statutory Report Submission (Minutes Filing)** | `SUPER_ADMIN`, `BRANCH_MANAGER`, `ACCOUNTANT` | None | **NO** | [`auction.controller.ts#L246-L262`](file:///u:/Kumaran-finance/apps/api/src/auction/auction.controller.ts#L246-L262); [`auction.service.ts#L863-L910`](file:///u:/Kumaran-finance/apps/api/src/auction/auction.service.ts#L863-L910) | `verify-lifecycle-4.ts#L125-L135` verifies single-staff registrar filing record | **SINGLE-PERSON ONLY** |
| **19** | **Backup Restoration & Admin Overrides** | Shell / OS Administrator | None | **NO** | CLI scripts only: [`restore-from-s3.sh`](file:///u:/Kumaran-finance/infra/scripts/restore-from-s3.sh), [`restore-from-s3.ts`](file:///u:/Kumaran-finance/apps/api/scripts/ops/restore-from-s3.ts). Zero in-app endpoints. | `drp-drill.ts` executes end-to-end restore without software checks | **EXTERNAL CLI ONLY** |

---

## Section B. Recommended Business Decision Matrix

For Kumaran Finance (a 4-partner firm), different operations demand different balances between **operational speed** and **fraud prevention**.

The table below outlines the recommended governance options for each workflow:

| # | Business Operation | Option 1: No Second Approval (Single-User) | Option 2: Second Authorized Manager Approval | Option 3: Second Partner Approval (`SUPER_ADMIN != SUPER_ADMIN`) | Option 4: Two Partners Quorum (2 of 4 Partners) | **Recommended Architecture for Kumaran Finance** |
|---|---|:---:|:---:|:---:|:---:|---|
| **1** | **Customer Creation & KYC Approval** | Fast for field staff | Branch Manager verifies Accountant entry | One Partner approves KYC | Unnecessary delay | **Option 2 (Branch Manager / Partner verifies Accountant)**: Field agent or accountant enters customer data; Manager or Partner confirms Aadhaar/PAN. |
| **2** | **Chit Scheme Creation & Activation** | High risk of unauthorized pool | Branch Manager creates, Partner activates | **Partner A creates, Partner B activates** | All 4 partners sign off | **Option 3 (Second Partner Approval)**: Prevents one partner from launching an unapproved scheme or misconfiguring commission/pool. |
| **3** | **Subscriber Ticket Assignment** | High risk of ghost members | Branch Manager assigns, Partner confirms | One Partner assigns, Second confirms | Unnecessary delay | **Option 1 for DRAFT; Option 2 for ACTIVE Schemes**: Flexible during onboarding, but locked once group is running. |
| **4** | **Auction Finalization** | **Prohibited** (ADR-08) | **Current: Maker records, Checker finalizes** | **Current: Partner A records, Partner B finalizes** | Impractical in field | **Current Implementation (Enforced)**: Staff/Manager records winning bid; Partner or Manager (distinct user) finalizes. |
| **5** | **Prize Disbursement Authorization** | **Prohibited** (ADR-15) | Branch Manager verifies, Partner authorizes | **Partner A verifies proof, Partner B authorizes payout** | Quorum for > ₹10 Lakhs | **Current Implementation (Enforced)**: Maker verifies safety proof checklist; Partner (Checker) authorizes payout. |
| **6** | **Prize Payment Release** | **Current: Executed post-authorization** | Cashier/Accountant executes | Partner executes | Not applicable | **Current Implementation (Enforced)**: Gated strictly by `AUTHORIZED_BY_CHECKER`. |
| **7** | **Cash Handover Acknowledgment** | High risk of theft | **Current: Collector submits, Cashier/Partner acknowledges** | Partner acknowledges | Not applicable | **Current Implementation (Enforced)**: Field Collector $\ne$ Branch Cashier/Partner. |
| **8** | **UPI Claim Verification** | High risk of fake UTR | **Current: Customer submits, Accountant/Partner verifies** | Partner verifies | Not applicable | **Current Implementation (Enforced)**: Submitter $\ne$ Verifier. |
| **9** | **Payment Reversal & Receipt Cancellation** | **Prohibited** (ADR-08) | Manager requests, Partner approves | **Current: Accountant/Manager requests, Partner approves** | Two partners for > ₹50,000 | **Current Implementation (Enforced)**: Distinct Partner must approve; cannot approve own request. |
| **10** | **Subscriber Default Removal (3M)** | High risk of malicious expulsion | Branch Manager initiates, Partner confirms | **Partner A initiates, Partner B approves removal** | Impractical | **Option 3 (Second Partner Approval)**: Removing a subscriber forfeits their rights; requires consensus of at least two partners. |
| **11** | **Subscriber Substitution & Settlement** | High risk of ghost substitution | Branch Manager calculates, Partner signs voucher | **Partner A nominates replacement, Partner B authorizes refund** | Quorum for settlement | **Option 3 (Second Partner Approval)**: Reassigning an active chit ticket and issuing exit refund vouchers involves direct cash outlay. |
| **12** | **Staff Account Creation & Role Promotion** | Omnipotent single Super Admin | Manager requests, Partner approves | **Partner A creates, Partner B approves SUPER_ADMIN promotion** | 3 of 4 Partners Quorum | **Option 3 or 4**: Creating staff can be single partner; elevating any user to `SUPER_ADMIN` must require a second partner sign-off. |
| **13** | **Statutory Minutes Filing with Registrar** | High risk of erroneous challan entry | **Current: Any Staff/Partner records filing** | Partner review before filing | Not applicable | **Option 2 (Branch Manager or Partner confirms filing)**: Ensure official government challan number matches physical receipt. |
| **14** | **Database Restore & Disaster Recovery** | Catastrophic data wipe risk | Ops Engineer runs script | **Dual-Key Passphrase / 2-Partner Approval on CLI** | Unnecessary | **Option 3 (Dual-Admin / Partner Approval)**: Shell script requires two distinct authorized keys/passphrases before executing `DROP / RESTORE`. |

---

## Section C. Security and Financial Risks in Current Implementation

While Kumaran Chits has implemented exemplary dual control on **5 core financial endpoints**, the discovery revealed critical single-user attack vectors:

### 1. The Omnipotent Single `SUPER_ADMIN` Problem
- **Risk**: Any single partner logged in with `SUPER_ADMIN` can:
  1. Create a brand-new chit scheme of ₹50 Lakhs and activate it unilaterally ([`chit.controller.ts#L203`](file:///u:/Kumaran-finance/apps/api/src/chit/chit.controller.ts#L203)), automatically generating Month 1 company pool prize.
  2. Create an arbitrary new user and grant them `SUPER_ADMIN` privileges ([`user.controller.ts#L105`](file:///u:/Kumaran-finance/apps/api/src/user/user.controller.ts#L105)) without the other 3 partners' consent or knowledge.
  3. Remove a defaulting subscriber and substitute a friend or relative ([`ticket.controller.ts#L170`](file:///u:/Kumaran-finance/apps/api/src/installment/ticket.controller.ts#L170)), issuing an exit settlement refund voucher unilaterally.
- **Financial Impact**: High vulnerability to partner dispute, covert ticket assignment, and uncoordinated pool creation.

### 2. Single-Staff Customer Onboarding & KYC Bypassing
- **Risk**: Any single `ACCOUNTANT`, `BRANCH_MANAGER`, or `SUPER_ADMIN` can create a customer record and immediately toggle `isKycVerified = true` ([`customer.controller.ts#L199`](file:///u:/Kumaran-finance/apps/api/src/customer/customer.controller.ts#L199)).
- **Financial Impact**: Risk of "ghost" or proxy subscribers created by field staff or a rogue partner to absorb vacant tickets or siphon dividends.

### 3. Unilateral Subscriber Default Removal & Settlement
- **Risk**: A single administrator can execute `POST /installments/tickets/:ticketId/remove-defaulter` followed by `POST /installments/tickets/:ticketId/settle-removal`.
- **Financial Impact**: The exit settlement calculates a refund of past subscriptions minus 5% foreman penalty. If executed unilaterally without a second partner review, cash or cheque refunds could be disbursed fraudulently to fictitious substitute subscribers.

### 4. Out-of-Band Database Restoration (Disaster Recovery Risk)
- **Risk**: The database restore tool (`infra/scripts/restore-from-s3.sh`) is executed directly in the Linux terminal via `pg_restore --clean`. There is zero application-level logging, zero multi-party authorization, and no requirement for dual passphrases.
- **Financial Impact**: A single compromised shell credential could overwrite live financial ledgers with an old backup, wiping recent collections, auctions, and receipts.

---

## Section D. Contradictions & Audit Cross-References

Comparing these findings against earlier audit reports reveals key confirmations and discrepancies:

| Topic | Finding in Prompt 03 / Prompt 04 / Prompt 06 | Discovery Finding in Maker-Checker Audit | Resolution & Reality |
|---|---|---|---|
| **Guardrail 10 Enforcement** | Prompt 03 verified that `conductedByUserId != checkerUserId` and `verifiedByUserId != checkerUserId` are strictly enforced. | **Confirmed 100%**. Reverse engineering confirms hard `ForbiddenException` throws in Auction, Disbursement, Reversal, Handover, and UPI. | Guardrail 10 is mathematically solid on its 5 core targets. |
| **RBAC Omnipotence** | Prompt 03 flagged that `SUPER_ADMIN` has no intra-role restrictions (no multi-partner quorum for role changes). | **Confirmed**. `user.controller.ts` allows any single Super Admin to promote any staff member to Super Admin without secondary approval. | Needs partner decision: Should role promotion require a 2nd partner's sign-off? |
| **Defaulter Removal Concurrency** | Prompt 04 noted that `removeDefaulter` uses row locks, but questioned if dual control was required. | **Discovery reveals zero dual control**. Removal and substitution are completely single-user operations. | Single-user execution creates operational risk for a 4-partner firm. |
| **Disaster Recovery Dual-Control** | Prompt 06 flagged that `restore-from-s3.sh` runs unattended without software safeguards. | **Discovery confirms CLI-only execution**. Zero application-level audit logging or maker-checker safeguards exist for database restoration. | Production runbook must mandate dual-partner sign-off on server access. |
| **Bank Account Data Model** | Prompt 01 & 02 assumed bank accounts were modeled under Customer. | **Discovery reveals NO persistent Bank Account table**. Payout details and cheque numbers are passed ad-hoc during disbursement authorization. | Acceptable under ADR-15 (Company Safety Proof checklist), but limits automated NEFT/RTGS validation. |

---

## Section E. Questions for the Business Owner (Kumaran Finance)

To align the software with the day-to-day operations of the 4 partners and branch staff in Perundurai, please review and answer these 6 specific decisions:

1. **Partner Dual-Control on Chit Scheme Activation**:
   - *Current Behavior*: Any 1 partner can create and activate a new chit scheme, committing company funds and Month 1 prize money.
   - *Decision Needed*: Should scheme activation strictly require a **second partner's approval** (`created_by_partner_id != activated_by_partner_id`), or is single-partner activation acceptable?

2. **Staff Role Promotion & Super Admin Privileges**:
   - *Current Behavior*: Any 1 partner can promote an accountant or branch manager to `SUPER_ADMIN`.
   - *Decision Needed*: Should creating or promoting someone to `SUPER_ADMIN` require **two partners' sign-offs**?

3. **Customer KYC Verification Threshold**:
   - *Current Behavior*: A Desk Accountant can enter a new customer and verify their KYC immediately.
   - *Decision Needed*: Should Customer KYC verification be restricted so that **the Branch Manager or a Partner must verify** what the Accountant or Agent entered?

4. **Subscriber Default Removal & Substitution**:
   - *Current Behavior*: A single partner can remove a 3-month defaulter, assign a replacement customer, and issue an exit refund voucher.
   - *Decision Needed*: Should removing a subscriber or issuing their settlement refund voucher require **dual-partner authorization**?

5. **Prize Disbursement Thresholds**:
   - *Current Behavior*: All disbursements (from ₹1 Lakh to ₹50 Lakhs) require 2 people (Maker verifies safety proof, Checker authorizes payout).
   - *Decision Needed*: Is this 2-person rule sufficient for all prize amounts, or should prizes over a certain threshold (e.g. ₹10 Lakhs) require **two Partners specifically**?

6. **Auction Finalization at Branch**:
   - *Current Behavior*: Staff records the auction bids; a Branch Manager or Partner finalizes as Checker.
   - *Decision Needed*: Are you satisfied with Branch Managers acting as Checkers for regular monthly auctions, or must the Checker **always be one of the 4 Partners**?

---

### Audit Sign-Off
- **Investigation Type**: Non-destructive, read-only inspection of source code, schemas, and test suites.
- **Deliverable Location**: [`docs/08-audit/BUSINESS-APPROVAL-WORKFLOW-DISCOVERY.md`](file:///u:/Kumaran-finance/docs/08-audit/BUSINESS-APPROVAL-WORKFLOW-DISCOVERY.md)
- **Target Systems Inspected**: `apps/api/src/`, `apps/web/`, `apps/api/prisma/schema.prisma`, `infra/scripts/`.
