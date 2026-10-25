# Kumaran Chits — Branch Manager Operations Manual

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance** (Head Office: Perundurai, Erode, Tamil Nadu)  
> **Target Persona**: **Branch Manager / Operational Lead (`BRANCH_MANAGER`)**  
> **Primary Platform**: **Web Portal (`apps/web/`)** (Branch-Scoped Workspace)  
> **Operating Reality**: In current operations at Kumaran Finance, the 4 Partners directly execute Branch Manager duties. However, the system enforces this role as a distinct, branch-scoped persona to govern branch-level operations and future branch expansions.  
> **Core Role in Governance**: Operational Maker for branch auctions and customer intake; Checker for field agent cash handovers.

---

## 1. Operating Reality & Facility Leadership

The **Branch Manager** is the operational captain of a physical facility (e.g., Head Office - Perundurai, code `PRD`):
- Supervising branch staff: the Desk Accountant and the 2 to 3 Field Collection Agents.
- Leading local customer onboarding and verifying lightweight KYC records.
- Conducting the **monthly in-person chit auctions** at the branch counter in the presence of attending subscribers.
- Supervising the cash desk, counting evening cash handovers from field agents, and ensuring the branch vault balances to the last rupee.

```mermaid
flowchart TD
    subgraph BRANCH_SCOPE ["Branch Office Boundary (PRD - Perundurai)"]
        BM["Branch Manager\n(Facility Operational Lead)"]
        BM --> S1["1. Customer Intake & Ticket Allocation\n(Enforces single ticket per customer)"]
        BM --> S2["2. Field Agent Dispatch & Route Supervision\n(Supervises 2-3 motorcyclist collectors)"]
        BM --> S3["3. Conducting Monthly Branch Auction\n(Enforces 1/4 ceiling & Option A lot draw)"]
        BM --> S4["4. Evening Cash Handover Sign-Off\n(Acts as Checker: transfers cash into vault)"]
        BM --> S5["5. Form XVII Statutory Minutes Filing\n(Signs & marks filed with Chit Registrar)"]
    end
```

### Strict Branch Scoping & Anti-BOLA Security (OWASP Top 10):
To prevent cross-branch data leaks, the Kumaran Chits platform enforces strict **Branch Scoping (`user.branchId === item.branchId`)**:
- A Branch Manager assigned to Perundurai (`PRD`) can **only** access subscribers, tickets, collections, and cash books belonging to Perundurai.
- If a manager attempts to open a document or voucher from a different branch, the backend's security guard immediately blocks the request with `HTTP 403 Forbidden`.

---

## 2. Daily Workflow Index & Action Diagrams

| Section | Operational Action | Role / Dual-Control | Primary Interface |
|---|---|:---:|:---:|
| **§3** | Morning Branch Facility Opening & Route Dispatch | Single Actor | Physical Desk & Web Portal |
| **§4** | Branch Customer Intake & KYC Verification | Single Actor | Web Portal (`POST /customers`) |
| **§5** | Ticket Allocation (Single-Ticket Limit Constraint) | Single Actor | Web Portal (`POST /chits/:id/tickets/assign`) |
| **§6** | Conducting In-Office Monthly Auctions (Maker Role) | Maker Role | Web Portal (`POST /auctions/:id/record-bid`) |
| **§7** | Evening Cash Handover Sign-Off into Branch Vault | Checker Role | Web Portal (`POST /collections/.../acknowledge`) |
| **§8** | Verifying Prize Winner Safety Proof Checklist | Maker Role | Web Portal (`POST /disbursements/...`) |
| **§9** | Statutory Form XVII Minutes Signing & Registrar Filing | Operational Lead | Web Portal (`PATCH /auctions/.../mark-filed...`) |
| **§10** | Branch Form XXII Cash Book & Vault Count | Daily Closing | Web Portal (`GET /reports/form-xxii`) |

---

## 3. Morning Branch Facility Opening & Route Dispatch

```mermaid
flowchart TD
    Arrive["8:15 AM: Arrive at Branch Office"] --> Disarm["Unlock physical security shutters & disarm office alarm"]
    Disarm --> Login["Log into Web Portal using 2FA TOTP"]
    Login --> SafeCheck["Verify physical Safe Vault seal alongside Cashier"]
    SafeCheck --> Dispatch["8:45 AM: Morning Field Agent Briefing:\n• Check agent mobile battery & app route sync\n• Review high-arrears customers on route\n• Dispatch agents onto motorcycle routes"]
    Dispatch --> OpenDoors["9:00 AM: Open customer doors for walk-in business"]
```

