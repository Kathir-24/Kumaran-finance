# Kumaran Chits — Customer Mobile App Guide

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance** (Head Office: Perundurai, Erode, Tamil Nadu)  
> **Target Audience**: **Chit Subscribers / Members (சந்தாதாரர்கள்)**  
> **Platform Delivery (`ADR-26`)**: **Phase 1 (Live 2026)**: Bilingual A5 Counter Receipts, Form XXI PDF Passbooks (issued at Perundurai branch desk), Bilingual TRAI DLT SMS Alerts (`ADR-23`), & Direct Zero-Fee KVB UPI (`ADR-19`) | **Phase 2 (Q2 2027)**: Native Android Mobile App (Flutter UI + Google Play APK, built atop the already-implemented Dart Core SDK in `apps/mobile/lib/core/`)  
> **Languages Supported**: **Bilingual (English & தமிழ்)**  
> **Core Value**: Complete financial transparency, digital passbook access, zero-fee NPCI UPI payments, and zero surprise fees.

> [!IMPORTANT]
> **Phase 1 vs. Phase 2 Rollout Notice (`ADR-26`)**: Per Kumaran Finance's authoritative Phase 1 launch directive, the native **Flutter Android UI and Google Play Store APK are deferred to Phase 2 (Q2 2027)** (`apps/mobile/lib/core/` already contains the typed Dart API models and offline synchronization layer). During **Phase 1 (2026)**, subscribers receive official printed bilingual A5 receipts, signed Form XXI PDF passbooks from the Perundurai Head Office desk, instant **bilingual TRAI DLT SMS confirmations (`ADR-23`)**, and direct Karur Vysya Bank UPI payment links (`ADR-19`). The mobile app workflows below describe the canonical Phase 2 Android subscriber experience backed by the live Phase 1 REST APIs.

---

## 1. Operating Overview & Member Welcome

Welcome to **Kumaran Chits**, the official member service experience of Kumaran Finance. Built specifically for our subscribers in Perundurai and across Tamil Nadu, the Phase 2 Android app (backed by live Phase 1 APIs) puts your chit passbook directly into your pocket:
- Check your monthly installment dues and dividend savings 24/7.
- Pay your monthly dues directly to Kumaran Finance's Karur Vysya Bank account with **₹0 gateway fees** via Google Pay, PhonePe, Paytm, or BHIM UPI (`ADR-19`).
- View live auction results, winning discounts, and next month's discounted dues.
- Access bilingual digital receipts and Form XXI 20-month passbooks anytime without visiting the branch.

```mermaid
flowchart TD
    subgraph CUSTOMER_APP ["The Kumaran Chits Member Experience (Phase 1 APIs / Phase 2 Android UI)"]
        Passbook["1. Digital Passbook\nView 20-month payment history & dividend savings"]
        Pay["2. Zero-Fee Direct UPI (ADR-19)\nPay to KVB via GPay/PhonePe & submit 12-digit UTR"]
        Auction["3. Auction Transparency\nTrack winning bids, ceiling caps, and dividends"]
        Receipt["4. Digital Receipts & DLT SMS\nOfficial bilingual PDF receipts & TRAI DLT SMS alerts"]
    end
```

---

## 2. Member Journey Index & Action Diagrams

| Section | Member Action | Languages | Primary Feature |
|---|---|:---:|:---:|
| **§3** | First-Time Setup, OTP & Language Selection *(Phase 2 App)* | English & தமிழ் | Mobile App Registration |
| **§4** | Digital Passbook & 20-Month Ledger Inspection | English & தமிழ் | Form XXI Passbook |
| **§5** | Direct Zero-Fee UPI Payment & Bank UTR Claim (`ADR-19`) | English & தமிழ் | NPCI Native UPI Intent |
| **§6** | Doorstep Cash Payment & Bilingual Receipt Alerts (`ADR-23/26`) | English & தமிழ் | TRAI DLT SMS / Push Alert |
| **§7** | Auction Eligibility Check & Live Results Tracker | English & தமிழ் | Auction Tracker |
| **§8** | Prize Winner Claim & Company Safety Proof (`ADR-15`) | English & தமிழ் | Payout Status Screen |
| **§9** | Viewing & Submitting Nominee Details | English & தமிழ் | Profile Settings |
| **§10** | Branch Office Direct Phone Contact & Support | English & தமிழ் | Help Desk |
| **§11** | Member FAQs, PDF Export & Troubleshooting | English & தமிழ் | Member Self-Service |

