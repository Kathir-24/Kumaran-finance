# Kumaran Chits — Desk Accountant & Cashier Operations Manual

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance** (Head Office: Perundurai, Erode, Tamil Nadu)  
> **Target Persona**: **Desk Accountant / Office Cashier**  
> **Primary Platform**: **Web Portal (`apps/web/`)** (High-Density Ledgers, Day Book, Cash Counter)  
> **Secondary Platform**: **Android Mobile App (`apps/mobile/`)** (Dual-Role Collections)  
> **Core Role in Governance**: **Primary Operational Maker** for ongoing scheme drafts, payment receipts, and payout vouchers.

---

## 1. Operating Reality & Teaching Overview

The **Desk Accountant** sits behind the physical customer service counter at the Head Office in Perundurai. Their operational station includes:
- A desktop computer logged into the Kumaran Chits Web Portal.
- A high-speed **electronic currency note-sorting & counting machine** on the counter.
- A physical cash drawer with slots for ₹500, ₹200, ₹100, and ₹50 notes.
- Heavy **hand-written paper day-book ledgers** and physical passbooks presented by walk-in subscribers.
- Steel filing cabinets storing signed subscriber chit agreements, blank bank cheques, and promissory notes.

```mermaid
flowchart TD
    subgraph CASH_DESK ["Head Office Cash Counter Operations"]
        Inflow["1. Money Coming IN (Receipts)\n• Walk-in Customer Cash\n• Field Agent 5 PM Handovers\n• Direct Bank NEFT Transfers"]
        Outflow["2. Money Going OUT (Disbursements)\n• Prize Money Vouchers (V - D)\n• Daily Office Petty Cash"]
        Balance["3. Daily Cash Reconciliation\nOpening Vault Cash + Inflows - Outflows\n= Closing Cash (Form XXII 12-Column Cash Book)"]
    end
    Inflow --> Balance
    Outflow --> Balance
```

### The Dual-Role Safety Invariant (Collector + Accountant):
In our local operating reality, staff members frequently collect cash in the field during the morning and sit behind the office counter in the afternoon.
> [!IMPORTANT]
> **Anti-Self-Acknowledgment Guard (`collector_user_id != acknowledger_user_id`)**:  
> Even if you hold both `COLLECTION_AGENT` and `ACCOUNTANT` permissions, **you can NEVER acknowledge or sign off on your own collected field cash**. An independent Partner must physically count your cash and sign it into the vault.

---

## 2. Daily Workflow Index & Action Diagrams

| Section | Operational Action | Role / Dual-Control | Primary Interface |
|---|---|:---:|:---:|
| **§3** | Morning Cash Desk Setup & Note-Sorter Check | Single Actor | Physical Desk & Web Portal |
| **§4** | Walk-in Cash Collection & Bilingual Receipt | Single Actor | Web Portal (`POST /payments`) |
| **§4B** | Verifying Customer UPI Claims against KVB Bank | Checker Role | Web Portal (`POST /payments/:id/verify-upi-claim`) |
| **§5** | Physical Paper Passbook Pen Endorsement | Physical Action | Subscriber Booklet |
| **§6** | High-Density Paper Notebook Transcription | Maker Role | Web Portal (`POST /chits/onboard-ongoing`) |
| **§7** | Preparing Prize Payout Vouchers & Safety Proof | Maker Role | Web Portal (`POST /disbursements/...`) |
| **§8** | Releasing Authorized Disbursement Funds | Fund Release | Web Portal (`POST /disbursements/.../disburse`) |
| **§9** | Receiving & Acknowledging Agent Cash Handovers | Checker Role | Web Portal (`POST /collections/.../acknowledge`) |
| **§10** | Requesting Payment Reversals with Justification | Maker Role | Web Portal (`POST /payments/.../request-reversal`) |
| **§11** | Daily Form XXII Balancing & 6:00 PM Closure | Reconciliation | Web Portal (`GET /reports/form-xxii`) |
| **§12** | Cashier Counter Error Handling & Traps | Operational Guide | Web Portal |

