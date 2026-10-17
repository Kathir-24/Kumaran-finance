# Kumaran Chits — Role-Based Access Control (RBAC) & Permissions Matrix

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance**  
> **Status**: Working Specification (`CONFIRMED-BY-DEVELOPER`)  
> **Status Labels Used**: `CONFIRMED-BY-DEVELOPER`, `PROPOSED`, `OPEN`, `UNVERIFIED-LEGAL`  
> **Core Principle**: Least privilege, strict branch scoping, and mandatory separation of duties (maker-checker).

---

## 1. User Groups & Scoping (`CONFIRMED-BY-DEVELOPER`)

The software implements a standardized, industry-standard set of personas. Kumaran Finance currently operates with **4 equal partners** and **2 to 3 field collection agents** (`CONFIRMED-BY-DEVELOPER`). The partners allocate administrative and operational personas among themselves as per company needs, while the software strictly enforces separation of duties.

| Role | Scope | Description | Status |
|---|---|---|---|
| **Super Admin / Owner** | Global (Company-wide) | Partners / Proprietor. Full administrative, financial configuration, and final approval (Checker) authority. | `CONFIRMED-BY-DEVELOPER` |
| **Branch Manager** | Assigned Branch | Operational branch head. Manages member intake, ticket assignment, offline auction recording (Maker), and agent supervision. (1 branch operates today; schema supports multi-branch). | `CONFIRMED-BY-DEVELOPER` |
| **Accountant** | Company-wide | Financial recordkeeper. Verifies collections, bank reconciliations, day books, cash handovers, and prepares payment vouchers. (Simply "Accountant"; no "Head Office Accountant"). | `CONFIRMED-BY-DEVELOPER` |
| **Collection Agent** | Assigned Customers | Field staff (2–3 agents today) using mobile app for daily/monthly doorstep collections and issuing bilingual receipts. | `CONFIRMED-BY-DEVELOPER` |
| **Customer / Member** | Self Only | Subscribers viewing their personal digital passbook, dividends, upcoming dues, and making online UPI/card payments. | `CONFIRMED-BY-DEVELOPER` |
| **Auditor** | Read-Only (Global) | Independent chartered accountant / auditor viewing ledgers, auction minutes, and compliance reports without edit permissions. | `CONFIRMED-BY-DEVELOPER` |

---

## 2. Granular Permissions Matrix (`CONFIRMED-BY-DEVELOPER`)

| Functional Area | Action | Super Admin | Branch Manager | Accountant | Collection Agent | Customer | Auditor | Status |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Company & Branch** | Manage Settings & Defaults | Yes | No | No | No | No | Read-only | `CONFIRMED-BY-DEVELOPER` |
| **Users & Roles** | Create / Deactivate Staff | Yes | No | No | No | No | Read-only | `CONFIRMED-BY-DEVELOPER` |
| **Password / Login** | Reset Staff Credentials | Yes | No | No | No | Self (OTP/MPIN)| No | `CONFIRMED-BY-DEVELOPER` |
| **Customer Management**| View Customers | All | Branch scope | All | Assigned only | Own profile only| Read-only | `CONFIRMED-BY-DEVELOPER` |
| | Create / Edit Customer Profile | Yes | Yes (Branch) | Limited intake| Lead intake only| Update request | No | `CONFIRMED-BY-DEVELOPER` |
| | View KYC / Surety Documents | All | Branch scope | Verification | No | Own docs only | Read-only | `CONFIRMED-BY-DEVELOPER` |
| | Verify Customer KYC Documents | Yes | Yes (Branch) | Yes | No | No | Read-only | `CONFIRMED-BY-DEVELOPER` |
| **Chit Schemes** | Create Scheme Draft / Template | Yes | Review only | Review only | No | No | Read-only | `CONFIRMED-BY-DEVELOPER` |
| | Activate Chit Scheme | Yes | No | No | No | No | Read-only | `CONFIRMED-BY-DEVELOPER` |
| **Enrollment & Tickets**| Assign Ticket to Subscriber | Yes | Yes (Branch) | No | No | Request only | Read-only | `CONFIRMED-BY-DEVELOPER` |
| **Collections** | Record Field Cash Collection | Yes | Yes (Branch) | Yes | Assigned only | Online payment | Read-only | `CONFIRMED-BY-DEVELOPER` |
| | Submit Cash Handover | No | No | No | Yes (Assigned) | No | No | `CONFIRMED-BY-DEVELOPER` |
| | Acknowledge Cash Handover | Yes | Yes (Branch) | Yes | No | No | Read-only | `CONFIRMED-BY-DEVELOPER` |
| **Payment Adjustments**| Request Payment Reversal (Maker)| No | Yes (Branch) | Yes | No | No | No | `CONFIRMED-BY-DEVELOPER` |
| | Approve Payment Reversal (Checker)| Yes | No | No | No | No | Read-only | `CONFIRMED-BY-DEVELOPER` |
| **Offline Auctions** | Record Auction Result (Maker) | No | Yes (Branch) | No | No | View result | Read-only | `CONFIRMED-BY-DEVELOPER` |
| | Finalize Auction Result (Checker)| Yes | Authorized checker | No | No | No | Read-only | `CONFIRMED-BY-DEVELOPER` |
| **Prize Disbursement** | Verify Surety Checklist & Voucher (Maker)| No | Yes (Branch) | Yes (Voucher prep)| No | View status | Read-only | `CONFIRMED-BY-DEVELOPER` |
| | Authorize Prize Payout (Checker)| Yes | No | No | No | No | Read-only | `CONFIRMED-BY-DEVELOPER` |
| **Reports & Auditing** | View Financial Reports & Day Books| Global | Branch scope | Global | No | Own passbook | Read-only | `CONFIRMED-BY-DEVELOPER` |
| | Export Reports / Ledgers | Yes | Branch scope | Global | No | Own statement | Read-only | `CONFIRMED-BY-DEVELOPER` |
| | View Immutable Audit Logs | Global | Branch scope | Read-only | No | Own history | Read-only | `CONFIRMED-BY-DEVELOPER` |

