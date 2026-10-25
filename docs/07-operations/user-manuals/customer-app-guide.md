# Kumaran Chits — Customer Mobile App Guide

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance** (Head Office: Perundurai, Erode, Tamil Nadu)  
> **Target Audience**: **Chit Subscribers / Members (சந்தாதாரர்கள்)**  
> **Primary Platform**: **Android Mobile App (Flutter in `apps/mobile/`)**  
> **Languages Supported**: **Bilingual (English & தமிழ்)**  
> **Core Value**: Complete financial transparency, digital passbook access, 1-tap UPI payments, and zero surprise fees.

---

## 1. Operating Overview & Member Welcome

Welcome to **Kumaran Chits**, the official mobile self-service app of Kumaran Finance. Built specifically for our subscribers in Perundurai and across Tamil Nadu, this app puts your chit passbook directly into your pocket:
- Check your monthly installment dues and dividend savings 24/7.
- Pay your monthly dues in seconds using Google Pay, PhonePe, Paytm, or BHIM UPI.
- View live auction results, winning discounts, and next month's discounted dues.
- Access bilingual digital receipts and Form XXI 20-month passbooks anytime without visiting the branch.

```mermaid
flowchart TD
    subgraph CUSTOMER_APP ["The Kumaran Chits Member Mobile Experience"]
        Passbook["1. Digital Passbook\nView 20-month payment history & dividend savings"]
        Pay["2. 1-Tap UPI Payment\nPay instantly via Google Pay, PhonePe, Paytm"]
        Auction["3. Auction Transparency\nTrack winning bids, ceiling caps, and dividends"]
        Receipt["4. Digital Receipts\nDownload official bilingual PDF receipts"]
    end
```

---

## 2. Member Journey Index & Action Diagrams

| Section | Member Action | Languages | Primary Feature |
|---|---|:---:|:---:|
| **§3** | First-Time Setup, OTP & Language Selection | English & தமிழ் | Mobile App Registration |
| **§4** | Digital Passbook & 20-Month Ledger Inspection | English & தமிழ் | Passbook Screen |
| **§5** | 1-Tap Online Installment Payment via UPI | English & தமிழ் | UPI Intent Gateway |
| **§6** | Doorstep Cash Payment & Push Notification Receipt | English & தமிழ் | Cash Collection Alert |
| **§7** | Auction Eligibility Check & Live Results Tracker | English & தமிழ் | Auction Tracker |
| **§8** | Prize Winner Claim & Company Safety Proof | English & தமிழ் | Payout Status Screen |
| **§9** | Managing Nominee Details & Profile Updates | English & தமிழ் | Profile Settings |
| **§10** | Branch Office Direct Phone Contact & Support | English & தமிழ் | Help Desk |

---

## 3. First-Time Setup, OTP & Language Selection

```mermaid
flowchart TD
    Download["1. Download 'Kumaran Chits' from Google Play Store"] --> Open["2. Open App -> Enter 10-Digit Mobile Number"]
    Open --> OTP["3. Enter 6-Digit SMS Verification OTP"]
    OTP --> MPIN["4. Set Secret 6-Digit MPIN (or enable Fingerprint)"]
    MPIN --> LangChoice{"5. Select Preferred Display Language:\nEnglish or தமிழ் (Tamil)?"}
    LangChoice -- "English" --> EnglishHome["App configured in English"]
    LangChoice -- "தமிழ்" --> TamilHome["App configured in தமிழ்"]
    EnglishHome --> Home["Member Home Dashboard"]
    TamilHome --> Home
```

### Step-by-Step Instructions:
1. Download and install **Kumaran Chits** from the Google Play Store on your Android phone.
2. Enter your 10-digit mobile phone number registered with Kumaran Finance.
3. Enter the 6-digit SMS verification code sent to your phone.
4. Set a memorable **6-digit MPIN** (e.g., `482195`) or scan your fingerprint to enable 1-second biometric login.
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

## 5. 1-Tap Online Installment Payment via UPI (GPay / PhonePe)