---

## 3. Morning Cash Desk Setup & Note-Sorter Check

```mermaid
flowchart TD
    OpenDesk["8:30 AM: Open Counter Cash Station"] --> TurnOn["Power on PC & Note-Sorting Machine"]
    TurnOn --> Login["Log into Web Portal with 2FA TOTP"]
    Login --> VerifyVault["Check Yesterday's Closing Safe Vault Balance:\ne.g., Form XXII Opening Cash = ₹3,42,500"]
    VerifyVault --> Float["Count Counter Petty Cash Drawer Float (e.g., ₹10,000)"]
    Float --> Ready["Status: CASH DESK OPEN FOR WALK-INS"]
```

### Step-by-Step Instructions:
1. Arrive at the branch at 8:30 AM. Power on the PC and the desktop electronic currency counter.
2. Log into `https://admin.kumaranfinance.in` using your mobile number, password, and Microsoft Authenticator TOTP.
3. Open **Reports $\to$ Form XXII Daily Cash Book**.
4. Note the opening cash balance (e.g., `₹3,42,500`) and verify that yesterday's safe vault count matches.
5. Place currency notes neatly into the counter drawer slots sorted by denomination.

---

## 4. Walk-in Cash Collection & Digital Bilingual Receipt

```mermaid
flowchart TD
    Customer["Subscriber arrives at counter: S. Sundaram"] --> Lookup["1. Search Customer by Mobile (9842100001) or Ticket #"]
    Lookup --> Display["2. Screen Displays Active Dues:\nKCA-1L-20M-01: Month 4 Due = ₹3,700"]
    Display --> Cash["3. Sundaram hands 7 x ₹500 + 1 x ₹200 = ₹3,700 cash"]
    Cash --> Machine["4. Run notes through sorting machine (Verify genuine & count)"]
    Machine --> Record["5. Click 'Record Payment':\n• Amount: ₹3,700 (Discrete Net Installment)\n• Method: CASH"]
    Record --> Receipt["6. Click 'Submit & Issue Receipt'\n• Prints Bilingual Digital Receipt\n• Dispatches Push Notification to Customer Phone\n• Status = PAID immediately"]
```

### Step-by-Step Instructions:
1. Greet the customer and ask for their mobile number or chit ticket code.
2. In the top search bar, enter the number to display their profile.
3. Review the pending installment due:
   - Base Installment: `₹5,000`
   - Minus Month 3 Auction Dividend: `-₹1,300`
   - **Net Amount Payable**: **`₹3,700`**
4. Take the physical currency notes and run them through the note-sorting machine to confirm amount and verify against counterfeits.
5. **Discrete Binary Rule (`CONFIRMED-BY-DEVELOPER`)**:
   - The customer must pay the full net amount (`₹3,700`).
   - The system **strictly rejects partial payments** (e.g., ₹2,000) and **advance balances**.
6. Select Payment Mode: **`CASH`** (or `UPI` if scanned via office counter QR).
7. Click **"Submit & Issue Receipt"** (`POST /payments`).
8. Click **"Submit & Issue Receipt"** (`POST /payments`).
9. The system instantly generates the official sequential receipt number (e.g., `KC-REC-PRD-2026-00124`) and sends a free push notification to the customer's mobile app.
10. **Receipt Printing & Passbook PDF Download**:
    - Click **"Print A5 Receipt"** to print the official bilingual counter receipt slip formatted exactly for A5 paper.
    - Click **"Download PDF"** to save an offline copy (`downloadReceiptPdf`) delivered directly as an authenticated binary blob via the BFF proxy.
    - If the customer requests their 20-month continuous statement, open their profile, navigate to the **Form XXI Passbook** tab, and click **"Download Passbook PDF"** (`downloadPassbookPdf`) to hand them an official signed ledger copy.

---

## 4B. Verifying Customer UPI Payment Claims against Bank Statement

