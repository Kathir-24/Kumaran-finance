# Kumaran Chits — Comprehensive User Stories & Persona Journey Maps

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance** (Head Office: Perundurai, Erode, Tamil Nadu)  
> **Scope**: 100% coverage of all 10 functional modules across all 6 standardized personas.  
> **Status**: Authoritative Product Specification (`CONFIRMED-BY-DEVELOPER`)  
> **Zero Hallucination Guarantee**: Directly derived from confirmed business decisions (ADR-01 through ADR-15), [`financial-rules.md`](../01-business/financial-rules.md), and [`permissions-matrix.md`](../01-business/permissions-matrix.md).

---

## 1. Feature Catalog & Persona Matrix

The system encompasses **10 Core Functional Modules** broken down into **28 Granular Features**. Every feature is mapped to the exact personas interacting with it:

| # | Module / Feature Name | Super Admin (Partners) | Branch Manager | Accountant | Collection Agent | Customer (Subscriber) | Auditor (CA) |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **M1** | **Authentication & Security** | | | | | | |
| 1.1 | Web Login + Microsoft Authenticator 2FA | Actor | Actor | Actor | — | — | Actor |
| 1.2 | Mobile App 6-digit MPIN Quick Unlock & Biometrics | Actor (Parity)| — | Actor (Dual) | Actor | Actor | — |
| 1.3 | Session Management & Instant Logout | Actor | Actor | Actor | Actor | Actor | Actor |
| **M2** | **Branch & Staff Management** | | | | | | |
| 2.1 | Single Branch Configuration (`PRD`) | Actor | View | View | — | — | View |
| 2.2 | Staff Profile & Multi-Role Assignment | Actor | View | — | — | — | View |
| **M3** | **Customer & Nominee Intake** | | | | | | |
| 3.1 | Customer Intake (`KC-CUST-XXXXX`) & Tamil Names | Actor | Actor | Limited | Lead Intake | Self-profile | View |
| 3.2 | Masked Aadhaar (Last 4) & PAN Verification | Checker | Maker | Maker | — | Upload | View |
| 3.3 | Nominee Relationship & Signature Linking | Actor | Actor | Actor | Lead Intake | View/Edit | View |
| **M4** | **Chit Scheme Management** | | | | | | |
| 4.1 | Fresh Chit Group Creation (4% Commission Lock) | Actor | Review | Review | — | View | View |
| 4.2 | Mid-Cycle Intake from Physical Notebooks | Checker | Maker | Maker | — | — | View |
| 4.3 | Fixed 1/4 (25%) Discount Ceiling Enforcement | System | System | System | System | System | System |
| 4.4 | Month 1 & Month $N$ Special Rule Execution | Actor | Actor | View | — | View | View |
| **M5** | **Ticket Allocation & Membership** | | | | | | |
| 5.1 | Ticket Assignment (Strictly 1 Ticket per Customer) | Actor | Actor | — | — | Request | View |
| 5.2 | 3-Month Arrears Tracking & Company Removal Rights | Checker | Maker | Review | Field Notice | View Warning | View |
| **M6** | **Installment Schedules & Dividends** | | | | | | |
| 6.1 | Due Schedule Generation with Universal Dividends | Actor | Actor | Review | View Dues | View Dues | View |
| 6.2 | Single Discrete Payment Validation (No Partial/Adv) | System | System | System | System | System | System |
| **M7** | **Field Collections & Cash Handover** | | | | | | |
| 7.1 | Doorstep Cash Collection & Passbook Signature | Actor | Actor | Actor | Actor | Payee | View |
| 7.2 | Offline Collection Queue & Auto-Sync | — | — | — | Actor | — | — |
| 7.3 | Evening Cash Handover (`collector != acknowledger`)| Checker | Checker | Checker | Maker | — | View |
| **M8** | **In-Office Auctions & Tie-Breakers** | | | | | | |
| 8.1 | Pre-Auction Defaulter Ineligibility Check | System | System | System | — | System | View |
| 8.2 | In-Office Bidding & Record-Bid (Maker) | Maker | Maker | — | — | Attendee | View |
| 8.3 | Physical Paper Token Tie-Break Draw (Option A) | Actor | Actor | Witness | — | Witness | View |
| 8.4 | Auction Finalization (`maker != checker`) | Checker | — | — | — | View Result | View |
| **M9** | **Prize Disbursement & Safety Proof** | | | | | | |
| 9.1 | Safety Proof Checklist (Agreements/Cheques/Notes) | Checker | Maker | Maker | — | Submitter | View |
| 9.2 | Dual-Control Prize Payout Authorization | Checker | — | Voucher Prep| — | Recipient | View |
| **M10**| **Accounting, Reports & Audit Trail** | | | | | | |
| 10.1| Day Book, Cash Book & Handover Reconciliation | Actor | Branch Scope| Global Scope| — | — | Read-only |
| 10.2| Bilingual Receipts (English + தமிழ் SMS/WhatsApp) | Trigger | Trigger | Trigger | Trigger | Receiver | View |
| 10.3| Immutable Append-Only Audit Trail | Global | Branch Scope| Read-only | — | Own History | Global |