---

## 3. Mandatory Maker-Checker Controls (`CONFIRMED-BY-DEVELOPER`)

To prevent accounting errors, unauthorized modifications, and internal fraud, high-risk financial actions require **strict Maker-Checker separation of duties**:

### Fundamental Architectural Rule:
> **The Maker and Checker must always be different individual user accounts (`CONFIRMED-BY-DEVELOPER`).**  
> Under no circumstances may the user who initiates or records an action approve or finalize it. The application and database strictly reject any transaction where `maker_user_id == checker_user_id`, regardless of the user's role or partner status.

### 1. Payment Reversals & Adjustments:
- **Maker**: Branch Manager or Accountant initiates a reversal request with a mandatory documented justification.
- **Checker**: Super Admin (Partner) verifies the justification and approves the ledger adjustment.
- **Rule**: `Maker != Checker`.

### 2. Offline Auction Recording vs. Finalization:
- **Maker (Record Result)**: Staff member or Branch Manager who attended the physical auction enters the winning ticket, bid discount, and attendee list.
- **Checker (Finalize Result)**: Super Admin / designated approver reviews the entered bid against ceiling rules and commits the auction outcome.
- **Rule**: `Maker != Checker`.

### 3. Prize Money Disbursement:
- **Maker (Verify & Submit)**: Branch Manager or Accountant verifies the physical surety checklist (property docs [Yes/No], winner agreement [Yes/No], nominee signed [Yes/No], scanned uploads) and prepares the payout voucher.
- **Checker (Authorize Payout)**: Super Admin (Partner) authorizes payment release via Cheque, NEFT/RTGS/IMPS, or Cash.
- **Rule**: `Maker != Checker`.

### 4. Audit Log Integrity:
- Every high-risk modification, reversal, auction finalization, and payout approval is recorded in an **append-only, immutable audit log** (`CONFIRMED-BY-DEVELOPER`).

---

## 4. Operating Reality & Persona Mapping (`CONFIRMED-BY-DEVELOPER`)

1. **Current Team Structure**:
   - Kumaran Finance operates with **4 equal partners** and **2 to 3 field collection agents**.
   - Current business operations run from **1 physical branch office**.
2. **Persona Mapping Policy**:
   - The software maintains clean, separate personas (`Super Admin`, `Branch Manager`, `Accountant`, `Collection Agent`, `Customer`, `Auditor`).
   - The 4 partners decide which personas they each assume in the system.
   - For example:
     - All 4 partners may have Super Admin accounts for business oversight.
     - Specific partners can hold operational Branch Manager or Accountant permissions when entering daily records.
3. **Automated Enforcement**:
   - Even if multiple partners hold Super Admin privileges, the **Maker $\ne$ Checker** software constraint prevents any partner who enters an auction result or payout voucher from self-approving their own entry. Another partner must perform the checker approval.
4. **Role Naming**:
   - The role is confirmed as simply **"Accountant"**. The legacy term "Head Office Accountant" is completely retired.