When subscribers pay online via deep-link from the mobile app (GPay / PhonePe / Paytm), they submit their 12-digit Bank UTR reference number. These claims sit in `INITIATED` status awaiting accounting verification.

```mermaid
flowchart TD
    Queue["1. Open Web Portal: 'Payments -> Pending UPI Claims'"] --> List["2. Table displays pending subscriber claims:\n• Subscriber: K. Kathirvel\n• Scheme: KCA-1L-20M-01 (Ticket #4)\n• Installment Month: 3\n• Expected Net Due: ₹3,950\n• Claimed Bank UTR: 429188123456"]
    List --> CheckBank["3. Open Karur Vysya Bank (KVB) NetBanking:\nVerify ₹3,950 credit received with UTR #429188123456"]
    CheckBank --> Decision{"Did the money arrive in KVB account?"}
    Decision -- "YES" --> Verify["4. Click 'Verify & Issue Receipt'\n• Enforces Maker != Checker\n• Payment marked SUCCESS\n• Generates Sequential Bilingual Receipt\n• Due updated to PAID\n• Push alert sent to subscriber"]
    Decision -- "NO / Incorrect" --> Hold["Hold claim, contact subscriber, or flag invalid"]
```

### Step-by-Step Instructions:
1. In the Web Portal navigation menu, click **Payments $\to$ Pending UPI Claims** (`GET /payments/pending-upi-claims`).
2. Review the pending claim details:
   - **Subscriber**: `K. Kathirvel (9842100001)`
   - **Scheme / Ticket**: `KCA-1L-20M-01, Ticket #4`
   - **Installment Month**: `Month 3`
   - **Net Amount**: `₹3,950`
   - **Bank UTR Number**: `429188123456`
3. On your desk computer, open Karur Vysya Bank (KVB) NetBanking or mobile banking app.
4. Verify that the exact whole-rupee amount (`₹3,950`) has credited to Kumaran Finance's current account under UTR `429188123456`.
5. In the Web Portal, click **"Verify & Issue Receipt"** (`POST /payments/:id/verify-upi-claim`). Enter optional verification notes (e.g., `"Verified in KVB NetBanking at 15:30"`).
6. **Dual-Control Safety Invariant (`maker_user_id != checker_user_id`)**:
   - If you submitted the claim on the customer's behalf, you **cannot** verify it. An independent Partner or colleague must confirm the bank credit.
7. Upon clicking verify:
   - The payment transitions from `INITIATED` $\to$ **`SUCCESS`**.
   - The official bilingual receipt (`KC-REC-PRD-2026-XXXXX`) is generated immediately.
   - The customer's due status updates to **`PAID`**.
   - An instant mobile Push Notification is delivered to the subscriber's phone with the receipt number.

---

## 5. Physical Paper Passbook Pen Endorsement

```mermaid
flowchart TD
    Booklet["Customer hands physical paper passbook booklet"] --> VerifyReceipt["Verify Digital Receipt Number on Screen:\nKC-REC-PRD-2026-00124"]
    VerifyReceipt --> Write["With blue ink pen, write on Month 4 row:\n• Date: 15-May-2026\n• Amount: ₹3,700\n• Receipt No: 00124"]
    Write --> Stamp["Affix Kumaran Finance Head Office rubber stamp\nSign with cashier initials"]
    Stamp --> Return["Hand stamped booklet back to customer"]
```

### Step-by-Step Instructions:
1. Physical passbooks remain the primary record for local members in Perundurai.
2. Open the subscriber's booklet to the 20-month grid table.
3. Locate the current active month row.
4. Using a pen, record:
   - **Date**: Today's date (e.g., `15-May-2026`).
   - **Amount Paid**: `₹3,700` (in whole Rupees).
   - **Receipt Reference**: The last 5 digits of the digital receipt number (`00124`).
5. Stamp with the official branch seal, add your cashier signature, and hand the booklet back to the subscriber.

---

## 6. High-Density Paper Notebook Transcription (Maker Role)