---

## 2. Detailed Persona Profiles

### Persona 1: Super Admin / Owner (The 4 Partners)
- **Profile**: Equal partners of Kumaran Finance operating from Head Office (Perundurai).
- **Device**: **100% Full Parity on BOTH Platforms** — Desktop PC / Laptop via Web Portal (`apps/web/`) AND Android Smartphone via Mobile App (`apps/mobile/`).
- **Core Mindset**: Safeguarding capital, preventing internal fraud, ensuring compliance, and expanding the customer base with instant pocket approvals.
- **Dual Role & Cross-Device Invariant**: Acts as **Operational Maker** (entering auction bids, safety proof, or reversals) or **Final Checker** (finalizing auctions, payment reversals, prize payouts, cash handover). **Must never approve their own entries** (`maker != checker`), regardless of whether Maker and Checker use Web or Mobile.

### Persona 2: Branch Manager
- **Profile**: Operational head of the Perundurai branch office. In current business, the **4 partners fulfill all branch manager duties directly**; the software treats it as a scoped role for future expansion.
- **Device**: Web Portal.
- **Core Mindset**: Customer intake accuracy, auction facilitation, and staff coordination.

### Persona 3: Desk Accountant
- **Profile**: Office financial recordkeeper. Can also be a field collection agent wearing the accountant hat during office hours (`[COLLECTION_AGENT, ACCOUNTANT]`).
- **Device**: Web Portal.
- **Core Mindset**: Rupee-accurate day books, zero cashier shortage, verifying physical cash against app receipts, and preparing payment vouchers.

### Persona 4: Field Collection Agent
- **Profile**: 2 to 3 field staff conducting daily/monthly doorstep collections in Perundurai and surrounding Erode rural areas.
- **Device**: Android Smartphone running the Flutter Mobile App (`apps/mobile/`) + Customer Physical Notebook/Passbook.
- **Core Mindset**: Speed at doorstep (under 30 seconds), zero typing errors, working without mobile internet (offline resilience), and handing over physical cash safely at 5:00 PM.

### Persona 5: Customer / Chit Subscriber
- **Profile**: Local farmers, weavers, traders, and salaried individuals in Tamil Nadu enrolled in 1 or more chits.
- **Device**: Android Smartphone (Customer App in Tamil/English) or Physical Paper Passbook.
- **Core Mindset**: Transparency on dividend deductions, knowing exact net amount payable, immediate official receipt for every rupee paid, and fairness during auctions.

### Persona 6: Independent Auditor (Chartered Accountant)
- **Profile**: External CA reviewing company books for statutory audits and registrar filings.
- **Device**: Web Portal (Strictly Read-Only).
- **Core Mindset**: Verifying zero rupee discrepancies, inspecting signed auction minutes, and verifying that forensic audit logs match financial balances.

---

## 3. End-to-End User Journey Maps

```mermaid
journey
    title A Day in Kumaran Chits: Cross-Persona Operational Journey
    section Morning (8:30 AM - 9:30 AM)
      Partner logs in with 2FA & views cash dashboard: 5: Super Admin
      Agent unlocks app with MPIN & syncs route dues: 5: Collection Agent
      Accountant verifies opening cash in Day Book: 5: Accountant
    section Doorstep Rounds (10:00 AM - 4:30 PM)
      Agent visits customer, collects ₹7,900 cash: 5: Collection Agent
      Customer receives Tamil SMS/WhatsApp receipt: 5: Customer
      Customer pays online via Google Pay UPI: 4: Customer
    section Monthly Auction (5:00 PM - 5:45 PM)
      Foreman verifies no unpaid bidders can participate: 5: Super Admin
      Members bid to 1/4 ceiling; paper token draw held: 5: Super Admin, Customer
      Partner A records winner (Maker); Partner B commits (Checker): 5: Super Admin
    section Evening Cash Handover (5:45 PM - 6:30 PM)
      Agent submits ₹45,000 physical cash handover batch: 5: Collection Agent
      Accountant counts cash & acknowledges receipt: 5: Accountant
      Day Book & Cash Book balance to zero rupee difference: 5: Accountant, Super Admin
    section Quarterly Audit
      Auditor inspects ledger Form XXI & forensic logs: 5: Auditor
```

