# Pluggable SMS Notification Engine (TRAI DLT & MSG91)

> **Module**: `apps/api/src/notification/`  
> **Company**: **Kumaran Finance** (Perundurai, Erode, Tamil Nadu)  
> **Compliance**: Telecom Regulatory Authority of India (TRAI) DLT Telecom Directives & Indian Digital Personal Data Protection (DPDP) Act 2023  
> **Guiding ADR**: [ADR-04](../../../docs/01-business/decision-log.md) & [Notification Templates Specification](../../../docs/02-requirements/notification-and-receipt-templates.md)

---

## 1. Overview & Architecture

The **Notification Module** provides an enterprise, pluggable, carrier-grade SMS dispatch system specifically engineered for domestic Indian chit fund operations.

```
                      +---------------------------------------+
                      |       BullMQ Background Queues        |
                      |  (PaymentReceipt / Auction / Default) |
                      +---------------------------------------+
                                          |
                                          v
                      +---------------------------------------+
                      |         NotificationService           |
                      |      (Bilingual Message Router)       |
                      +---------------------------------------+
                                          |
                                          v
                      +---------------------------------------+
                      |              SmsService               |
                      |    (DLT Formatter + Safety Net)       |
                      +---------------------------------------+
                                          |
                                          v
                               [ SMS_DRIVER_TOKEN ]
                                          |
                  +-----------------------+-----------------------+
                  |                                               |
                  v                                               v
      +-----------------------+                       +-----------------------+
      |     MockSmsDriver     |                       |    Msg91SmsDriver     |
      |   (Local Dev & CI)    |                       | (Indian Prod Gateway) |
      |  - In-Memory Queue    |                       |  - HTTPS Flow API     |
      |  - PII Masked Logs    |                       |  - Exponential Backoff|
      |  - Zero Cost / Safe   |                       |  - TRAI DLT Compliant |
      +-----------------------+                       +-----------------------+
```

### Core Design Guarantees
1. **Financial Non-Blocking Guarantee**: Financial transactions (cash collection, payment receipts, ledger updates) must **never** abort or roll back due to third-party telecom gateway failures. `SmsService` wraps all dispatches in safe handlers that log errors and record telemetry without throwing uncaught exceptions.
2. **Pluggable Driver Strategy**: Implements the `SmsDriver` interface injected via `SMS_DRIVER_TOKEN`. Can switch between `mock` and `msg91` via environment configuration without modifying business logic.
3. **TRAI DLT Exact-Match Compliance**: All outbound SMS messages interpolate registered variable values into exact DLT template strings (`{#var#}`) to prevent telecom operator blocking.
4. **Indian DPDP Act 2023 PII Protection**: All mobile numbers logged to console or stored in unencrypted telemetry are masked (`+91******3210`) using `PhoneHelper.maskPhone()`.
5. **MSISDN Normalization**: Normalizes inputs (`"9842143210"`, `"+91 98421-43210"`, `"09842143210"`) into standard 12-digit Indian telecom format (`"919842143210"`).

---

## 2. Environment Configuration

Configure the active driver and credentials in `apps/api/.env`:

```env
# Pluggable SMS Notification Engine
SMS_DRIVER=mock                      # 'mock' (default) or 'msg91'
SMS_SENDER_ID=KMRCHT                 # Registered 6-alpha TRAI DLT Header (KMRCHT)
SMS_MAX_RETRIES=2                    # In-memory retries for transient gateway errors (500, 408, 429)
SMS_RETRY_BASE_DELAY_MS=400          # Exponential backoff base delay (400ms -> 800ms)
SMS_REQUEST_TIMEOUT_MS=15000         # HTTP socket timeout

# Required when SMS_DRIVER=msg91:
MSG91_AUTH_KEY=your_msg91_authkey_here
MSG91_DLT_TE_ID=your_dlt_telecom_entity_id_here
MSG91_DLT_OTP_TEMPLATE_ID=1407169823412093847
MSG91_DLT_RECEIPT_TEMPLATE_ID=1407169823412093848
MSG91_DLT_AUCTION_TEMPLATE_ID=1407169823412093849
MSG91_DLT_DEFAULT_TEMPLATE_ID=1407169823412093850
```

---

## 3. TRAI DLT Templates Registered

| # | Purpose | Template ID | Registered Template Text |
|---|---|---|---|
| **1** | **Device OTP** | `1407169823412093847` | `Kumaran Chits: Your one-time verification code is {#var#}. Valid for 5 minutes. Do not share this OTP with anyone. / உங்கள் சரிபார்ப்பு குறியீடு {#var#}. யாருடனும் பகிர வேண்டாம்.` |
| **2** | **Payment Receipt** | `1407169823412093848` | `Kumaran Chits: Received Rs.{#var#} for Chit {#var#}, Ticket #{#var#} on {#var#}. Receipt: {#var#}. View passbook: {#var#}` |
| **3** | **Auction Reminder** | `1407169823412093849` | `Kumaran Chits: Auction for Chit {#var#} Month {#var#} is scheduled on {#var#} at {#var#}. Venue: {#var#}. Contact: {#var#}` |
| **4** | **Default Arrears Notice** | `1407169823412093850` | `Kumaran Chits: Urgent: Ticket #{#var#} in Chit {#var#} has {#var#} months overdue (Rs.{#var#}). Clear dues to avoid membership cancellation. Contact: {#var#}` |

---

## 4. Usage in Code

### Injecting and Sending SMS
```typescript
import { Injectable } from '@nestjs/common';
import { SmsService } from '../notification/services/sms.service';

@Injectable()
export class MyService {
  constructor(private readonly smsService: SmsService) {}

  async notifySubscriber(phone: string, amount: bigint, chitCode: string, ticketNo: number) {
    const result = await this.smsService.sendPaymentReceiptSms({
      recipientPhone: phone,
      amountPaid: amount,
      chitCode,
      ticketNumber: ticketNo,
      transactionTimestamp: '20-Oct-2026 10:30 AM',
      receiptNumber: 'KC-REC-PRD-2026-0001',
      passbookAppUrl: 'https://app.kumaranfinance.in/p/07',
    });

    if (!result.success) {
      // Logged automatically; business flow proceeds uninterrupted
    }
  }
}
```

---

## 5. Smart Multi-Channel Strategy & Cost Optimization

To minimize telecom expenses while providing 100% reach:
1. **Device OTP**: Always dispatched via Indian Telecom DLT SMS (`1407169823412093847`).
2. **Payment Receipts & Auction Alerts**:
   - **Smartphones with App**: Dispatched via Google Firebase Cloud Messaging (FCM HTTP v1) at **₹0 marginal cost**.
   - **Keypad / Basic Phones**: When subscriber has no active `fcmToken`, automatically falls back to Indian Telecom DLT SMS (`Msg91SmsDriver` / `MockSmsDriver`) ensuring universal delivery across rural Tamil Nadu.
3. **Queue Processing**: Payment receipts enqueued asynchronously via BullMQ's `notification-queue` (`JOB_DISPATCH_PAYMENT_RECEIPT`), completely decoupling user response times from external gateway latencies.

---

## 6. Verification & Testing

Run unit tests verifying phone parsing, PII masking, DLT template interpolation, mock sandboxing, MSG91 HTTP flow formatting, and retry logic:

```bash
# Run SMS test suite
pnpm --filter api test -- test/sms.spec.ts

# Run all API tests (24 suites, 343 unit tests)
pnpm --filter api test
```
