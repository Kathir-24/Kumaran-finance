# Kumaran Chits — Standard Operating Procedures (SOP)

> **Product**: **Kumaran Chits** (Kumaran Finance)  
> **Scope**: Field Collection Operations, Cash Handover, Payment Reversals, and Defaulter Recovery

---

## 1. Daily Field Collection & Cash Handover SOP

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Subscriber
    actor Agent as Field Collection Agent
    actor Cashier as Branch Cashier / Accountant
    participant App as Android Mobile App
    participant Server as NestJS Backend

    Customer->>Agent: Pays Cash Installment (e.g., ₹3,700)
    Agent->>App: Records Collection (Ticket #, Amount, Method: CASH)
    App->>Server: POST /collections/record (with Idempotency-Key)
    Server-->>App: Issues Digital Bilingual Receipt (English + Tamil)
    App-->>Customer: Displays Receipt & sends SMS/WhatsApp link

    Note over Agent,Cashier: End of Day: Field Agent returns to Branch Office

    Agent->>Cashier: Submits physical cash + opens "Cash Handover" on App
    Cashier->>Cashier: Physically counts currency notes against App total
    alt Cash Matches Exactly
        Cashier->>Server: POST /collections/cash-handover/acknowledge
        Server-->>Cashier: Generates Daily Cash Settlement Voucher
        Server-->>Agent: Handover Cleared & Receipt Status: CONFIRMED
    else Cash Shortage Detected
        Cashier->>Server: Records Discrepancy (Cash Shortage Voucher)
        Server-->>Agent: Flags Agent Balance Owed (Audit Event)
    end
```

### 1.1 Field Collection Rules
1. **Instant Receipt Issuance**: The collection agent must generate a digital bilingual receipt on the spot. No paper slips without software entry are permitted.
2. **Zero Cash Retention**: Agents are strictly prohibited from holding physical cash overnight. All collected cash must be surrendered to the branch cashier before the branch closes for the day.
3. **Cash Handover Acknowledgement**:
   - The cashier physically counts the currency notes against the app's summary.
   - The cashier enters their MPIN or password on their terminal to officially acknowledge receipt.
   - Until acknowledged, the payment status remains `PENDING_HANDOVER`. Once acknowledged, it updates to `CONFIRMED`.

---

## 2. Payment Reversal & Correction SOP (Maker-Checker)

Financial transactions can never be deleted from the database. If a staff member makes an error, it must be resolved via a controlled **Payment Reversal**.

### 2.1 Permitted Reversal Scenarios:
- Field agent entered collection for the wrong ticket number.
- Cheque bounced or dishonored by the bank.
- Duplicate entry created due to network timeout.

### 2.2 Reversal Workflow:
1. **Maker (Branch Manager / Accountant)**:
   - Navigates to the payment record in the Web Dashboard.
   - Clicks **"Request Payment Reversal"**.
   - Selects mandatory reason code and uploads supporting proof (e.g., bank bounce slip or customer note).
2. **Checker (Super Admin / Proprietor)**:
   - Receives high-priority reversal request in the Admin Dashboard.
   - Verifies the reason and clicks **"Approve Reversal"**.
3. **Automated Ledger Effect**:
   - The original payment is flagged as `REVERSED`.
   - The corresponding `InstallmentDue` is restored to `UNPAID` or `PARTIALLY_PAID` with zero mathematical discrepancy.
   - The original receipt is marked `VOID / CANCELED`.
   - An immutable audit log records the Maker ID, Checker ID, timestamp, and justification.

---

## 3. Defaulter Management & Company Removal SOP (`CONFIRMED-BY-DEVELOPER`)

> **Auction Ineligibility Rule (`CONFIRMED-BY-DEVELOPER`)**:  
> Any customer who has not paid their installment due for a specific month is **strictly ineligible to participate or bid** in that month's auction. The software automatically blocks staff from entering an unpaid subscriber as an active bidder or winner.

```mermaid
flowchart LR
    D1["Day 1 to 5\nGrace Period\nZero late fee"] --> D2["Month 1 Unpaid\nAuction Disqualified\nSMS / WhatsApp notification"]
    D2 --> D3["Month 2 Unpaid\nAuction Disqualified\nField Agent Visit"]
    D3 --> D4["Month 3 Consecutive Unpaid\nTicket Flagged: DEFAULT_3_MONTHS\nCompany Removal Rights Triggered"]
    D4 --> D5["Company Removal Action\nPartner authorizes removal\nTicket reassigned / settled"]
```

### 3.1 Non-Prized Subscriber Default & Removal (`CONFIRMED-BY-DEVELOPER`)
1. **Auction Disqualification**:
   - The customer who did not pay at a specific month will **not be able to participate in auctions at that specific month** (`CONFIRMED-BY-DEVELOPER`).
2. **3-Month Consecutive Default & Company Removal Rights (`CONFIRMED-BY-DEVELOPER`)**:
   - The customer who did not pay up to **3 continuous (consecutive) months**, the company has the full right and authority to **remove the customer from the chit group**.
   - The software tracks consecutive missed installments, flags the ticket with status `DEFAULT_3_MONTHS`, and prompts company management for review.
   - Company Management / Partners can formally execute the removal workflow in the software, transitioning the ticket to `REMOVED_DEF_3M`.
   - The company may then substitute a new subscriber or settle past contributions according to company terms.

### 3.2 Prized Subscriber Default (`UNVERIFIED-LEGAL`)
Because a prized subscriber has already received the pool amount:
1. **Surety Demand**: Demand notice is served on the subscriber and nominee/guarantors based on the surety documents collected during prize disbursement.
2. **Statutory Recovery (`UNVERIFIED-LEGAL`)**: Formal arbitration or legal petition before the Registrar of Chits for recovery of remaining installments. Legal citations are retained as `UNVERIFIED-LEGAL` pending inspection of primary Tamil Nadu regulatory orders.