---

## 4. Comprehensive User Stories by Module

### Module 1: Authentication & Staff Identity

#### US-1.1: Web Login with Microsoft Authenticator 2FA
- **As a**: Super Admin (Partner), Branch Manager, or Accountant
- **I want to**: Log into the Web Portal using my Phone/Email, Password, and a 6-digit Microsoft Authenticator rotating code
- **So that**: Office financial operations are protected by enterprise-grade multi-factor security.
- **Acceptance Criteria**:
  - **Given** I enter valid credentials on `/auth/web/login`,
  - **When** 2FA is active on my account,
  - **Then** the system returns `requireTotp: true` and issues a 5-minute temporary token.
  - **When** I submit the current rotating code to `/auth/web/verify-totp`,
  - **Then** the system validates the code against RFC 6238 TOTP specifications, returns a 15-minute JWT Access Token and 7-day Refresh Token, and logs my IP and timestamp.
  - **Error Case**: Entering an expired or incorrect code rejects the login with `401 Unauthorized` and increments failed attempt counter.

#### US-1.2: Mobile App Quick Unlock via 6-Digit MPIN
- **As a**: Field Collection Agent or Customer
- **I want to**: Unlock my mobile app in 1 second using a 6-digit secret MPIN
- **So that**: I can collect cash or view passbooks immediately without waiting for SMS OTPs in low-network areas.
- **Acceptance Criteria**:
  - **Given** I have registered my device and configured an MPIN,
  - **When** I open the app and enter my 6-digit MPIN,
  - **Then** the app sends `phone` and `mpin` to `/auth/mobile/login-mpin`, validates the bcrypt hash, and logs me in.
  - **Error Case**: 3 incorrect MPIN attempts temporarily locks the app for 15 minutes.

---

### Module 2: Branch & Multi-Role Staff Identity

#### US-2.1: Multi-Role Assignment (Agent Wearing Accountant Hat)
- **As a**: Super Admin (Partner)
- **I want to**: Assign multiple roles to a single staff member (e.g., `[COLLECTION_AGENT, ACCOUNTANT]`)
- **So that**: Our operational reality of field staff assisting with office day books is cleanly supported without creating separate duplicate accounts.
- **Acceptance Criteria**:
  - **Given** I am editing a staff user profile on the Web Portal,
  - **When** I select both "Collection Agent" and "Accountant" checkboxes,
  - **Then** the database updates `roles: Role[]` array, allowing the user to access both the mobile collection screens and the web day book balancing screens.

---

### Module 3: Customer Management & KYC

#### US-3.1: Bilingual Customer Profile Creation
- **As a**: Branch Manager or Partner (Super Admin)
- **I want to**: Register a new customer with auto-generated code (`KC-CUST-XXXXX`) and bilingual names (English + தமிழ்)
- **So that**: Printed and digital receipts display their name accurately in their native language.
- **Acceptance Criteria**:
  - **Given** I am on the Customer Intake screen,
  - **When** I enter "Sundaram S" (English) and "சுந்தரம் சு" (Tamil) with phone and address,
  - **Then** the system saves the profile and generates a unique sequence code (e.g., `KC-CUST-00101`).

#### US-3.2: Masked Aadhaar Storage for Data Minimization
- **As a**: Desk Accountant or Branch Manager
- **I want to**: Store only the masked last 4 digits of a customer's Aadhaar card (e.g., `XXXXXXXX1234`)
- **So that**: Kumaran Finance complies strictly with Indian data protection safeguards without storing full 12-digit Aadhaar numbers.
- **Acceptance Criteria**:
  - **Given** a customer submits their Aadhaar photocopy,
  - **When** staff records the KYC details,
  - **Then** the software only accepts and stores 4 digits in `aadhaarLast4` and marks `isKycVerified: true` upon document review.