### Step-by-Step Instructions:
1. Arrive at the branch at 8:15 AM. Unlock physical facility doors and disable security alarms.
2. Log into the Web Portal with your 10-digit mobile number, password, and Microsoft Authenticator TOTP.
3. Open the safe vault with the Desk Accountant and verify the opening cash balance against yesterday's Form XXII register.
4. Conduct the 15-minute morning briefing with field collection agents:
   - Ensure all agents have synchronized their routes on the branch Wi-Fi.
   - Review high-priority defaulter visits and route plans.
5. Dispatch agents onto their motorcycle routes and open customer service counters at 9:00 AM.

---

## 4. Branch Customer Intake & KYC Verification

```mermaid
flowchart TD
    WalkIn["Prospective subscriber arrives at branch"] --> OpenIntake["Navigate: Customers -> 'Register New Customer'"]
    OpenIntake --> FillDetails["Enter Minimal Village Intake Details:\n• Full Name in English: K. Senthilkumar\n• Full Name in Tamil: கே. செந்தில்குமார்\n• Mobile Number: 9842100055\n• Residential Address & Village: Perundurai Rural\n• Nominee Name & Relationship: S. Kavitha (Wife)"]
    FillDetails --> KYC["Optional Lightweight KYC:\n• Masked Aadhaar: Last 4 digits (XXXXXXXX4582)\n• Upload photo of ID card to encrypted S3"]
    KYC --> Submit["Click 'Save Customer' (POST /customers)\nCustomer profile created within branch scope (PRD)"]
```

### Step-by-Step Instructions:
1. Go to **Customers $\to$ "Register New Customer"** on the Web Portal.
2. In keeping with our rural village operating context, enter minimal customer details:
   - Full Name in English and தமிழ்.
   - 10-Digit Mobile Phone Number.
   - Residential Address and Village landmark.
   - Nominee Full Name and Relationship.
3. **Lightweight KYC Scans**:
   - Enter strictly the masked last 4 digits of Aadhaar (`XXXXXXXX1234`) or PAN to comply with DPDP Act regulations.
   - Capture a photo of the ID document using the webcam or file upload.
4. Click **"Save Customer"** (`POST /customers`). The customer profile is immediately registered within the `PRD` branch scope.

---

## 5. Ticket Allocation (Single-Ticket Limit Constraint)

```mermaid
flowchart TD
    SelectScheme["Open Chit Group: KCA-1L-20M-01 (Month 1 Draft)"] --> Assign["Select Customer: K. Senthilkumar"]
    Assign --> CheckExisting{"Ticket Limit Constraint Check:\nDoes Senthilkumar already hold a ticket\nin this exact chit group?"}
    CheckExisting -- "Yes (Already has Ticket #3)" --> Block["BLOCKED by Database Guard!\n@@unique([chitGroupId, customerId])\nError: Customer cannot hold 2+ tickets in same group"]
    CheckExisting -- "No (Holds 0 tickets in this group)" --> Allow["System Allocates Ticket #8\nGenerates Enrollment Confirmation & Passbook"]
```

### Step-by-Step Instructions:
1. Open the draft chit scheme under **Chit Schemes $\to$ Ticket Management**.
2. Select an unallocated ticket (e.g., `Ticket #8`).
3. Search and select the customer to assign.
4. **The Ticket Limit Constraint Guard (`CONFIRMED-BY-DEVELOPER`)**:
   - A customer can join multiple different chit schemes.
   - However, **a customer can NEVER hold 2 or more tickets in the same chit scheme**.
   - If you attempt to assign a second ticket to an existing subscriber in the same group, the backend rejects it with `HTTP 409 Conflict: Customer already holds a ticket in this scheme`.
5. Confirm ticket allocation (`POST /chits/:id/tickets/assign`).

---

## 6. Conducting In-Office Monthly Auctions (Maker Role)

