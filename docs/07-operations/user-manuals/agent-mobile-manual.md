# Kumaran Chits — Field Collection Agent Mobile App Manual

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance** (Head Office: Perundurai, Erode, Tamil Nadu)  
> **Target Persona**: **Field Collection Agents (Motorcycle Collection Staff)**  
> **Primary Platform**: **Android Mobile App (Flutter in `apps/mobile/`)**  
> **Hardware Support**: Android 10+, Biometric Fingerprint Sensor, Offline Local SQLite Database  
> **Core Operating Standard**: Single discrete payments, instant bilingual digital receipts, zero cash retention overnight.

---

## 1. Operating Reality & Field Training Overview

Kumaran Finance operates **2 to 3 field collection agents** who travel by motorcycle across Perundurai, Chennimalai, and surrounding rural agricultural villages in Erode District. Their operational reality involves:
- Visiting village homes, weaver sheds, and local markets to collect monthly cash installments.
- Entering cellular dead zones where 4G/5G mobile connectivity drops to zero.
- Carrying heavy leather cash collection bags on motorbikes.
- Maintaining customer trust through transparent digital receipts and physical passbook pen-and-ink signatures.

```mermaid
flowchart TD
    subgraph AGENT_DAY ["Daily Routine of a Field Agent"]
        M1["9:00 AM: Branch Route Sync\nDownload assigned customer dues list"] --> M2["10:00 AM - 4:30 PM: Doorstep Route\nVisit subscribers, collect cash, issue receipts\n(Works 100% offline in dead zones)"]
        M2 --> M3["5:00 PM: Return to Head Office\nHand physical cash bag to Partner\nClear liability to ₹0"]
    end
```

---

## 2. Daily Workflow Index & Action Diagrams

| Section | Operational Action | Connectivity | Primary Interface |
|---|---|:---:|:---:|
| **§3** | First-Time Setup, MPIN & Biometric Unlock | Online / Daily Offline | Mobile App |
| **§4** | Morning Route Sync & Inspecting Assigned Dues | Online (Branch Wi-Fi) | Mobile App |
| **§5** | 30-Second Doorstep Cash Collection & Digital Receipt | Online Mode | Mobile App (`POST /collections/record`) |
| **§6** | Doorstep Collection in Dead Zones & Batch Sync | Offline $\to$ Sync | Mobile App (`POST /collections/sync-offline-queue`) |
| **§7** | On-the-Road Customer Lead Registration | Online / Offline | Mobile App (`POST /customers`) |
| **§8** | 3-Month Arrears Notice Delivery & Clearance Slips | Online / Offline | Mobile App |
| **§9** | End-of-Day Cash Handover at Head Office Counter | Online (Branch Office) | Mobile App (`POST /collections/cash-handover/submit`) |

---

## 3. First-Time Setup, MPIN & Biometric Unlock

```mermaid
flowchart TD
    subgraph SETUP ["One-Time Initial Device Setup"]
        S1["Install App on Android Phone"] --> S2["Enter Registered 10-digit Mobile Number"]
        S2 --> S3["Enter 6-digit SMS OTP received"]
        S3 --> S4["Set Secret 6-Digit MPIN (e.g. 749201)"]
        S4 --> S5["Scan Fingerprint to enable Biometric Login"]
    end

    subgraph DAILY ["Routine Daily Morning Login (< 1 Second)"]
        D1["Open Kumaran Chits App"] --> D2["Touch Fingerprint Sensor"]
        D2 --> D3["Instant Home Screen Unlock\n(No SMS OTP required daily)"]
    end
```

### Step-by-Step Instructions:
1. **One-Time Registration**:
   - Open the app on your Android smartphone.
   - Enter your registered 10-digit mobile number and tap **"Send OTP"**.
   - Type the 6-digit SMS verification code.
   - Set a private **6-digit MPIN** that you will remember.
   - When prompted, touch your thumb to the phone's fingerprint reader to enable **Biometric Quick Login**.
2. **Routine Daily Morning Login**:
   - Every morning, simply open the app and touch your fingerprint sensor.
   - The app unlocks in under 1 second without requiring mobile signal or SMS OTP.

---

## 4. Morning Route Sync & Inspecting Assigned Dues

```mermaid
flowchart TD
    Arrive["9:00 AM: Arrive at Head Office (Connected to Branch Wi-Fi)"] --> SyncRoute["Tap 'Sync Assigned Dues'\nDownloads customer list to local phone storage"]
    SyncRoute --> Summary["Inspect Today's Route Target:\n• Total Target: ₹45,000\n• Total Customers: 12\n• Sorted by Street / Area proximity"]
    Summary --> Departure["Mount Motorcycle & Start Field Route"]
```