#### US-3.3: Nominee Designation
- **As a**: Customer (Subscriber) or Staff
- **I want to**: Link a verified nominee with relationship, phone, and signature
- **So that**: Prize settlement agreements and emergency claims can be honored transparently.

---

### Module 4: Chit Scheme Management & Physical Notebook Intake

#### US-4.1: Fresh Chit Scheme Creation with 4% Commission Freeze
- **As a**: Super Admin (Partner)
- **I want to**: Define a new chit group (Value $V$, Duration $N$, Tickets $N$) with auto-locked 4.00% foreman commission
- **So that**: The scheme parameters are permanently frozen against accidental mid-cycle alterations.
- **Acceptance Criteria**:
  - **Given** Chit Value = ₹1,00,000 and Duration = 20 months,
  - **When** I activate the group,
  - **Then** the system permanently freezes `foremanCommissionPercent = 4.00`, sets base installment $I_{base} = \text{₹}5,000$, and sets the maximum discount ceiling strictly to $D_{max} = \frac{V}{4} = \text{₹}25,000$.

#### US-4.2: Mid-Cycle Intake from Physical Paper Notebooks
- **As a**: Desk Accountant or Partner A (Maker)
- **I want to**: Transcribe an ongoing chit group currently at Month 7 from our physical notebook into the digital intake wizard
- **So that**: Historical winners, past dividends, and member payment records transition seamlessly into the software.
- **Acceptance Criteria**:
  - **Given** an ongoing paper notebook group,
  - **When** Maker enters past auction winners (Months 1 to 6) and marks each member's monthly grid strictly as `PAID` or `UNPAID` (zero partial payments),
  - **Then** the Pre-Activation Balancing Guard computes total collected rupees and displays a confirmation screen.
  - **When** Partner B (Checker) reviews the physical notebook against the screen and clicks "Approve & Activate",
  - **Then** the system activates the scheme, generates Month 7 dues, and enforces `maker != checker`.

#### US-4.3: Month 1 & Month $N$ Non-Auction Rules
- **As a**: Super Admin (Partner)
- **I want to**: Ensure the system executes Month 1 and Month $N$ without opening an auction
- **So that**: Company first-month rights and final-month subscriber settlement follow exact company policy.
- **Acceptance Criteria**:
  - **Month 1**: Company customer ticket takes full pool ₹1,00,000; auction status is marked `COMPANY_TAKEN`; dividend is ₹0.
  - **Month $N$**: Software settles the full prize directly to the last subscriber after deducting 4% commission and final installment; zero auction is conducted.

---

### Module 5: Subscriber Enrollment & Ticket Limits

#### US-5.1: Enforcement of 1 Ticket per Customer per Group
- **As a**: Branch Manager or Partner
- **I want to**: Prevent any customer from holding 2 or more tickets in the same chit group
- **So that**: Risk is diversified and company policy (ADR-13) is strictly enforced.
- **Acceptance Criteria**:
  - **Given** Customer `KC-CUST-00101` already holds Ticket #4 in Group `KCA-1L-20M-01`,
  - **When** staff attempts to allocate Ticket #9 in the same group to the same customer,
  - **Then** the system rejects the allocation with `400 Bad Request: Customer already holds a ticket in this chit group` (`@@unique([chitGroupId, customerId])`).

#### US-5.2: 3-Month Consecutive Arrears Company Removal Rights
- **As a**: Super Admin (Partner)
- **I want to**: Identify subscribers who have failed to pay installments for 3 consecutive months and execute company removal rights
- **So that**: Defaulters do not stall the chit group pool.
- **Acceptance Criteria**:
  - **Given** a ticket has `UNPAID` dues across 3 continuous months,
  - **When** Partner reviews the Defaulter Alert list,
  - **Then** the software enables the "Execute 3-Month Default Removal" button, moving the ticket to `REMOVED_DEF_3M` and opening a substitution slot.

---

### Module 6: Installments & Dividend Math

#### US-6.1: Universal Equal Dividend Allocation
- **As a**: Customer (Prized or Non-Prized) or Staff
- **I want to**: Have auction dividends deducted equally across all members in the group, including the auction winner
- **So that**: Every subscriber pays the discounted net installment next month.
- **Acceptance Criteria**:
  - **Given** Chit Value = ₹1,00,000, 20 members, Base Installment = ₹5,000,
  - **When** Month 3 auction winning discount is ₹25,000,
  - **Then** Foreman Commission (4%) = ₹4,000; Distributable Dividend Pool = ₹21,000;
  - **Then** Dividend per ticket = $\text{₹}21,000 / 20 = \text{₹}1,050$;
  - **Then** Next month net payable for **EVERY member (including winner)** is $I_{net} = \text{₹}5,000 - \text{₹}1,050 = \text{₹}3,950$ in whole integer Rupees.