---

## 3. First-Time Setup, OTP & Language Selection *(Phase 2 Android Rollout)*

```mermaid
flowchart TD
    Download["1. Install 'Kumaran Chits' Android App (Phase 2 - Q2 2027)"] --> Open["2. Open App -> Enter 10-Digit Mobile Number"]
    Open --> OTP["3. Enter 6-Digit TRAI DLT SMS Verification OTP"]
    OTP --> MPIN["4. Set Secret 6-Digit MPIN (or enable Fingerprint)"]
    MPIN --> LangChoice{"5. Select Preferred Display Language:\nEnglish or தமிழ் (Tamil)?"}
    LangChoice -- "English" --> EnglishHome["App configured in English"]
    LangChoice -- "தமிழ்" --> TamilHome["App configured in தமிழ்"]
    EnglishHome --> Home["Member Home Dashboard"]
    TamilHome --> Home
```

### Step-by-Step Instructions:
1. *(Phase 2 — Q2 2027)* Install **Kumaran Chits** on your Android phone once published for Phase 2 rollout. *(In Phase 1, branch staff manage your passbook and issue instant bilingual A5 receipts & TRAI DLT SMS confirmations.)*
2. Enter your 10-digit mobile phone number registered with Kumaran Finance.
3. Enter the 6-digit TRAI DLT SMS verification code (`POST /api/v1/auth/mobile/request-otp` $\to$ `verify-otp`) sent to your phone.
4. Set a memorable **6-digit MPIN** (e.g., `482195`) or enable biometric unlock.
5. Choose your preferred display language: **English** or **தமிழ் (Tamil)**.
   *(You can switch languages anytime from the settings menu).*

---

## 4. Digital Passbook & 20-Month Ledger Inspection

```mermaid
flowchart TD
    Home["Home Screen"] --> TapPassbook["Tap 'My Chits / எனது சீட்டுகள்'"]
    TapPassbook --> SelectGroup["Select Scheme: KCA-1L-20M-01 (Ticket #7)"]
    SelectGroup --> Breakdown["App Displays Transparent Math Breakdown:\n• Gross Base Installment: ₹5,000\n• Less Universal Equal Dividend: -₹1,300\n• Net Amount Payable: ₹3,700\n• Due Cutoff Date: 15th of the month"]
    Breakdown --> DownloadPDF["Tap any completed month to view/download\nOfficial Bilingual PDF Receipt (English + தமிழ்)"]
```

### Step-by-Step Instructions:
1. On the home screen, tap **"My Chits / எனது சீட்டுகள்"**.
2. Select your active chit scheme (e.g., `KCA-1L-20M-01, Ticket #7`).
3. View your exact monthly breakdown:
   - **Base Installment ($I_{base}$)**: `₹5,000`
   - **Auction Dividend ($Div_{ticket}$)**: `-₹1,300`
   - **Net Amount Payable ($I_{net}$)**: **`₹3,700`**
4. Tap on any past month to inspect or download your **Bilingual Digital Receipt** showing the official receipt number, date, payment mode, and authorized cashier signature.

---

## 5. 1-Tap Online Installment Payment via UPI (GPay / PhonePe / Paytm)

```mermaid
flowchart TD
    StartPay["1. Tap 'Pay Due / பணம் செலுத்துக'"] --> VerifyAmount["2. Verify Net Amount: ₹3,700 (Strictly Discrete)"]
    VerifyAmount --> TapUPI["3. Tap 'Pay with UPI'"]
    TapUPI --> SelectApp{"4. Select Preferred UPI App on Phone"}
    SelectApp -- "Google Pay" --> GPay["Google Pay Launches with Amount Locked"]
    SelectApp -- "PhonePe" --> PhonePe["PhonePe Launches with Amount Locked"]
    SelectApp -- "Paytm / BHIM" --> Paytm["Paytm Launches with Amount Locked"]
    GPay --> EnterPIN["5. Enter UPI PIN in Payment App"]
    PhonePe --> EnterPIN
    Paytm --> EnterPIN
    EnterPIN --> ReturnApp["6. Return to Kumaran Chits App:\nEnter 12-Digit Bank UTR Reference Number"]
    ReturnApp --> SubmitClaim["7. Tap 'Submit Claim':\nStatus shows 'PENDING VERIFICATION'\nReceipt issued upon 1-click accounting check"]
```