### Step-by-Step Instructions:
1. Before leaving the Perundurai office, connect to the branch Wi-Fi.
2. Tap the **"Sync Assigned Dues"** icon.
3. The app downloads your route data into encrypted local SQLite storage.
4. Review your **Today's Route Dashboard**:
   - **Target Collection**: e.g., `₹45,000` across 12 customers.
   - **Collected So Far**: `₹0`.
   - **Pending Customer List**: Sorted by village, street, or priority.

---

## 5. 30-Second Doorstep Cash Collection & Digital Receipt

```mermaid
flowchart TD
    ArriveCust["Arrive at Customer's House / Shop (e.g., S. Sundaram)"] --> Search["1. Tap Customer Name or Search by Ticket Code"]
    Search --> CheckDue["2. App Displays Discrete Installment Due:\nKCA-1L-20M-01: Net Due = ₹3,700"]
    CheckDue --> TakeCash["3. Collect Physical Currency Notes from Customer (₹3,700)"]
    TakeCash --> Record["4. Select Method: CASH -> Tap 'Confirm Collection'"]
    Record --> Receipt["5. App Generates Bilingual Digital Receipt Instantly:\n• Receipt No: KC-REC-PRD-2026-00124\n• Dispatches Push Notification to Customer\n• Hand-write date, amount & sign customer paper passbook"]
```

### Step-by-Step Instructions:
1. Tap the customer's name on your route list.
2. The app displays the net monthly installment due: **`₹3,700`**.
3. **The Single Discrete Payment Rule (`CONFIRMED-BY-DEVELOPER`)**:
   - You must collect the exact net installment in full (`₹3,700`).
   - The app **strictly rejects partial payments** (e.g., ₹1,500) and advance balances.
4. Count the physical currency notes.
5. Tap **"Record Collection"**, select **`CASH`**, and tap **"Confirm & Issue Receipt"** (`POST /collections/record`).
6. The app instantly issues the **Bilingual Digital Receipt (English + தமிழ்)**:
   - *"ரசீது எண் / Receipt No: KC-REC-PRD-2026-00124"*
   - *"சந்தாதாரர் பெயர் / Subscriber Name: S. Sundaram"*
   - *"செலுத்திய தொகை / Amount Paid: ₹3,700"*
7. With a pen, record the date, amount, and receipt number in the subscriber's physical paper passbook booklet and sign your initials.

---

## 6. Doorstep Collection in Dead Zones & Batch Synchronization

```mermaid
flowchart TD
    DeadZone["Cellular Signal Drops to 0 Bars (Rural Dead Zone)"] --> Indicator["App Displays 'Offline Mode' (Amber Banner)"]
    Indicator --> CollectOffline["Collect Cash as normal -> Tap 'Confirm Collection'"]
    CollectOffline --> LocalStorage["App generates tamper-proof UUID tracking key\nSaves record to local SQLite with physical timestamp (collectedAt)"]
    LocalStorage --> IssueLocalReceipt["App renders offline digital receipt on screen\nAgent signs customer physical passbook"]
    IssueLocalReceipt --> MoveToNetwork["Return to 4G Coverage Area or Head Office Wi-Fi"]
    MoveToNetwork --> BatchSync["App automatically triggers Batch Sync:\nPOST /collections/sync-offline-queue (Up to 100 items)"]
    BatchSync --> ServerResponse{"Server Processes Batch"}
    ServerResponse -- "Normal Items" --> Success["Official sequential receipt numbers generated\nPush notifications dispatched to customers"]
    ServerResponse -- "Conflict: Member paid at counter" --> Conflict["Flagged as INSTALLMENT_ALREADY_PAID\nAll other items succeed (Partial Success Isolation)\nAgent returns cash to customer or adjusts with accountant"]
```

### Step-by-Step Instructions:
1. If network connectivity drops while visiting rural agricultural fields, the app automatically switches to **Offline Mode**.
2. You can record payments without interruption. The app generates a tamper-proof local UUID tracking key and stamps the exact physical collection time (`collectedAt`).
3. Show the on-screen digital receipt to the subscriber and sign their physical passbook.
4. **Batch Synchronization (`POST /collections/sync-offline-queue`)**:
   - As soon as your phone reconnects to 4G/5G or branch Wi-Fi, the app automatically uploads your offline queue in a single batch (up to 100 collections).
   - **Idempotency Guarantee**: If network drops mid-sync and the app retries, the server uses the UUID key to return the original receipt without creating double charges.
   - **Conflict Handling (Partial Success Isolation)**: If a customer paid at the office counter while you were on the road, the server marks that single ticket as `INSTALLMENT_ALREADY_PAID` while committing all other valid payments. The app notifies you immediately so you can return the cash.