```mermaid
flowchart TD
    StartPay["1. Tap 'Pay Due / பணம் செலுத்துக'"] --> VerifyAmount["2. Verify Net Amount: ₹3,700 (Strictly Discrete)"]
    VerifyAmount --> TapUPI["3. Tap 'Pay with UPI'"]
    TapUPI --> SelectApp{"4. Select Preferred UPI App on Phone"}
    SelectApp -- "Google Pay" --> GPay["Google Pay Launches with Pre-Filled Amount"]
    SelectApp -- "PhonePe" --> PhonePe["PhonePe Launches with Pre-Filled Amount"]
    SelectApp -- "Paytm / BHIM" --> Paytm["Paytm Launches with Pre-Filled Amount"]
    GPay --> EnterPIN["5. Enter UPI PIN in Payment App"]
    PhonePe --> EnterPIN
    Paytm --> EnterPIN
    EnterPIN --> Callback["6. Return to Kumaran Chits App:\n• Payment Confirmed Instantly\n• Digital Receipt Issued Immediately\n• Status updates to PAID"]
```

### Step-by-Step Instructions:
1. Tap **"Pay Due / பணம் செலுத்துக"** on the home screen.
2. Review the payment details:
   - **Net Payable Amount**: `₹3,700` (Whole integer Rupees).
   - *(Note: Single discrete payments only; partial payments and advance balances are not permitted).*
3. Tap **"Pay with UPI"**.
4. The app opens your preferred payment application: **Google Pay**, **PhonePe**, **Paytm**, or **BHIM**.
5. Authorize the transaction using your secret UPI PIN.
6. The app instantly confirms your payment, updates your ticket due status to **`PAID`**, and issues an official digital receipt.

---

## 6. Doorstep Cash Payment & Push Notification Receipt

```mermaid
flowchart TD
    AgentVisit["Field Agent visits your doorstep on motorcycle"] --> CashHand["You pay ₹3,700 cash to Agent Murugan"]
    CashHand --> AgentEnters["Agent records collection on his phone"]
    AgentEnters --> InstantPush["Your phone receives an INSTANT Push Notification:\n'Kumaran Finance: Payment Received! ₹3,700 for Ticket #7. Receipt #KC-REC-PRD-2026-00124'"]
    InstantPush --> PassbookCheck["Agent signs your physical paper passbook booklet with pen\nYour app passbook balance updates to PAID"]
```

### Step-by-Step Instructions:
1. When our collection agent visits your premises, hand the exact net installment in cash.
2. The agent records the payment on his mobile phone.
3. Within 3 seconds, your smartphone will chime with an official **Push Notification**:
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

## 8. Prize Winner Claim & Company Safety Proof

```mermaid
flowchart TD
    Win["You win the auction at Month 4! (Winning Discount: ₹25,000)"] --> PrizeCalc["Prize Money Breakdown:\nChit Value: ₹1,00,000\nLess Winning Discount: -₹25,000\nNet Prize Money: ₹75,000"]
    PrizeCalc --> Checklist["Visit Head Office with Safety Proof Papers (ADR-15):\n1. Sign Member Chit Agreement (with Nominee)\n2. Submit signed blank bank cheque(s)\n3. Submit promissory note / personal guarantee\n(No property deeds required!)"]
    Checklist --> Tracking["Track Disbursement on Mobile App:\nStatus: VERIFIED_BY_MAKER -> AUTHORIZED_BY_CHECKER -> DISBURSED\nReceive Cheque or Direct Bank Transfer (NEFT)"]
```

### Step-by-Step Instructions:
1. When you win the in-office auction, your prize money is calculated as $V - D$ (e.g., `₹1,00,000 - ₹25,000 = ₹75,000`).
2. Visit the Perundurai Head Office with your nominee to complete the standard **Company Safety Proof Checklist**:
   - Sign the Winner Chit Agreement alongside your registered nominee.
   - Provide signed blank bank cheques with bank details.
   - Provide a standard promissory note / personal guarantee.
   - *(Note: Property deeds are completely eliminated).*
3. Track the status on your mobile app: as soon as the Partner authorizes your voucher, funds are disbursed via Cheque, NEFT, or Cash.

---

## 9. Managing Nominee Details & Profile Updates

```mermaid
flowchart TD
    Profile["Tap 'Profile / சுயவிவரம்'"] --> Nominee["Tap 'Nominee Details / வாரிசுதாரர் விவரங்கள்'"]
    Nominee --> Edit["View / Update Nominee Information:\n• Nominee Full Name\n• Relationship (Spouse, Child, Parent)\n• 10-Digit Mobile Number"]
    Edit --> Save["Tap 'Update Nominee' -> Branch verifies and confirms"]
```

### Step-by-Step Instructions:
1. Tap **"Profile"** in the bottom menu.
2. Open **"Nominee Details"**.
3. Confirm that your nominee’s legal name, relationship, and contact mobile number are accurate.
4. If an update is required, submit the changes for branch verification.

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