```mermaid
flowchart TD
    Notebook["Open 20-Month Hand-Written Physical Notebook"] --> Nav["Navigate: Chit Schemes -> Onboard Ongoing Physical Chit"]
    Nav --> Header["Step 1: Enter Scheme Header\n• Name: KCA-1L-20M-01\n• Value: ₹1,00,000\n• Duration: 20 Months\n• Current Month Entering: Month 7"]
    Header --> Winners["Step 2: Enter Past Winners (Months 1 to 6)\n• Month 1: Company Ticket #1 (₹0 Div)\n• Months 2-6: Past winning tickets & bid discounts"]
    Winners --> Grid["Step 3: Transcribe 20x6 Member Payment Grid\n• Toggle cells: PAID (Green) or UNPAID (Red)\n• Binary discrete: No partial payments"]
    Grid --> GuardCheck{"Balancing Guard:\nDoes System Total Match Page Total?"}
    GuardCheck -- No --> Fix["Review & correct mismatched cell"]
    GuardCheck -- Yes --> SubmitDraft["Click 'Submit Onboarding Draft' (Maker)\nStatus = DRAFT\nQueued for Partner B Checker Activation"]
```

### Step-by-Step Instructions:
1. When migrating an active running chit from physical records, navigate to **Chit Schemes $\to$ "Onboard Ongoing Physical Chit"** (`POST /chits/onboard-ongoing`).
2. Enter the chit scheme header and specify the **Current Active Month** (e.g., Month 7).
3. Transcribe past auction winners and their discounts for Months 1 through 6.
4. Fill in the 20-subscriber payment grid directly from your notebook page:
   - Click once to mark a cell **`PAID`** (Green).
   - Leave as **`UNPAID`** (Red) if the member did not pay that month.
5. **Balancing Guard Check**: Check the computed total at the bottom of the screen. Confirm that it matches the handwritten total on the notebook page to the exact rupee.
6. Click **"Submit Onboarding Draft"** (Maker). The draft is now locked and queued for Partner Checker verification.

---

## 7. Preparing Prize Payout Vouchers & Safety Proof (Maker Role)

```mermaid
flowchart TD
    Winner["Prize Winner Arrives: Kandasamy (Ticket #5)"] --> Nav["Navigate: Disbursements -> Pending Verification -> Ticket #5"]
    Nav --> Checklist["Fill Company Safety Proof Checklist (ADR-15):\n• Winner agreement signed? [Yes]\n• Nominee signed agreement? [Yes]\n• Signed blank cheques collected? [Yes, Cheque #004128]\n• Promissory note collected? [Yes]"]
    Checklist --> Upload["Upload Scanned Photos of signed papers & cheques"]
    Upload --> Prepare["Prepare Voucher:\n• Gross Pool: ₹1,00,000\n• Less Winning Discount: -₹25,000\n• Net Prize Payable: ₹75,000\n• Payment Mode: Cheque / NEFT / Cash"]
    Prepare --> Submit["Click 'Submit Payout Voucher' (Maker)\nStatus = VERIFIED_BY_MAKER\nPush notification sent to Partner B (Checker)"]
```

### Step-by-Step Instructions:
1. Open **Disbursements $\to$ Pending Verification $\to$ Ticket #5**.
2. Inspect the physical papers provided by the prized subscriber.
3. Complete the **Company Safety Proof Checklist**:
   - Check off each submitted item (agreement, nominee signature, blank cheques, promissory note).
   - Enter bank name and cheque numbers.
   - Upload scanned copies or mobile camera captures to encrypted S3 storage.
4. Select the requested payout mode (**Account Payee Cheque**, **NEFT/RTGS**, or **Cash**).
5. Click **"Submit Payout Voucher"** (`POST /disbursements/auction/:id/verify-safety-proof`). Status transitions to `VERIFIED_BY_MAKER`.

---

## 8. Fund Release Execution upon Partner Authorization

