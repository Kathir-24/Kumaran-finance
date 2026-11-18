# Firebase Cloud Messaging (FCM HTTP v1) Push Driver Operations Guide

> **Module**: `apps/api/src/notification/`  
> **Company**: **Kumaran Finance** (Perundurai, Erode, Tamil Nadu)  
> **Channel**: Android Mobile App Push Notifications *(Phase 2 Q2 2027 Activation per `ADR-26`; backend driver & token APIs live)*  
> **Guiding ADRs**: [ADR-10, ADR-12, ADR-17, ADR-23, ADR-26](../../../../docs/01-business/decision-log.md)

> [!IMPORTANT]
> **Phase 1 vs Phase 2 Rollout (`ADR-23` / `ADR-26`)**: In **Phase 1**, Kumaran Chits operates via the Next.js Responsive Web Portal with **bilingual MSG91 TRAI DLT SMS (`KMRCHT`)** as the primary notification channel (WhatsApp Business API is permanently excluded per `Q34` / `KFC-NOT-001`). Flutter Android mobile UI/APK packaging and live FCM push delivery activate in **Phase 2 (Q2 2027)**; the backend `PushService`, `FirebasePushDriver`, and token registration endpoints (`PATCH /api/v1/auth/fcm-token`, `PATCH /api/v1/customers/:id/fcm-token`) are already implemented, tested, and ready.

---

## 1. Overview & Architecture

The **FCM Push Driver** provides real-time, zero-marginal-cost Android push notification delivery once handsets enroll `fcmToken` in Phase 2, supporting two core business flows:

1. **Instant Maker–Checker Approvals (The 4 Verified Partners)**:
   - When Desk Staff verifies safety proofs on a finalized auction (`apps/api/src/disbursement/`, Module 6) or Verified Partner A initiates a payment reversal (`apps/api/src/payment/`, Module 5/8 — strictly Verified Partner `isPartner: true` per `KFC-SEC-001` / Guardrail 11), a distinct Verified Partner B receives a high-priority Android push alert (`channelId: 'kumaran_high_importance'`) to inspect attachments and authorize dual-control completion.
2. **Digital Passbook & Auction Alerts (Chit Subscribers)**:
   - When an installment is settled at the doorstep or office counter, subscribers with an enrolled `fcmToken` receive an instant push notification deep-linking to `/passbook` with receipt details; subscribers without an enrolled token automatically receive **TRAI DLT SMS**.

```text
                      +---------------------------------------+
                      |         NotificationService           |
                      | (Phase 1: TRAI DLT SMS | Phase 2: FCM)|
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
 | - Zero Setup / Safe   |       | - Android FCM Auth    |
 +-----------------------+       +-----------------------+
```

---

## 2. Environment Configuration

Configure the active push driver in `apps/api/.env`:

```env
# Push Notification Driver
PUSH_DRIVER=mock                     # 'mock' (Phase 1 default) or 'firebase' (Phase 2 Android activation)

# Required when PUSH_DRIVER=firebase:
FIREBASE_PROJECT_ID=kumaran-chits-prod
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@kumaran-chits-prod.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
```

> [!NOTE]
> If `PUSH_DRIVER=firebase` is selected without credentials on a developer workstation, `FirebasePushDriver` logs a diagnostic warning and safely operates in simulation fallback mode without crashing financial workflows.

---

## 3. Automatic Stale Token Invalidation & Logout Safety

Mobile subscribers frequently uninstall apps, clear device storage, or switch handsets. When FCM responds with:
- `messaging/registration-token-not-registered`
- `messaging/invalid-registration-token`

[`PushService`](services/push.service.ts) automatically catches the invalidation and clears `fcmToken = null` on the respective `User` or `Customer` row in PostgreSQL. Additionally, calling `POST /api/v1/auth/logout` clears `fcmToken = null` immediately so Maker–Checker approval alerts never leak onto a signed-out handset.

**Result**: Subsequent notifications automatically route to **TRAI DLT SMS (`MSG91` / `KMRCHT`)**, guaranteeing zero dropped financial notices.

---

## 4. Deep-Linking Scheme & Android High-Priority Channel

All push messages configure Android High-Priority channel `kumaran_high_importance` (`apps/api/src/notification/drivers/firebase-push.driver.ts`):

| Notification Type | Title | Deep-Link Payload (`data.type`) | Target Phase 2 Action |
|---|---|---|---|
| **Payment Receipt** | `குமரன் பைனான்ஸ் / Kumaran Finance` | `RECEIPT` (`passbookUrl`, `receiptNumber`) | Opens Digital Passbook (`/passbook`) |
| **Auction Reminder** | `குமரன் பைனான்ஸ் / Kumaran Finance` | `AUCTION_REMINDER` (`chitCode`, `month`) | Opens Auction Schedule (`/auctions`) |
| **Maker–Checker Payout** | `ஒப்புதல் தேவை / Approval Needed` | `DISBURSEMENT_APPROVAL` (`winnerId`) | Opens Partner Payout Authorization Screen |
| **Payment Reversal** | `ரத்து ஒப்புதல் / Reversal Approval` | `REVERSAL_APPROVAL` (`reversalId`) | Opens Verified Partner Dual-Control Review Screen |

---

## 5. Testing & Verification

Verified by **10 automated Jest unit tests** across **2 spec files** under `apps/api/test/unit/`:

- `apps/api/test/unit/push.spec.ts` (**7** tests): Mock/Firebase dispatch, `kumaran_high_importance` payload shaping, stale token invalidation clearing `fcmToken`, and non-blocking error handling.
- `apps/api/test/unit/notification-distributed.spec.ts` (**3** tests): Distributed BullMQ notification routing & multi-channel fallback.

```bash
pnpm --filter api test -- test/unit/push.spec.ts test/unit/notification-distributed.spec.ts
```