#### US-6.2: Single Discrete Payment Enforcement
- **As a**: Field Agent or Accountant
- **I want to**: Record strictly one single payment matching the full net installment due for that month
- **So that**: The database never holds partial payments, double payments, or messy advance balances.
- **Acceptance Criteria**:
  - **Given** net installment due is ₹3,950,
  - **When** agent attempts to enter ₹2,000 (partial) or ₹5,000 (advance),
  - **Then** the system rejects the transaction with `400 Bad Request: Payment must exactly match the net installment due of ₹3,950`.

---

### Module 7: Field Collections & Cash Handover

#### US-7.1: Doorstep Collection & Customer Notebook Signature
- **As a**: Field Collection Agent
- **I want to**: Search a customer by code/name, tap "Record Cash", sign their physical notebook, and issue a digital receipt in under 30 seconds
- **So that**: Field collection rounds are fast, error-free, and follow the traditional customer notebook process.
- **Acceptance Criteria**:
  - **Given** I am at the customer's house with the mobile app and customer's physical passbook,
  - **When** I tap "Record Collection" $\to$ "Cash ₹3,950",
  - **Then** the app saves the payment, triggers an automated WhatsApp / SMS receipt link to the customer, and the agent enters the payment date, amount, and signature directly into the customer's physical notebook.

#### US-7.2: Offline Collection in Remote Rural Areas
- **As a**: Field Collection Agent
- **I want to**: Record collections when there is zero mobile cellular coverage in agricultural areas
- **So that**: I can continue my rounds without network interruptions.
- **Acceptance Criteria**:
  - **Given** phone is in airplane mode / no signal,
  - **When** I record a collection,
  - **Then** the app stores it locally with an immutable timestamp and UUID idempotency key, generating the offline receipt record;
  - **When** cellular connection is restored,
  - **Then** the app automatically pushes the batch to the office server with zero duplicate entries.

#### US-7.3: Evening Cash Handover with Dual-Control Guard
- **As a**: Field Collection Agent (Maker) and Desk Accountant (Checker)
- **I want to**: Submit and acknowledge end-of-day cash collections at the office desk
- **So that**: Physical cash handed over matches the software total with zero shortages.
- **Acceptance Criteria**:
  - **Given** Field Agent collected ₹45,000 across 12 customers,
  - **When** Agent submits the handover batch,
  - **Then** Desk Accountant counts the physical notes, verifies the denomination breakdown, and clicks "Acknowledge Handover",
  - **Then** the software strictly enforces `collector_user_id != acknowledger_user_id` (an agent cannot acknowledge their own cash handover).

---

### Module 8: In-Office Offline Auctions & Tie-Breakers

#### US-8.1: Pre-Auction Unpaid Bidder Blocking
- **As a**: Foreman / Super Admin (Partner)
- **I want to**: Automatically block any subscriber with unpaid current dues from participating or bidding in the auction
- **So that**: Defaulters cannot win chit prize pools.
- **Acceptance Criteria**:
  - **Given** Ticket #11 has not paid this month's installment,
  - **When** staff opens the Auction Bidding screen,
  - **Then** Ticket #11 is visibly greyed out and marked "Ineligible: Unpaid Dues". Selecting Ticket #11 is hard-blocked.

#### US-8.2: Maximum 1/4 (25%) Discount Ceiling Validation
- **As a**: Foreman / Super Admin (Partner)
- **I want to**: Ensure no entered bid discount exceeds 25% of the total chit value
- **So that**: Subscribers are protected from predatory discounts and company rules are respected.
- **Acceptance Criteria**:
  - **Given** Chit Value = ₹1,00,000 (Ceiling = ₹25,000),
  - **When** staff enters a bid discount of ₹26,000,
  - **Then** the system rejects it with `400 Bad Request: Bid discount ₹26,000 exceeds maximum allowable 1/4 ceiling of ₹25,000`.

