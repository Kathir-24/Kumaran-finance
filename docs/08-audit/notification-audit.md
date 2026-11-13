# NOTIFICATION & TELECOM DLT COMPLIANCE AUDIT — KUMARAN CHITS
**Kumaran Finance — Perundurai Head Office, Erode District, Tamil Nadu**  
**Audit Stage**: Independent Verification & Notification Systems Audit  
**Date**: November 2026  
**Auditor**: Antigravity Senior Engineering & Audit Swarm  

---

## 1. Notification Architecture & Channel Reality

Customer communication in Kumaran Chits is strictly aligned with the business owner's confirmed operating policy (Q34):
- **Sole Production Channel**: **Indian TRAI DLT-Compliant SMS** via MSG91 flow API.
- **WhatsApp Simulation Channel**: **PURGED & REMOVED**. All mock WhatsApp loggers and placeholder channels were completely excised from `NotificationService` and unit tests to prevent false operational assumptions.
- **Mobile Push Notifications (FCM)**: Disabled in production. Bypassed cleanly while Flutter mobile UI remains parked.

---

## 2. Indian Telecom Regulatory Authority (TRAI) DLT Compliance

All SMS transmissions to Indian mobile numbers adhere to TRAI Commercial Communications Customer Preference Regulations (TCCCPR, 2018):
1. **Registered Principal Entity (PE)**: Kumaran Finance registered on Indian telecom portal (Jio / Airtel / Vodafone-Idea DLT).
2. **Approved Sender ID (Header)**: 6-character registered alphanumeric header (e.g., `KUMCHIT` or `KUMARF`).
3. **Template ID Enforcement**:
   - Every SMS dispatch must provide a registered 19-digit numerical DLT Template ID (e.g., `1407169823412093848`).
   - Omitting the template ID causes `Msg91SmsDriver` to reject the message immediately with `DLT Template ID is required for Indian SMS delivery`.
4. **Phone Formatting & DPDP Privacy Masking**:
   - `PhoneHelper` normalizes inputs to 12-digit Indian MSISDN format (`91XXXXXXXXXX`).
   - Preserves country code and last 4 digits in audit logs (`+91******3210`) per Digital Personal Data Protection Act (DPDP Act, 2023).

---

## 3. Registered Notification Event Templates

| Event Type | DLT Template Name | Key Variables Included | Triggering Service |
|---|---|---|---|
| **OTP Login** | `KUMARAN_AUTH_OTP` | `{#var#}`: 6-digit OTP code, `{#var#}`: 5 min validity | `AuthService.requestOtp` |
| **Payment Receipt** | `KUMARAN_PAYMENT_RECEIPT` | `{#var#}`: Name, `{#var#}`: Rs. Amount, `{#var#}`: Chit Code, `{#var#}`: Receipt No | `PaymentService.recordPayment` |
| **Auction Reminder** | `KUMARAN_AUCTION_REMINDER` | `{#var#}`: Group, `{#var#}`: Month No, `{#var#}`: Date, `{#var#}`: Time, `{#var#}`: Branch | `AuctionService.scheduleAuction` |
| **Default Warning** | `KUMARAN_DEFAULT_WARNING` | `{#var#}`: Name, `{#var#}`: Months Unpaid, `{#var#}`: Overdue Amount, `{#var#}`: Branch Phone | `InstallmentService.checkOverdue` |

---

## 4. Resilience & Circuit Breaker Architecture

SMS gateway outages must never compromise core financial transactions:
1. **Financial Non-Blocking Invariant**:
   - All SMS notifications are wrapped in try-catch or dispatched asynchronously via BullMQ `notification-queue`.
   - If the telecom gateway fails, times out, or returns HTTP 500, the database transaction **still succeeds and commits**.
2. **Circuit Breaker (`CircuitBreaker`)**:
   - Tracks gateway health: trips to `OPEN` after 5 consecutive HTTP 500 / timeout errors.
   - Remains `OPEN` for 30 seconds before attempting `HALF_OPEN` health probe.
   - Prevents cascading thread pool exhaustion during telecom provider downtime.

---

## 5. Test Suite Verification Evidence

| Test Suite | File Path | Invariants Tested | Result |
|---|---|---|---|
| SMS Pluggable Drivers | `test/unit/sms.spec.ts` | MSISDN formatting, DPDP masking, template interpolation, retry backoff | **PASS** (22/22) |
| Distributed Notifications | `test/unit/notification-distributed.spec.ts` | Multi-node queue deduplication, circuit breaker sync via Redis | **PASS** (100%) |
| Circuit Breaker Core | `test/unit/circuit-breaker.spec.ts` | State transitions (`CLOSED` $\to$ `OPEN` $\to$ `HALF_OPEN` $\to$ `CLOSED`) | **PASS** (100%) |