### Step-by-Step Instructions:
1. Tap **"Pay Due / பணம் செலுத்துக"** on the home screen.
2. Review the payment details:
   - **Net Payable Amount**: `₹3,700` (Whole integer Rupees, after universal dividend deduction).
   - *(Note: Single discrete payments only; partial payments and advance balances are not permitted).*
3. Tap **"Pay with UPI"**. The app automatically builds an official NPCI deep-link locking our Karur Vysya Bank payee details (`kumaranfinance@kvb`).
4. Select your preferred UPI payment application: **Google Pay**, **PhonePe**, **Paytm**, or **BHIM**.
5. The UPI app opens with the exact amount (`₹3,700`) and transaction note locked. Authorize the payment using your secret UPI PIN.
6. Copy the **12-digit Bank UTR / Reference Number** (e.g., `429188123456`) displayed on your payment confirmation screen.
7. Return to the **Kumaran Chits** app, paste the UTR number, and tap **"Submit Claim"**.
8. Your payment claim is recorded instantly (`INITIATED`). As soon as the office accountant verifies the credit in the bank statement, your due is marked **`PAID`**, and your official bilingual receipt (`KC-REC-PRD-YYYY-XXXXX`) is delivered via instant Push Notification to your passbook!


---

## 6. Doorstep Cash Payment & Bilingual Receipt Alerts (`ADR-23` / `ADR-26`)

```mermaid
flowchart TD
    AgentVisit["Field Agent visits your doorstep"] --> CashHand["You pay ₹3,700 cash to Agent Murugan"]
    CashHand --> AgentEnters["Agent records collection in Kumaran Chits"]
    AgentEnters --> InstantAlert["Your phone receives an instant Bilingual Receipt Alert:\n• Phase 1 Primary: TRAI DLT SMS (MSG91)\n• Phase 2 Android App: FCM Push Notification\n'Kumaran Finance: Payment Received! ₹3,700 for Ticket #7. Receipt #KC-REC-PRD-2026-00124'"]
    InstantAlert --> PassbookCheck["Agent signs your physical paper passbook booklet with pen\nYour ledger balance updates to PAID"]
```

### Step-by-Step Instructions:
1. When our collection agent visits your premises, hand the exact net installment in cash.
2. The agent records the payment via the responsive web portal (or Phase 2 Android app).
3. Your mobile phone receives an official bilingual **TRAI DLT SMS receipt confirmation** (Phase 1 primary per `ADR-23`; plus Android FCM Push Notification in Phase 2 per `ADR-26`):
   - *"குமரன் பைனான்ஸ்: ரசீது எண் KC-REC-PRD-2026-00124. தொகை ₹3,700 பெறப்பட்டது."*
4. Ensure the agent writes the receipt number and signs your physical paper passbook booklet.

---

## 7. Auction Eligibility Check & Live Results Tracker

```mermaid
flowchart TD
    NavAuction["Tap 'Auctions / ஏல விவரங்கள்'"] --> Eligibility{"System Eligibility Check:\nDid you pay this month's installment?"}
    Eligibility -- "Unpaid Due" --> Ineligible["Alert: 'Ineligible to Bid'\nYou must clear current month dues before participating"]
    Eligibility -- "Paid in Full" --> Eligible["Status: 'ELIGIBLE TO BID'\nAuction scheduled for 15th at 4:00 PM at Head Office"]
    Eligible --> PostAuction["Post-Auction Results Displayed:\n• Winning Ticket: #5 (M. Kandasamy)\n• Winning Bid Discount: ₹25,000 (Maximum 1/4 Ceiling)\n• Universal Dividend to Your Ticket: ₹1,050\n• Next Month Payable: ₹3,950"]
```