#### US-8.3: Option A (Physical Paper Token Tie-Break Draw)
- **As a**: Attending Subscriber and Foreman
- **I want to**: Resolve multiple ceiling bids via a physical paper token draw at the branch
- **So that**: Tie-breaks are completely transparent and members see the winning token drawn with their own eyes.
- **Acceptance Criteria**:
  - **Given** 3 members all bid the maximum ceiling of ₹25,000,
  - **When** the Foreman writes the 3 ticket numbers on paper tokens and draws one in front of members,
  - **Then** staff clicks "Record Tie-Break Draw" in the software, enters the drawn winning ticket number, and records the witness member names. Zero autonomous software lotteries are used.

#### US-8.4: Dual Control Auction Finalization
- **As a**: Partner A (Maker) and Partner B (Checker)
- **I want to**: Enforce Maker-Checker dual control on auction commitment
- **So that**: No single partner can unilaterally finalize an auction result.
- **Acceptance Criteria**:
  - **Given** Partner A entered the winning bid (Maker),
  - **When** Partner A attempts to finalize the auction, the system blocks the action;
  - **When** Partner B logs in, reviews the entered discount, and clicks "Commit Auction",
  - **Then** the software commits the result, updates next month's dues, and logs `maker_user_id != checker_user_id`.

---

### Module 9: Prize Disbursement & Company Safety Proof Checklist

#### US-9.1: Flexible Company Safety Proof Checklist (ADR-15)
- **As a**: Desk Accountant or Partner A (Maker)
- **I want to**: Complete a flexible checklist (signed winner agreement, nominee signature, blank cheques, promissory notes) before releasing prize money
- **So that**: Company safety is verified without demanding property documents or mandatory collateral.
- **Acceptance Criteria**:
  - **Given** a prized subscriber claims their prize pool,
  - **When** staff reviews documents,
  - **Then** staff ticks the on-demand items: Agreement [Yes], Nominee [Yes], Cheque details [Yes], and uploads scanned PDFs;
  - **Then** property documents are completely omitted.

#### US-9.2: Checker Payout Authorization
- **As a**: Super Admin / Partner B (Checker)
- **I want to**: Authorize the prize payout voucher after reviewing the safety proof checklist
- **So that**: Funds are disbursed with strict dual oversight.
- **Acceptance Criteria**:
  - **Given** Maker submitted the disbursement voucher,
  - **When** Checker approves,
  - **Then** the voucher status transitions to `DISBURSED`, a bilingual payout receipt is generated, and `maker != checker` is enforced.

---

### Module 10: Accounting, Reports & Audit Trails

#### US-10.1: Evening Day Book & Cash Book Balancing
- **As a**: Desk Accountant and Partner
- **I want to**: View real-time Day Book and Cash Book reports where every rupee is accounted for
- **So that**: Daily branch closing balances to zero rupee difference every single evening.
- **Acceptance Criteria**:
  - **Given** opening cash, field agent collections, branch counter collections, and petty cash expenses,
  - **When** Accountant views the Day Book,
  - **Then** Closing Cash = Opening Cash + Total Receipts - Total Payments, matching physical cash in the branch safe to the exact rupee.

#### US-10.2: Read-Only Audit & Forensic Inspection
- **As a**: Independent Chartered Accountant / Auditor
- **I want to**: Inspect the append-only `AuditLog` table with filter by user, entity, and date range
- **So that**: Any transaction modification, payment reversal, or sensitive approval can be independently audited with before-and-after snapshots.
- **Acceptance Criteria**:
  - **Given** I am logged in with the `AUDITOR` role,
  - **When** I view audit logs,
  - **Then** I have full read-only visibility into actor ID, IP address, timestamp, old value, and new value, with zero ability to edit or delete any record.

---

## 5. Verification & Zero-Compromise Checklist

Every developer, pair programmer, and coding assistant must verify features against these 6 persona rules before writing code:

- [ ] **Super Admin Rule**: High-risk financial actions (auction finalize, reversals, payouts) enforce `maker != checker`.
- [ ] **Accountant Rule**: Cash handover requires `collector != acknowledger`.
- [ ] **Field Agent Rule**: Doorstep collection enforces single discrete payment ($I_{net}$) with zero partial payments and zero advance balances.
- [ ] **Customer Rule**: Universal dividend is credited equally to ALL members including auction winner.
- [ ] **Auditor Rule**: Full read-only access to statutory ledgers with zero mutation privileges.
- [ ] **Whole Rupee Rule**: All monetary values across all screens and stories use 64-bit integer Rupees (`BigInt`).