```mermaid
flowchart TD
    AuctionTime["15th of the Month, 4:00 PM: In-Office Auction Commences"] --> OpenScreen["Open: Auctions -> Current Month Auction"]
    OpenScreen --> EligibilityCheck["Review Attendee List:\nSystem disables Murugesan (Ticket #14) due to UNPAID Month Due"]
    EligibilityCheck --> Shouting["Subscribers shout bid discounts aloud:\n₹15,000... ₹20,000... ₹25,000 (Ceiling)"]
    Shouting --> CeilingCheck{"Does Bid Exceed 1/4 Ceiling\n(D > ₹25,000)?"}
    CeilingCheck -- Yes --> Reject["Reject Bid! Maximum legal discount is ₹25,000"]
    CeilingCheck -- No --> TieCheck{"Did 2+ Members Bid Ceiling?"}
    TieCheck -- Yes --> Draw["Physical Token Tie-Break (Option A):\n1. Place competing tokens in lot bowl\n2. Child draws Token #5 in front of members\n3. Click 'Record Tie-Breaker Draw'"]
    TieCheck -- No --> Single["Winning Bid Identified"]
    Draw --> EnterResult["Branch Manager enters Ticket #5 & Discount ₹25,000 (Maker)\nClicks 'Submit Auction Result' (POST /auctions/:id/record-bid)"]
    Single --> EnterResult
    EnterResult --> AwaitingChecker["Status = PENDING_VERIFICATION\nQueued for Partner B Finalization"]
```

### Step-by-Step Instructions:
1. Gather participating subscribers in the branch auction room at 4:00 PM.
2. Open **Auctions $\to$ Active Auctions** on the branch PC.
3. Verify attendee eligibility: any member with unpaid dues for the month is automatically disabled from bidding.
4. Oversee the bidding:
   - Ensure bids do not exceed the **one-fourth (1/4) ceiling** ($D \le \text{₹}25,000$).
   - If multiple members bid the ceiling, conduct the **Option A Physical Paper Token Draw** live in the room.
5. In the portal, select the winning ticket number, enter the winning bid discount, and click **"Submit Auction Result"** (`POST /auctions/:id/record-bid`).
6. The result enters `PENDING_VERIFICATION` status, ready for Partner Checker finalization.

---

## 7. Evening Cash Handover Sign-Off into Branch Vault (Checker Role)

```mermaid
flowchart TD
    AgentReturn["5:00 PM: Field Agent Murugan returns with cash bag"] --> OpenHandover["Open: Collections -> Pending Handovers -> Agent Murugan"]
    OpenHandover --> MachineCount["Physically count notes on desktop note-sorting machine:\n42 x ₹1,000 + 1 x ₹500 = ₹42,500"]
    MachineCount --> MatchCheck{"Does physical note count match\nAgent Mobile Batch Total?"}
    MatchCheck -- "Mismatch" --> Shortage["Record discrepancy on system voucher"]
    MatchCheck -- "Exact Match" --> DualRoleGuard{"Anti-Self-Acknowledgment Check:\nDid Branch Manager collect this cash?"}
    DualRoleGuard -- "Yes" --> Block["BLOCKED! Must be acknowledged by an independent Partner"]
    DualRoleGuard -- "No" --> Acknowledge["Click 'Acknowledge Cash Handover' (POST /collections/.../acknowledge)\n• Cash deposited into Branch Safe Vault\n• Agent Cash-in-Hand liability cleared to ₹0\n• Prints Handover Slip #HO-YYYY-XXXXX"]
```

### Step-by-Step Instructions:
1. At 5:00 PM, receive the physical cash bag from the field collection agent.
2. Place the currency notes into the counter sorting machine to verify the exact count.
3. Open **Collections $\to$ Pending Handovers** on the Web Portal.
4. Verify that the physical count matches the submitted mobile batch total.
5. **The Anti-Self-Acknowledgment Guard**: Ensure that you are not acknowledging cash collected under your own user profile (`collector_user_id != acknowledger_user_id`).
6. Click **"Acknowledge Cash Handover"** (`POST /collections/cash-handover/acknowledge`).
   - The money is officially transferred into the **Branch Safe Vault**.
   - The field agent's liability is cleared to `₹0`.
   - Issue the printed Handover Clearance Slip to the agent.

---

## 8. Verifying Prize Winner Safety Proof Checklist (Maker Role)