### Step-by-Step Instructions:
1. Tap **"Auctions / ஏல விவரங்கள்"** to check the auction schedule for your chit group.
2. **Auction Ineligibility Rule (`CONFIRMED-BY-DEVELOPER`)**:
   - If your installment for the current month is unpaid, the app displays: **`INELIGIBLE (UNPAID DUE)`**.
   - You must settle your current due before you can participate or call out bids in the branch auction.
3. **Universal Equal Dividend (`CONFIRMED-BY-DEVELOPER`)**:
   - Once the auction concludes, view the winning bid discount and the dividend allocated to your ticket.
   - Kumaran Finance deducts the **exact same dividend for ALL members**, including past auction winners.

---

## 8. Prize Winner Claim & Company Safety Proof (`ADR-15`)

```mermaid
flowchart TD
    Win["You win the auction at Month 4! (Winning Discount: ₹25,000)"] --> PrizeCalc["Server-Computed Prize Money Breakdown (KFC-FIN-003/004):\nChit Value: ₹1,00,000\nLess Winning Discount: -₹25,000\nLess Unpaid Arrears Auto-Offset (if any): -₹0\nNet Prize Money: ₹75,000 (Zero manual overrides)"]
    PrizeCalc --> Checklist["Visit Head Office with Safety Proof Papers (ADR-15):\n1. Sign Member Chit Agreement (with Nominee)\n2. Submit signed blank bank cheque(s)\n3. Submit promissory note / personal guarantee\n(No property deeds required!)"]
    Checklist --> Tracking["Track Disbursement Status:\nVERIFIED_BY_MAKER -> AUTHORIZED_BY_CHECKER -> DISBURSED\nReceive Cheque, NEFT/RTGS, or Cash"]
```

### Step-by-Step Instructions:
1. When you win the in-office auction, your net prize money is automatically computed by the server as $V - D - \text{Unpaid Arrears Offset}$ (e.g., `₹1,00,000 - ₹25,000 = ₹75,000`). Manual payout overrides are strictly disallowed (`KFC-FIN-004`), and any pending unpaid installments on the winning ticket are automatically offset before release (`KFC-FIN-003`).
2. Visit the Perundurai Head Office with your nominee to complete the standard **Company Safety Proof Checklist**:
   - Sign the Winner Chit Agreement alongside your registered nominee.
   - Provide signed blank bank cheques with bank details.
   - Provide a standard promissory note / personal guarantee.
   - *(Note: Property deeds are completely eliminated).*
3. Once Verified Partner B authorizes your voucher (`AUTHORIZED_BY_CHECKER`), funds are disbursed via Account Payee Cheque, NEFT/RTGS, or Cash (`DISBURSED`).

---

## 9. Viewing & Submitting Nominee Details

```mermaid
flowchart TD
    Profile["Tap 'Profile / சுயவிவரம்'"] --> Nominee["Tap 'Nominee Details / வாரிசுதாரர் விவரங்கள்'"]
    Nominee --> ViewOrAdd["View Registered Nominees or Add New Nominee:\n(POST /api/v1/customers/:id/nominees)\n• Nominee Full Name\n• Relationship (Spouse, Child, Parent)\n• 10-Digit Mobile Number & Optional Masked Aadhaar"]
    ViewOrAdd --> StaffEdit["Need to edit or remove an existing nominee?\nVisit Perundurai Head Office (Branch Manager / Partner only)"]
```

### Step-by-Step Instructions:
1. Tap **"Profile"** in the menu and open **"Nominee Details"** (`GET /api/v1/customers/:id`).
2. Confirm that your nominee’s legal name, relationship, and contact mobile number are accurate.
3. To register a new nominee on your own profile, submit the details (`POST /api/v1/customers/:id/nominees`, strictly scoped to self).
4. To **modify or remove** an existing nominee or update core KYC/contact details (`PATCH /api/v1/customers/:id`, `DELETE /api/v1/customers/:id/nominees/:nomineeId`), visit the Perundurai Head Office so a Branch Manager or Managing Partner can verify and process the change.

---

## 10. Branch Office Contact & Support

