# Pluggable SMS Notification Engine (TRAI DLT & MSG91)

> **Module**: `apps/api/src/notification/`  
> **Company**: **Kumaran Finance** (Perundurai, Erode, Tamil Nadu)  
> **Compliance**: Telecom Regulatory Authority of India (TRAI) DLT Directives & Indian Digital Personal Data Protection (DPDP) Act 2023  
> **Guiding ADRs**: [ADR-04, ADR-17, ADR-23 (Phase 1 DLT SMS Primary — Zero WhatsApp per `Q34` / `KFC-NOT-001`), ADR-26 (Phase 2 Android FCM Push)](../../../../docs/01-business/decision-log.md) & [Notification Templates Specification](../../../../docs/02-requirements/notification-and-receipt-templates.md)

---

## 1. Overview & Architecture

The **Notification Module** provides a pluggable, carrier-grade TRAI DLT SMS dispatch engine (plus Phase 2 FCM push readiness and async S3 receipt PDF pre-rendering) engineered for domestic Indian chit-fund operations. WhatsApp Business API is permanently excluded (`Q34` / `KFC-NOT-001`).

```text
                      +---------------------------------------+
                      |       BullMQ Background Queues        |
                      | (Receipt / Auction / Default / Alerts)|
                      +---------------------------------------+
                                          |
                                          v
                      +---------------------------------------+
                      |         NotificationService           |
                      | (S3 PDF Pre-Render + Channel Router)  |
                      +---------------------------------------+
                                          |
                                          v
                      +---------------------------------------+
                      |              SmsService               |
                      |  (DLT Formatter + Circuit Breaker)    |
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
1. **Financial Non-Blocking Guarantee**: Financial transactions (cash collections, counter payments, reversals, auction finalizations) must **never** abort or roll back due to telecom gateway failures. `SmsService` catches gateway failures, increments Prometheus telemetry (`kumaran_sms_dispatches_total`, `kumaran_sms_circuit_breaker_state`), and logs safely without throwing uncaught exceptions.
2. **Pluggable Driver Strategy**: Implements `SmsDriver` injected via `SMS_DRIVER_TOKEN`, switching cleanly between `mock` and `msg91` via environment variables (`env.validation.ts` enforces `MSG91_AUTH_KEY` when `SMS_DRIVER=msg91`).
3. **TRAI DLT Exact-Match Compliance**: All outbound SMS messages interpolate registered variables into exact approved DLT templates (`{#var#}`) under registered 6-alpha header `KMRCHT`.
4. **Indian DPDP Act 2023 PII Protection**: All mobile numbers logged to console, Sentry, or notification audit logs are masked (`+91******3210`) via `PhoneHelper.maskPhone()`.
5. **MSISDN Normalization**: Normalizes inputs (`"9842143210"`, `"+91 98421-43210"`, `"09842143210"`) into standard 12-digit Indian telecom format (`"919842143210"`).

---

## 2. Environment Configuration

Validated fail-fast by `apps/api/src/config/env.validation.ts` (`apps/api/.env`):

```env
# Pluggable SMS Notification Engine
SMS_DRIVER=mock                      # 'mock' (dev/test default) or 'msg91' (production DLT)
SMS_SENDER_ID=KMRCHT                 # Registered 6-alpha TRAI DLT Header
SMS_MAX_RETRIES=2                    # In-memory retries for transient gateway errors (500, 408, 429)
SMS_RETRY_BASE_DELAY_MS=400          # Exponential backoff base delay (400ms -> 800ms)
SMS_REQUEST_TIMEOUT_MS=5000          # HTTP socket timeout in ms (default: 5000)
MAX_DAILY_OTP_REQUESTS=5             # Per-phone daily OTP rate cap (default: 5)

# Required when SMS_DRIVER=msg91:
MSG91_AUTH_KEY=your_msg91_authkey_here
MSG91_DLT_TE_ID=your_dlt_telecom_entity_id_here
MSG91_DLT_OTP_TEMPLATE_ID=1407169823412093847
MSG91_DLT_RECEIPT_TEMPLATE_ID=1407169823412093848
MSG91_DLT_AUCTION_TEMPLATE_ID=1407169823412093849
MSG91_DLT_DEFAULT_TEMPLATE_ID=1407169823412093850
MSG91_DLT_AUCTION_RESULT_TEMPLATE_ID=1407169823412093851
```

---

## 3. TRAI DLT Templates Registered (`dlt-templates.constants.ts`)

| # | Purpose | Template ID | Registered Template Text |
|---|---|---|---|
| **1** | **Device OTP** | `1407169823412093847` | `Kumaran Chits: Your one-time verification code is {#var#}. Valid for 5 minutes. Do not share this OTP with anyone. / உங்கள் சரிபார்ப்பு குறியீடு {#var#}. யாருடனும் பகிர வேண்டாம்.` |
| **2** | **Payment Receipt** | `1407169823412093848` | `Kumaran Chits: Received Rs.{#var#} for Chit {#var#}, Ticket #{#var#} on {#var#}. Receipt: {#var#}. View passbook: {#var#}` |
| **3** | **Auction Reminder** | `1407169823412093849` | `Kumaran Chits: Auction for Chit {#var#} Month {#var#} is scheduled on {#var#} at {#var#}. Venue: {#var#}. Contact: {#var#}` |
| **4** | **Default Arrears Notice** | `1407169823412093850` | `Kumaran Chits: Urgent: Ticket #{#var#} in Chit {#var#} has {#var#} months overdue (Rs.{#var#}). Clear dues to avoid membership cancellation. Contact: {#var#}` |
| **5** | **Auction Results & Dividend** | `1407169823412093851` | `Kumaran Chits: Chit {#var#} Month {#var#} auction won at Rs.{#var#} discount. Your dividend credit is Rs.{#var#}. Next month net due is Rs.{#var#}. View details: {#var#}` |

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
      receiptNumber: 'KC-REC-PRD-2026-00001',
      passbookAppUrl: 'https://app.kumaranfinance.in/p/07',
    });

    if (!result.success) {
      // Logged automatically; business flow proceeds uninterrupted
    }
  }
}
```

---

## 5. Multi-Channel Strategy, S3 Receipt Pre-Rendering & Circuit Breaker

1. **Device OTP**: Always dispatched via Indian Telecom TRAI DLT SMS (`1407169823412093847`).
2. **Phase 1 Primary Channel (`ADR-23`)**: Payment receipts, auction reminders, auction results, and arrears warnings dispatch via **bilingual MSG91 TRAI DLT SMS (`KMRCHT`)** for universal reach across both smartphone and rural keypad phones. WhatsApp is permanently excluded (`Q34` / `KFC-NOT-001`).
3. **Phase 2 Cost Optimization (`ADR-26`, Q2 2027)**: Once Android mobile handsets enroll `fcmToken`, `NotificationService` routes eligible alerts push-first via FCM HTTP v1 at ₹0 marginal cost and falls back automatically to TRAI DLT SMS on missing or stale tokens.
4. **Async Queue & S3 Receipt PDF Pre-Rendering (`XR-M8-PAY-01`)**: `PaymentService`, `CollectionService`, and `ReconciliationService` enqueue `JOB_DISPATCH_PAYMENT_RECEIPT` (passing `paymentId`) onto BullMQ `notification-queue`; `NotificationService` pre-renders the bilingual A5 PDF receipt into private S3/R2 before dispatching subscriber notice, keeping HTTP collection latency independent of telecom latency.
5. **Circuit Breaker & Telemetry**: Exports `kumaran_sms_dispatches_total` and `kumaran_sms_circuit_breaker_state` (`0 = CLOSED`, `1 = HALF_OPEN`, `2 = OPEN`) to Prometheus `/metrics`.

---

## 6. Verification & Testing

Verified by **32 automated Jest unit tests** across **3 notification spec files** under `apps/api/test/unit/`:

- `apps/api/test/unit/sms.spec.ts` (**22** tests): Phone normalization, DPDP PII masking, DLT template interpolation, MSG91 flow payloads, timeout/retry backoff, and non-blocking safety.
- `apps/api/test/unit/push.spec.ts` (**7** tests): FCM driver formatting and stale-token cleanup.
- `apps/api/test/unit/notification-distributed.spec.ts` (**3** tests): Distributed BullMQ notification orchestration.

```bash
# Run all Notification unit suites (32 passing tests)
pnpm --filter api test -- test/unit/sms.spec.ts test/unit/push.spec.ts test/unit/notification-distributed.spec.ts

# Run full API unit & integration test suite (63 suites, 1,226 passing tests)
pnpm --filter api test
```