---

## 7. On-the-Road Customer Lead Registration

```mermaid
flowchart TD
    Lead["A local shopkeeper or farmer expresses interest in joining a chit"] --> OpenLead["Tap 'New Customer Lead' on App Menu"]
    OpenLead --> EnterMinimal["Enter Minimal Notebook-Style Details:\n• Full Name: M. Ramasamy\n• 10-Digit Mobile: 9842100044\n• Village / Area: Perundurai Market\n• Approximate Chit Value Desired: ₹1,00,000"]
    EnterMinimal --> SaveLead["Tap 'Save Lead' (POST /customers)\nQueued for Branch Manager review & ticket allocation"]
```

### Step-by-Step Instructions:
1. If a local shopkeeper or farmer expresses interest in enrolling, tap **"New Customer Lead"** in the app menu.
2. In keeping with our village intake reality, enter minimal fields: Full Name, Mobile Number, Village/Area, and Nominee Name.
3. Tap **"Save Lead"** (`POST /customers`). The lead appears on the Branch Manager's desk for scheme enrollment and ticket allocation.

---

## 8. 3-Month Arrears Notice Delivery & Clearance Slips

```mermaid
flowchart TD
    Alert["App Route lists subscriber with Defaulter Warning:\nP. Murugesan (Ticket #14) - 3 Months Arrears"] --> Visit["Agent visits Murugesan's premises"]
    Visit --> HandNotice["Hand physical Arrears Warning Notice\nExplain: Missed 3 months grants company removal rights"]
    HandNotice --> Outcome{"Customer Response"}
    Outcome -- "Pays Full Arrears" --> Collect["Collect overdue installments\nSystem clears defaulter tag automatically"]
    Outcome -- "Cannot Pay" --> RecordSlip["Agent records 'Notice Delivered'\nGenerates Electronic Visit Slip with timestamp\nNotifies Head Office Partner"]
```

### Step-by-Step Instructions:
1. When a subscriber misses 3 consecutive months, the app highlights their profile with a red **`3M ARREARS`** badge.
2. Visit the member and deliver the formal company warning notice.
3. If they pay, record the discrete payments. If they cannot pay, tap **"Record Visit Notice"** to record an electronic timestamped visit slip, notifying the Partner to initiate formal substitution procedures.

---

## 9. End-of-Day Cash Handover at Head Office Counter

```mermaid
flowchart TD
    ReturnOffice["5:00 PM: Return to Head Office in Perundurai"] --> OpenSummary["Open 'Daily Summary & Cash Handover' in App"]
    OpenSummary --> Tally["App displays exact physical cash collected:\ne.g., Total Cash Collected: ₹42,500 (10 collections)"]
    Tally --> SubmitHandover["Tap 'Submit Cash Handover Batch' (POST /collections/cash-handover/submit)\nStatus = PENDING_HANDOVER"]
    SubmitHandover --> HandBag["Hand physical leather cash bag to Partner A"]
    HandBag --> PartnerCount["Partner counts notes on counter machine (₹42,500)"]
    PartnerCount --> PartnerAck["Partner clicks 'Acknowledge Cash Received'\n(Asserts: collector_user_id != acknowledger_user_id)"]
    PartnerAck --> Cleared["App instantly updates:\n• Cash Handover Status = CONFIRMED\n• Cash-in-Hand Liability = ₹0\n• Clearance Slip #HO-2026-0089 issued"]
```

### Step-by-Step Instructions:
1. Return to the Perundurai branch office before 5:00 PM closing.
2. Tap **"Daily Summary & Cash Handover"** in the app.
3. Verify your day's total: e.g., `Total Cash Collected: ₹42,500`.
4. Tap **"Submit Cash Handover Batch"** (`POST /collections/cash-handover/submit`).
5. Hand your physical currency notes to an authorized Partner at the counter.
6. The Partner runs the notes through the currency counting machine and acknowledges receipt in the software.
7. **The Anti-Self-Acknowledgment Guard**: If you also hold accountant permissions, you cannot acknowledge your own cash. A Partner must sign off (`collector_user_id != acknowledger_user_id`).
8. Your mobile app screen turns green: **`Handover Cleared — Status: CONFIRMED`**.
9. **Strict Company Rule**: Never take company cash home overnight.