```mermaid
flowchart TD
    AuthAlert["Partner B Authorizes Voucher:\nStatus = AUTHORIZED_BY_CHECKER"] --> Open["Accountant opens Authorized Voucher"]
    Open --> EnterRef["Enter Official Fund Release Details:\n• If Cheque: Enter Cheque No (e.g., 904121)\n• If Bank NEFT: Enter Bank UTR Number\n• If Cash: Enter Safe Vault Cash Voucher No"]
    EnterRef --> Release["Click 'Release Disbursement'\n(POST /disbursements/auction/:id/disburse)"]
    Release --> Disbursed["Status = DISBURSED\n• Generates Bilingual Payout Receipt\n• Form XXII Cash Book debited with payout\n• SMS confirmation dispatched to winner"]
```

### Step-by-Step Instructions:
1. Once Partner B authorizes the payout voucher, the status updates to `AUTHORIZED_BY_CHECKER`.
2. Open the voucher and prepare the physical payment:
   - If paying by cheque, write the cheque from the company current account.
   - If paying by NEFT, initiate the transfer on the corporate net banking portal.
3. In the Kumaran Chits portal, enter the **Cheque Number** or **Bank UTR Reference**.
4. Click **"Release Disbursement"** (`POST /disbursements/auction/:id/disburse`).
   - The status updates to `DISBURSED`.
   - The disbursement is permanently stamped into the Form XXII Cash Book.
   - Print the formal bilingual payout receipt for the subscriber's signature.

---

## 9. Receiving & Acknowledging Agent Cash Handovers (Checker Role)

```mermaid
flowchart TD
    AgentReturn["5:00 PM: Field Agent Murugan returns with cash collection bag"] --> HandoverSubmit["Murugan submits batch on phone: ₹42,500 (10 collections)"]
    HandoverSubmit --> MachineVerify["Desk Accountant runs notes through counter note-sorting machine:\n42 x ₹1,000 + 1 x ₹500 = ₹42,500"]
    MachineVerify --> OpenQueue["Open: Collections -> Pending Handovers -> Select Batch"]
    OpenQueue --> DualRoleCheck{"Anti-Self-Acknowledgment Assertion:\nDid Desk Accountant personally collect this cash?"}
    DualRoleCheck -- "Yes (Accountant collected)" --> Block["BLOCKED! collector_user_id != acknowledger_user_id\nMust be counted & acknowledged by a Partner"]
    DualRoleCheck -- "No (Murugan collected)" --> ConfirmAck["Click 'Acknowledge Cash Received'\n(POST /collections/cash-handover/acknowledge)\n• Cash transferred into counter custody\n• Agent liability drops to ₹0\n• Prints Handover Clearance Slip #HO-YYYY-XXXXX"]
```

### Step-by-Step Instructions:
1. At 5:00 PM, motorcyclist field agents return to the Head Office.
2. The agent taps **"Submit Cash Handover"** on their mobile app and places the cash bag on your counter.
3. Place the currency notes through the counter note-sorting machine to verify the physical count against counterfeits and note quality.
4. Navigate to **Collections $\to$ Pending Handovers** on the Web Portal.
5. Verify that the machine count matches the submitted mobile batch total (e.g., `₹42,500`).
6. **The Anti-Self-Acknowledgment Guard (`CONFIRMED-BY-DEVELOPER`)**:
   - If **you (the accountant)** collected this cash during morning rounds, the system **blocks you** from clicking Acknowledge (`collector_user_id != acknowledger_user_id`). A Partner or Branch Manager must acknowledge your handover.
   - If **Field Agent Murugan** collected the cash, you are fully authorized to acknowledge his batch.
7. Click **"Acknowledge Cash Received"** (`POST /collections/cash-handover/acknowledge`).
8. The cash is formally transferred into counter custody, Agent Murugan's mobile liability is cleared to `₹0`, and a printed Clearance Slip `#HO-YYYY-XXXXX` is issued to the agent.

---

## 10. Requesting Payment Reversals with Written Justification (Maker Role)