```mermaid
flowchart TD
    Winner["Prize Winner Kandasamy visits branch to claim prize"] --> OpenDisb["Open: Disbursements -> Pending Verification -> Ticket #5"]
    OpenDisb --> CheckDocs["Inspect Physical Documents Submitted by Winner:\n• Winner agreement signed with nominee?\n• Blank bank cheques collected with account details?\n• Promissory note / personal guarantee signed?"]
    CheckDocs --> Scan["Scan signed papers & cheques using office scanner"]
    Scan --> FillChecklist["Fill Safety Proof Checklist on screen & upload scans"]
    FillChecklist --> SubmitVoucher["Click 'Submit Payout Voucher' (Maker)\nStatus = VERIFIED_BY_MAKER\nQueued for Partner B Authorization"]
```

### Step-by-Step Instructions:
1. Open **Disbursements $\to$ Pending Verification $\to$ Ticket #5**.
2. Inspect the physical papers provided by the prized subscriber.
3. Complete the **Company Safety Proof Checklist**:
   - Check off each submitted item (agreement, nominee signature, blank cheques, promissory note).
   - Enter bank name and cheque numbers.
   - Upload scanned copies to encrypted S3 storage.
4. Select the requested payout mode (**Account Payee Cheque**, **NEFT/RTGS**, or **Cash**).
5. Click **"Submit Payout Voucher"** (`POST /disbursements/auction/:id/verify-safety-proof`). Status transitions to `VERIFIED_BY_MAKER`.

---

## 9. Statutory Form XVII Minutes Signing & Registrar Filing

```mermaid
flowchart TD
    Finalized["Partner Finalizes Auction:\nStatus = FINALIZED"] --> PrintMinutes["Click 'Download Form XVII Statutory Minutes PDF'"]
    PrintMinutes --> PhysicalSign["Print 2 copies on bond paper:\n• Foreman / Branch Manager signs\n• Attending subscribers sign physical sheet"]
    PhysicalSign --> Registrar["Courier / Hand-deliver signed copy to Chit Registrar Office"]
    Registrar --> AckSlip["Receive Chit Registrar Filing Acknowledgment Slip"]
    AckSlip --> MarkFiled["In Web Portal: Auctions -> Group KCA-1L -> Month 4\nEnter Registrar Filing Ref & Date\nClick 'Mark Filed with Registrar' (PATCH /auctions/:id/mark-filed...)"]
```

### Step-by-Step Instructions:
1. Once Partner B finalizes the auction, navigate to **Auctions $\to$ Auction Minutes**.
2. Click **"Download Form XVII Minutes PDF"**.
3. Print two copies on official paper.
4. Affix your branch manager signature and collect signatures from the attending subscribers.
5. Submit one signed original copy to the **Chit Registrar** (Government of Tamil Nadu) in compliance with the Chit Funds Act, 1982.
6. When the registrar issues the acknowledgment stamp, open the auction screen and click **"Mark Filed with Registrar"** (`PATCH /auctions/:auctionId/mark-filed-with-registrar`), entering the filing reference number and filing date.

---

## 10. Branch Form XXII Cash Book & Vault Count

```mermaid
flowchart TD
    CloseBranch["6:00 PM: Branch Closure"] --> OpenFormXXII["Open: Reports -> Form XXII Daily Cash Book"]
    OpenFormXXII --> CountSafe["Physically count cash inside Branch Safe Vault:\nBundles of ₹500, ₹200, ₹100, and ₹50 notes"]
    CountSafe --> Compare{"Does Safe Vault Cash match Form XXII\nClosing Balance to the exact rupee?"}
    Compare -- No --> Investigate["Investigate unposted counter vouchers or typos"]
    Compare -- Yes --> LockVault["Dual-key lock applied to Safe Vault\nPrint and file signed daily Form XXII sheet\nActivate facility night alarms"]
```

### Step-by-Step Instructions:
1. At 6:00 PM, initiate the formal branch closing procedure.
2. Open **Reports $\to$ Form XXII Daily Cash Book**.
3. Count all physical currency bundles inside the heavy branch safe vault.
4. Verify that the physical cash matches the system closing balance to the last rupee.
5. Print the Form XXII sheet, sign your initials alongside the Cashier and Partner, apply the dual-key lock to the vault, and set the night alarm.
