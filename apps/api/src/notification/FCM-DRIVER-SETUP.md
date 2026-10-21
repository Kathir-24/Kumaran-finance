# Firebase Cloud Messaging (FCM HTTP v1) Push Driver Operations Guide

> **Module**: `apps/api/src/notification/`  
> **Company**: **Kumaran Finance** (Perundurai, Erode, Tamil Nadu)  
> **Channel**: Mobile App Push Notifications (Android & iOS)  
> **Guiding ADRs**: [ADR-10, ADR-12, ADR-17](../../../docs/01-business/decision-log.md)

---

## 1. Overview & Architecture

The **FCM Push Driver** provides real-time, zero-cost mobile push notification delivery for Kumaran Chits. It powers two vital business flows:

1. **Instant Maker-Checker Approvals (The 4 Partners)**:
   - When a Desk Accountant initiates a prize disbursement ([Module 8](file:///u:/Kumaran-finance/apps/api/src/disbursement/)) or payment reversal ([Module 7](file:///u:/Kumaran-finance/apps/api/src/payment/)), the checker Partner receives an instant, high-priority Android push alert to inspect cheque photos and approve with a 1-second fingerprint scan.
2. **Digital Passbook & Auction Alerts (Chit Subscribers)**:
   - When an installment is paid at the doorstep or office, smartphone users receive an instant push notification deep-linking directly to `/passbook` with receipt details, saving recurring SMS charges.

```
                      +---------------------------------------+
                      |         NotificationService           |
                      |   (Push-First Cost Optimizer Router)  |
                      +---------------------------------------+
                                          |
                        Is subscriber fcmToken registered?
                                /                   \
                             [Yes]                 [No]
                              /                       \
                             v                         v
               +-----------------------+   +-----------------------+
               |      PushService      |   |      SmsService       |
               | (Stale Token Pruning) |   | (TRAI DLT SMS Engine) |
               +-----------------------+   +-----------------------+
                             |
                   [ PUSH_DRIVER_TOKEN ]
                             |
             +---------------+---------------+
             |                               |
             v                               v
 +-----------------------+       +-----------------------+
 |     MockPushDriver    |       |  FirebasePushDriver   |
 |  (Local Dev & CI)     |       | (Production FCM v1)   |
 | - In-Memory Queue     |       | - Firebase Admin SDK  |
 | - Token Masking Logs  |       | - High Priority Sound |
 | - Zero Setup / Safe   |       | - APNs + Android Auth |
 +-----------------------+       +-----------------------+
```

---

## 2. Environment Configuration

Configure the active push driver in `apps/api/.env`:

```env
# Push Notification Driver
PUSH_DRIVER=mock                     # 'mock' (default) or 'firebase'

# Required when PUSH_DRIVER=firebase:
FIREBASE_PROJECT_ID=kumaran-chits-prod
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@kumaran-chits-prod.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
```

> [!NOTE]
> If `PUSH_DRIVER=firebase` is selected but credentials are omitted in developer workstations, `FirebasePushDriver` logs a clear diagnostic warning and safely operates in simulation fallback mode without crashing.

---

## 3. Automatic Stale Token Invalidation

Mobile subscribers frequently uninstall apps, clear device storage, or switch smartphones. When FCM responds with:
- `messaging/registration-token-not-registered`
- `messaging/invalid-registration-token`

The [`PushService`](file:///u:/Kumaran-finance/apps/api/src/notification/services/push.service.ts) automatically catches the invalidation and clears `fcmToken = null` on the respective `User` or `Customer` database row in PostgreSQL.

**Result**: Subsequent notifications for that subscriber or staff automatically route to **TRAI DLT SMS**, ensuring zero dropped financial messages.

---

## 4. Deep-Linking Scheme & Android High-Priority Channel

All push messages configure Android High-Priority channel `kumaran_high_importance`:

| Notification Type | Title | Deep-Link Payload (`data.type`) | Action upon Tap |
|---|---|---|---|
| **Payment Receipt** | `குமரன் பைனான்ஸ் / Kumaran Finance` | `RECEIPT` (`passbookUrl`, `receiptNumber`) | Opens Flutter Digital Passbook (`/passbook`) |
| **Auction Reminder** | `குமரன் பைனான்ஸ் / Kumaran Finance` | `AUCTION_REMINDER` (`chitCode`, `month`) | Opens Auction Schedule (`/auctions`) |
| **Maker-Checker Payout** | `ஒப்புதல் தேவை / Approval Needed` | `DISBURSEMENT_APPROVAL` (`winnerId`) | Opens Fingerprint Authorization Screen |
| **Payment Reversal** | `ரத்து ஒப்புதல் / Reversal Approval` | `REVERSAL_APPROVAL` (`reversalId`) | Opens Dual-Control Review Screen |