```mermaid
flowchart TD
    Help["Tap 'Contact Branch / கிளை தொடர்பு'"] --> Options{"Choose Contact Option"}
    Options -- "Phone Call" --> Call["Direct 1-Tap Dial to Perundurai Head Office:\n0424-2223333"]
    Options -- "Directions" --> Map["Google Maps route to Kumaran Finance, Perundurai"]
    Options -- "Hours" --> Hours["Working Hours: Mon - Sat: 9:00 AM - 6:00 PM"]
```

### Step-by-Step Instructions:
- **Phone**: Tap the call icon to dial our Perundurai Head Office directly at `0424-2223333`.
- **Address**: Kumaran Finance, Main Road, Perundurai, Erode District, Tamil Nadu.
- **Operating Hours**: Monday through Saturday, 9:00 AM to 6:00 PM.

---

## 11. Member FAQs, PDF Export & Troubleshooting

```mermaid
flowchart TD
    MemberQ["Common Member Questions"] --> AnsType{"Select Topic"}
    AnsType -- "Bank debited but claim still INITIATED?" --> Recon["1. Direct KVB UPI Verification (ADR-19):\nNo third-party gateway or auto-webhook!\nAccounting Desk verifies your 12-digit UTR in KVB NetBanking\nOnce verified -> Status = PAID + Official Receipt & DLT SMS"]
    AnsType -- "Need loan statement proof?" --> SharePDF["2. Export Form XXI Passbook PDF:\nDownload bilingual A4 Landscape PDF passbook\n(Zero automated WhatsApp API per Q34; share PDF file manually if desired)"]
    AnsType -- "Can I join with 2 tickets in same chit?" --> LimitRule["3. Single Ticket Limit:\nMax 1 ticket per customer in same group (Risk Protection)\nYou are welcome to join a second ticket in a different group"]
    AnsType -- "How do I watch the auction tie-break?" --> AttendLot["4. Live Paper Token Draw:\nVisit Perundurai branch office at 4:00 PM on 15th\nForeman folds paper tokens & a member draws live!"]
```

### Frequently Asked Questions:
1. **My bank account was debited via Google Pay / PhonePe, but my due still shows "INITIATED / Pending Verification"?**
   - Don't worry — your money went directly into Kumaran Finance's Karur Vysya Bank (KVB) current account with **₹0 gateway fees (`ADR-19`)**. Because we do not use a commercial third-party payment gateway or automated webhooks, receipts are not auto-issued on bank debit.
   - Make sure you submitted your exact **12-digit Bank UTR reference number** (`POST /api/v1/payments/upi-claim`).
   - Our Accounting Desk verifies incoming KVB credits during branch hours (`POST /api/v1/payments/:id/verify-upi-claim`), after which your due immediately updates to **`PAID`** and your bilingual receipt & TRAI DLT SMS are issued. If your claim remains `INITIATED` after business hours, call the Perundurai office with your 12-digit UTR (and our 06:00 AM IST sweep flags stale claims for staff follow-up).
2. **How can I obtain my 20-month payment record for a bank loan or verification?**
   - Request a printed/PDF **Form XXI Passbook** (A4 Landscape) from the Perundurai branch desk during Phase 1, or download it directly under **"My Chits" $\to$ "Form XXI Passbook"** in Phase 2 (`GET /api/v1/reports/form-xxi`).
   - *(Note: Kumaran Finance does not send automated WhatsApp Business API messages per `Q34` / `KFC-NOT-001`; you may manually save and share your downloaded PDF passbook file with your bank officer using your phone's standard file share sheet.)*
3. **Can I buy two tickets in the same ₹1,00,000 group?**
   - No. Under Kumaran Finance's risk-management rules, a subscriber can hold a maximum of 1 ticket in any single group (`@@unique([chitGroupId, customerId])`).
   - If you want to save more, our staff can enroll you in a second chit group running on a different monthly cycle.
4. **If two people bid the ₹25,000 ceiling, how do you decide who wins?**
   - We do not use computer algorithms or software lotteries.
   - The Foreman conducts a transparent **Option A Physical Paper Token Draw** live in the Perundurai branch room. The competing ticket numbers are written on paper slips, placed into a steel bowl, and an attendee or child draws the winning token in front of everyone.