```mermaid
flowchart TD
    Mistake["Mistake Identified:\nRecorded ₹4,100 to Ticket #8 instead of Ticket #9"] --> Locate["Locate Payment Receipt: KC-REC-PRD-2026-00412"]
    Locate --> ClickReq["Click 'Request Payment Reversal' (Maker)"]
    ClickReq --> Prompt["System Prompts Mandatory Justification:\nType detailed reason explaining error\nAttach photo of counter paper receipt"]
    Prompt --> SubmitReq["Click 'Submit Reversal Request'\n• Status = REVERSAL_PENDING\n• Money is NOT yet reversed!\n• Partner B receives approval notification"]
```

### Step-by-Step Instructions:
1. Locate the erroneous payment under **Payments $\to$ Recent Collections**.
2. Click **"Request Payment Reversal"** (`POST /payments/:id/request-reversal`).
3. You must provide a **Mandatory Written Reason** (e.g., *"Cashier error: Member Mani (Ticket #9) paid ₹4,100 cash, but was entered against Ticket #8 (Kannan). Signed receipt attached."*).
4. Upload a photo of the counter receipt.
5. Click **"Submit Reversal Request"**. The payment status changes to `REVERSAL_PENDING`. It remains pending until a Partner signs off as Checker.

---

## 11. Daily Form XXII Balancing & 6:00 PM Office Closure

```mermaid
flowchart TD
    CloseTime["5:45 PM: End-of-Day Balancing"] --> PhysicalTally["1. Count Physical Cash in Counter Drawer"]
    PhysicalTally --> PartnerHandover["2. Ensure all Field Agent Handovers are Acknowledged"]
    PartnerHandover --> OpenForm["3. Open: Reports -> Form XXII Daily Cash Book"]
    OpenForm --> Compare{"Does System Closing Cash Balance Match\nPhysical Safe Vault Cash to the Rupee?"}
    Compare -- No --> Audit["Inspect Day Book for unrecorded cash or typos"]
    Compare -- Yes --> Sign["Print Form XXII 12-Column Cash Book\nCashier & Partner sign printed register\nLock Cash in Branch Safe Vault"]
```

### Step-by-Step Instructions:
1. At 5:45 PM, count all physical cash inside the counter drawer.
2. Ensure all evening field collection batches have been acknowledged into counter/vault custody.
3. Open **Reports $\to$ Form XXII Daily Cash Book**.
4. Review the 12-Column Cash Balance:
   - **Opening Cash** + **Total Receipts** (Walk-in cash + Agent handovers) - **Total Disbursements** (Prize payouts + Expenses) = **Closing Cash Balance**.
5. Confirm that the physical notes inside the safe match the software balance to the exact rupee.
6. Click **"Print Sheet"**: The built-in `@media print` stylesheet automatically hides all sidebars, topbar navigation, and dark-mode styling, rendering a high-contrast black-on-white 12-column daily cash sheet suitable for paper filing.
7. Click **"Export CSV"** if a digital spreadsheet is required for ledger audit reconciliation.
8. Sign your initials alongside the Partner's signature on the physical printed sheet and lock the vault.

---

## 12. Cashier Counter Error Handling & Operational Traps

| Common Trap / Mistake | Software Behavior | Proper Resolution by Cashier |
|---|---|---|
| **Member insists on paying ₹2,000 partial installment** | Input rejected; system enforces discrete binary amount ($I_{net} = \text{₹}3,700$). | Politely explain: *"Under company policy, full monthly installment must be paid at once."* Hold physical cash in customer envelope until full balance is ready. |
| **Cashier tries to approve their own reversal request** | Software throws `HTTP 403 Forbidden: Maker cannot be Checker`. | Request Partner B or C to log in and approve the pending reversal. |
| **Member brings soiled / counterfeit currency note** | Note-sorting machine rejects note. | Hand note back to subscriber immediately; request clean replacement note before issuing receipt. |
| **Customer forgot physical paper passbook** | Digital receipt prints normally and push alert is sent. | Issue printed paper slip; inform member to bring passbook next month for pen endorsement. |
