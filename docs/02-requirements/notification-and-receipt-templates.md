# Kumaran Chits — Bilingual Notification & Receipt Templates

> **Product**: **Kumaran Chits** (Kumaran Finance)  
> **Supported Channels**: Bilingual PDF Receipts, Indian DLT SMS, WhatsApp Business API, and Digital Passbook  
> **Languages**: English & தமிழ் (Tamil)  
> **Currency Standard**: All monetary values are strictly in **whole integer Rupees (₹)**. Paise are never used in Kumaran Finance operations (`CONFIRMED-BY-DEVELOPER`).

---

## 1. Bilingual Digital Receipt (PDF & Print Layout) (`CONFIRMED-BY-DEVELOPER`)

```text
================================================================================
                    KUMARAN FINANCE / குமரன் பைனான்ஸ்
               Chit Fund Operations / சீட்டு நிறுவனம்
        Main Road, Perundurai, Erode / தலைமை கிளை, பெருந்துறை, ஈரோடு
                 Phone / தொலைபேசி: +91 98765 43210
================================================================================
                   சந்தா ரசீது / SUBSCRIPTION RECEIPT
--------------------------------------------------------------------------------
ரசீது எண் / Receipt No   : KC-REC-PRD-2026-00412    தேதி / Date : 17-Oct-2026
சீட்டு குறியீடு / Chit Code: KCA-1L-20M-01             மாதம் / Month: 4 / 20
டிக்கெட் எண் / Ticket No : 07                         நேரம் / Time: 10:45 AM
--------------------------------------------------------------------------------
சந்தாதாரர் பெயர் / Subscriber Name : திரு. S. சுந்தரம் / S. Sundaram
முகவரி / Address                 : 14, நேதாஜி ரோடு, பெருந்துறை, ஈரோடு
தொலைபேசி / Mobile                : +91 98421 XXXXX
--------------------------------------------------------------------------------
கட்டண விவரங்கள் / PAYMENT BREAKDOWN:
  அடிப்படை தவணை / Base Installment      : ₹ 5,000
  கழிவு லாபப்பங்கு / Dividend Deduction : - ₹ 1,250
  செலுத்த வேண்டியது / Net Payable       : ₹ 3,750
--------------------------------------------------------------------------------
செலுத்திய தொகை / AMOUNT PAID           : ₹ 3,750
(ரூபாய் மூன்றாயிரத்து எழுநூற்று ஐம்பது மட்டும் / Rupees Three Thousand Seven Hundred Fifty Only)

கட்டண முறை / Payment Mode              : ரொக்கம் / CASH
வசூலித்தவர் / Collected By             : முகவர் முனியசாமி (AG-04)
முன்பண இருப்பு / Advance Credit Balance  : ₹ 0
--------------------------------------------------------------------------------
  * கணினி மூலம் உருவாக்கப்பட்ட ரசீது. கையொப்பம் தேவையில்லை.
  * This is a computer-generated digital receipt.
================================================================================
```

---

## 2. Indian Telecom DLT-Compliant SMS Templates (`CONFIRMED-BY-DEVELOPER`)

Under Indian Telecom Regulatory Authority of India (TRAI) DLT mandates, SMS headers and message bodies must be pre-registered:

### 2.1 Device Registration OTP
- **Sender ID (Header)**: `KMRCHT`
- **Template ID**: `1407169823412093847`
- **Template Text**:
```text
Kumaran Chits: Your one-time verification code is {#var#}. Valid for 5 minutes. Do not share this OTP with anyone. / உங்கள் சரிபார்ப்பு குறியீடு {#var#}. யாருடனும் பகிர வேண்டாம்.
```

### 2.2 Payment Receipt Alert (SMS)
- **Template Text**:
```text
Kumaran Chits: Received Rs.{#var#} for Chit {#var#}, Ticket #{#var#} on {#var#}. Receipt: {#var#}. View passbook: {#var#}
```

---

## 3. WhatsApp Business API Rich Notification Templates (`CONFIRMED-BY-DEVELOPER`)

### 3.1 Instant Payment Confirmation (WhatsApp)
```text
வணக்கம் திரு. *{{subscriber_name}}*,

குமரன் சீட்ஸ்-ல் உங்கள் சீட்டு தவணை தொகை வெற்றிகரமாக பெறப்பட்டது.
Your chit subscription payment has been received successfully.

📋 *கட்டண விவரம் / Payment Details:*
-------------------------------------------
• சீட்டு குழு / Chit Group: *{{chit_code}}*
• டிக்கெட் எண் / Ticket No: *{{ticket_number}}*
• செலுத்திய தொகை / Amount: *₹{{amount_paid}}*
• கட்டண முறை / Mode: *{{payment_mode}}*
• ரசீது எண் / Receipt No: *{{receipt_number}}*
• தேதி & நேரம் / Date: *{{transaction_timestamp}}*
• முன்பண இருப்பு / Advance Credit: *₹{{advance_balance}}*

📥 *டிஜிட்டல் ரசீதை பதிவிறக்க / Download Receipt PDF:*
{{receipt_download_url}}

📲 *உங்கள் டிஜிட்டல் பாஸ்புக்கை பார்க்க / View Passbook:*
{{passbook_app_url}}

நன்றி / Thank you,
*குமரன் பைனான்ஸ் / Kumaran Finance*
```

---

### 3.2 Upcoming Monthly Auction Reminder (WhatsApp)
```text
வணக்கம் திரு. *{{subscriber_name}}*,

குமரன் சீட்ஸ் *{{chit_code}}* குழுவின் *மாதம் {{installment_month}}* ஏலம் கீழ்கண்ட தேதியில் நடைபெற உள்ளது:

📅 *ஏல தேதி / Auction Date:* {{auction_date}}
⏰ *நேரம் / Time:* {{auction_time}}
📍 *இடம் / Venue:* {{branch_name}}, {{branch_address}}

அனைத்து சந்தாதாரர்களும் தவறாமல் ஏலத்தில் கலந்துகொள்ளுமாறு கேட்டுக்கொள்கிறோம்.

குமரன் பைனான்ஸ்
தொடர்புக்கு: {{branch_phone}}
```

---

## 4. Digital Passbook Data Structure (Mobile App View) (`CONFIRMED-BY-DEVELOPER`)

In the mobile app, the subscriber's **Digital Passbook (டிஜிட்டல் சந்தா புத்தகம்)** renders each month in chronological order with strictly whole integer Rupees:

| Month Index | Due Date | Gross Due | Dividend Credit | Net Paid | Payment Date | Mode | Receipt No. | Status |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Month 1** | 10-May-2026 | ₹5,000 | ₹0 (Initial Month) | ₹5,000 | 08-May-2026 | Cash | REC-0012 | **PAID** |
| **Month 2** | 10-Jun-2026 | ₹5,000 | ₹1,250 | ₹3,750 | 09-Jun-2026 | UPI | REC-0145 | **PAID** |
| **Month 3** | 10-Jul-2026 | ₹5,000 | ₹1,300 | ₹3,700 | 10-Jul-2026 | Cash | REC-0280 | **PAID** |
| **Month 4** | 10-Aug-2026 | ₹5,000 | ₹1,200 | ₹3,800 | 12-Aug-2026 | Cash | REC-0412 | **PAID** |
| **Month 5** | 10-Sep-2026 | ₹5,000 | ₹1,150 | ₹3,850 | - | - | - | **UPCOMING** |
