# Kumaran Chits — Push Notification Architecture & Operations Guide

> **Product**: **Kumaran Chits** (Kumaran Finance, Perundurai, Tamil Nadu)  
> **Channel**: **Mobile App Push Notifications (Android & iOS)**  
> **Engine**: **Google Firebase Cloud Messaging (FCM HTTP v1)**  
> **Guiding Decisions**: [ADR-10, ADR-12, ADR-17](file:///u:/Kumaran-finance/docs/01-business/decision-log.md)  
> **Core Tenet**: **Push-First Cost Optimizer**. Smartphone users receive ₹0-cost real-time push alerts, while Indian DLT SMS is strictly reserved as a fallback for non-app / keypad phone subscribers.

---

## 1. Quick-Recall Cheat Sheet (30-Second Summary)

If you need to quickly recall how push notifications work in Kumaran Chits:

| Capability / Flow | Mechanism / Endpoint | Service Responsible | Data Payload (`data.type`) | Fail-Safe / Fallback |
|---|---|---|---|---|
| **Payment Receipts** | Dispatched post-transaction via BullMQ | [`NotificationService`](file:///u:/Kumaran-finance/apps/api/src/jobs/services/notification.service.ts) | `RECEIPT`<br>Deep-links to `/passbook` | Falls back to DLT SMS if `fcmToken` is missing or invalid. |
| **Auction Reminders** | 09:00 AM automated scan (3 days prior) | [`AuctionReminderSchedulerService`](file:///u:/Kumaran-finance/apps/api/src/jobs/services/auction-reminder-scheduler.service.ts) | `AUCTION_REMINDER`<br>Deep-links to `/auctions` | Falls back to DLT SMS for keypad phones. |
| **Maker-Checker Payouts** | High-priority push to 4 Partners | [`DisbursementService`](file:///u:/Kumaran-finance/apps/api/src/disbursement/disbursement.service.ts) | `DISBURSEMENT_APPROVAL`<br>Opens fingerprint sign-off | Fallback to SMS alert + Web dashboard queue. |
| **Payment Reversals** | High-priority push to 4 Partners | [`PaymentService`](file:///u:/Kumaran-finance/apps/api/src/payment/payment.service.ts) | `REVERSAL_APPROVAL`<br>Opens reversal review | Fallback to SMS alert + Web dashboard queue. |
| **Staff Token Registration** | `PATCH /api/v1/auth/fcm-token` | [`AuthService`](file:///u:/Kumaran-finance/apps/api/src/auth/auth.service.ts) | Saves token in `public."User"."fcmToken"` | Cleared on `POST /auth/logout` (`fcmToken = null`). |
| **Customer Token Registration** | `PATCH /api/v1/customers/:id/fcm-token` | [`CustomerService`](file:///u:/Kumaran-finance/apps/api/src/customer/customer.service.ts) | Saves token in `public."Customer"."fcmToken"` | Anti-BOLA: Customer cannot update other users' tokens. |
| **Stale Token Self-Healing** | Automatic database pruning | [`PushService`](file:///u:/Kumaran-finance/apps/api/src/notification/services/push.service.ts) | Sets `fcmToken = null` on error | Future messages auto-route to DLT SMS without loss. |

---

## 2. System Architecture & Push-First Routing

```mermaid
flowchart TD
    subgraph TRIGGERS ["Event Triggers"]
        PmtCommit["PaymentService / CollectionService\n(ACID Transaction Committed)"]
        CronScan["BullMQ 09:00 AM IST Cron\n(Pre-Auction Scan 3 Days Ahead)"]
        MakerAction["Disbursement / Reversal Initiated\n(Dual Control Maker Step)"]
    end

    subgraph ROUTER ["Push-First Cost Optimizer (NotificationService)"]
        RouterCheck{"Is recipient fcmToken\npresent in PostgreSQL?"}
    end

    subgraph FCM_TIER ["Primary Channel: PushService (₹0.00 Cost)"]
        PushSvc["PushService\n(Non-blocking & Pruning)"]
        FCMDriver["FirebasePushDriver\n(FCM HTTP v1 Admin SDK)"]
        Channel["Android Channel:\nkumaran_high_importance\n(Sound: default, Priority: high)"]
    end

    subgraph SMS_FALLBACK ["Fallback Channel: SmsService (DLT Route)"]
        SmsSvc["SmsService\n(Msg91 / DLT Gateway)\nStrictly for Keypad / Non-App Users"]
    end

    subgraph CLIENT ["Client Mobile App (Flutter)"]
        AndroidApp["Android Mobile App\n• Background Notification Tray\n• Deep-Link Routing\n• Biometric / MPIN Approval Screen"]
    end

    PmtCommit --> RouterCheck
    CronScan --> RouterCheck
    MakerAction --> RouterCheck

    RouterCheck -->|Yes: Smartphone App User| PushSvc
    RouterCheck -->|No: Keypad Phone User| SmsSvc

    PushSvc --> FCMDriver
    FCMDriver --> Channel
    Channel --> AndroidApp

    FCMDriver -.->|Token Unregistered / Uninstalled| Prune["Auto Pruner:\nUPDATE User/Customer SET fcmToken = NULL"]
    Prune -.->|Next Alert Routes To| SmsSvc
```

---

## 3. The 4 Business Notification Types & Deep-Linking Specifications

All push notifications configure Android Channel ID `kumaran_high_importance`:

### 3.1 Payment Receipt Alert
- **Target Persona**: Chit Subscriber
- **Trigger**: Recorded counter payment or synced doorstep field collection.
- **Title (Bilingual)**: `குமரன் பைனான்ஸ் / Kumaran Finance`
- **Body**: `மாத தவணை தொகை ரூ. {amount} பெறப்பட்டது! ரசீது எண்: {receiptNumber}. / Payment received!`
- **Data Payload**:
  ```json
  {
    "type": "RECEIPT",
    "receiptNumber": "KC-REC-PRD-2026-00014",
    "passbookUrl": "https://app.kumaranfinance.com/passbook/e6dbbcdf-...",
    "chitCode": "KC-LIVE-20M-01"
  }
  ```
- **App Behavior**: Clicking the notification opens the Flutter Digital Passbook screen directly.

### 3.2 Auction Reminder Broadcast
- **Target Persona**: Chit Subscribers in active non-prized schemes
- **Trigger**: 09:00 AM IST BullMQ repeatable cron ([`CRON_PRE_AUCTION_REMINDERS`](file:///u:/Kumaran-finance/apps/api/src/jobs/constants/cron-schedules.constant.ts)).
- **Title**: `குமரன் பைனான்ஸ் / Kumaran Finance`
- **Body**: `சீட்டு {chitCode} மாதம் {month} ஏலம் {date} அன்று நடைபெறும். உச்சவரம்பு தள்ளுபடி: ரூ. {ceiling}.`
- **Data Payload**:
  ```json
  {
    "type": "AUCTION_REMINDER",
    "chitCode": "KC-LIVE-20M-01",
    "installmentMonth": "2",
    "auctionDate": "2026-11-15T11:00:00.000Z",
    "maxDiscountCeiling": "25000"
  }
  ```
- **App Behavior**: Opens the Auction Terms & Schedule screen.

### 3.3 Maker-Checker Prize Disbursement Approval
- **Target Persona**: The 4 Equal Partners (`SUPER_ADMIN`, `BRANCH_MANAGER`)
- **Trigger**: Desk Accountant enters safety proof checklist and requests payout authorization.
- **Title**: `ஒப்புதல் தேவை / Approval Needed`
- **Body**: `சீட்டு {chitCode} பரிசு தொகை ரூ. {netPrize} வழங்க ஒப்புதல் தேவை. / Payout authorization required.`
- **Data Payload**:
  ```json
  {
    "type": "DISBURSEMENT_APPROVAL",
    "auctionId": "a7ba8f15-8e46-4282-ad38-b9a13ef7bcd9",
    "winnerId": "782c1ae7-...",
    "netPrize": "75000"
  }
  ```
- **App Behavior**: Opens Partner Executive Authorization view with cheque photos and 1-second fingerprint unlock.

### 3.4 Payment Reversal Approval
- **Target Persona**: The 4 Equal Partners
- **Trigger**: Desk Accountant submits payment cancellation request.
- **Title**: `ரத்து ஒப்புதல் / Reversal Approval`
- **Body**: `ரசீது {receiptNumber} தொகை ரூ. {amount} ரத்து செய்ய ஒப்புதல் தேவை.`
- **Data Payload**:
  ```json
  {
    "type": "REVERSAL_APPROVAL",
    "reversalId": "rev-8899-...",
    "receiptNumber": "KC-REC-PRD-2026-00016",
    "amount": "3950"
  }
  ```
- **App Behavior**: Opens Dual-Control Reversal review screen.

---

## 4. Token Lifecycle & Cross-Device Security

```mermaid
stateDiagram-v2
    [*] --> DeviceLaunch: User / Customer logs in on Mobile
    DeviceLaunch --> Registered: PATCH /auth/fcm-token or /customers/:id/fcm-token
    Registered --> Active: Receiving Free Push Notifications
    Active --> Stale: App uninstalled / storage cleared
    Stale --> Pruned: FCM returns 'messaging/registration-token-not-registered'
    Pruned --> [*]: fcmToken = NULL (Routes to DLT SMS)
    Active --> LoggedOut: User logs out (POST /auth/logout)
    LoggedOut --> [*]: fcmToken = NULL (Prevents notification leaks)
```

### 4.1 Token Registration Endpoints
1. **Staff Device Registration** ([`auth.controller.ts`](file:///u:/Kumaran-finance/apps/api/src/auth/auth.controller.ts)):
   - `PATCH /api/v1/auth/fcm-token`
   - Payload: `{ "fcmToken": "fcm_token_string..." }`
   - Authenticated: Any active staff user.
2. **Customer Device Registration** ([`customer.controller.ts`](file:///u:/Kumaran-finance/apps/api/src/customer/customer.controller.ts)):
   - `PATCH /api/v1/customers/:id/fcm-token`
   - Payload: `{ "fcmToken": "fcm_token_string..." }`
   - **Anti-BOLA/IDOR Guard**: Role-checked so customers can only register tokens for their own account.
3. **Session Revocation on Logout** ([`auth.service.ts`](file:///u:/Kumaran-finance/apps/api/src/auth/auth.service.ts#L591-L600)):
   - Calling `POST /api/v1/auth/logout` executes:
     ```typescript
     await this.prisma.user.update({
       where: { id: userId },
       data: { refreshTokenHash: null, fcmToken: null },
     });
     ```
   - Eliminates notification leaks to signed-out or shared devices.

### 4.2 Automatic Stale Token Self-Healing ([`push.service.ts`](file:///u:/Kumaran-finance/apps/api/src/notification/services/push.service.ts#L25-L46))
When FCM returns `messaging/registration-token-not-registered` or `messaging/invalid-registration-token`, [`PushService`](file:///u:/Kumaran-finance/apps/api/src/notification/services/push.service.ts) intercepts the response and resets the database row:
```typescript
if (result.tokenInvalid && this.prisma) {
  if (metadata?.userId) {
    await this.prisma.user.update({
      where: { id: metadata.userId },
      data: { fcmToken: null },
    });
    this.logger.log(`Pruned unregistered FCM token for User ${metadata.userId}`);
  }
  if (metadata?.customerId) {
    await this.prisma.customer.update({
      where: { id: metadata.customerId },
      data: { fcmToken: null },
    });
    this.logger.log(`Pruned unregistered FCM token for Customer ${metadata.customerId}`);
  }
}
```
Subsequent dispatches for this user immediately route to Indian Telecom DLT SMS.

---

## 5. Driver Configuration & Environment Setup

Configured in `apps/api/.env`:

```env
# Push Notification Driver: 'firebase' for production; 'mock' for local development & CI
PUSH_DRIVER=mock

# Required when PUSH_DRIVER=firebase:
FIREBASE_PROJECT_ID=kumaran-chits-prod
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@kumaran-chits-prod.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
```

- When `PUSH_DRIVER=mock` or credentials are omitted, [`FirebasePushDriver`](file:///u:/Kumaran-finance/apps/api/src/notification/drivers/firebase-push.driver.ts) logs clear diagnostic simulations and issues synthetic message IDs (`simulated-fcm-...`), ensuring local developers and CI runners never crash.

---

## 6. Mobile Client Flutter Integration Blueprint (`apps/mobile/`)

During the upcoming Flutter mobile client phase, the app will integrate push notifications via standard Google packages:

1. **Flutter Dependencies**:
   - `firebase_core`: Initializing Firebase Admin connection.
   - `firebase_messaging`: FCM token listener and background push handler.
   - `flutter_local_notifications`: Foreground heads-up banners on Android 13+.
2. **Device Startup Flow**:
   ```dart
   // 1. Request Notification Permissions (Android 13+ & iOS)
   NotificationSettings settings = await FirebaseMessaging.instance.requestPermission(
     alert: true,
     badge: true,
     sound: true,
   );

   // 2. Obtain Unique FCM Device Token
   String? token = await FirebaseMessaging.instance.getToken();

   // 3. Register with Backend API
   if (token != null) {
     await apiClient.patch('/auth/fcm-token', data: {'fcmToken': token});
   }

   // 4. Listen for Token Rotations
   FirebaseMessaging.instance.onTokenRefresh.listen((newToken) {
     apiClient.patch('/auth/fcm-token', data: {'fcmToken': newToken});
   });
   ```
3. **Deep-Link Handler**:
   ```dart
   FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
     final type = message.data['type'];
     if (type == 'RECEIPT') {
       router.push('/passbook', extra: message.data['receiptNumber']);
     } else if (type == 'DISBURSEMENT_APPROVAL') {
       router.push('/approvals/disbursement', extra: message.data['winnerId']);
     }
   });
   ```

---

## 7. Concrete Verification Proofs (100% Tested)

### 7.1 Unit & Service Test Proofs

- **Dedicated Push Test Suite** ([`apps/api/test/push.spec.ts`](file:///u:/Kumaran-finance/apps/api/test/push.spec.ts)):
  ```bash
  $ pnpm --filter api test test/push.spec.ts
  PASS apps/api/test/push.spec.ts
    Firebase Cloud Messaging (FCM) Push Driver & PushService Tests
      1. MockPushDriver (Default / CI Mode)
        ✓ should return simulated messageId with token masking
      2. FirebasePushDriver (Simulation & Error Handling)
        ✓ should gracefully fall back to simulation when unconfigured
      3. PushService (Non-Blocking Guarantee & Stale Token Pruning)
        ✓ should dispatch push notification through injected driver
        ✓ should not throw or block execution when driver fails
        ✓ should automatically prune stale fcmToken on User record when tokenInvalid is returned
        ✓ should automatically prune stale fcmToken on Customer record when tokenInvalid is returned
  ```
- **Auth & Logout Token Clearance** ([`apps/api/test/auth.spec.ts`](file:///u:/Kumaran-finance/apps/api/test/auth.spec.ts)):
  ```text
  ✓ User Device FCM Push Token Registration: should register a valid FCM token for the user
  ✓ User Device FCM Push Token Registration: should deregister/clear the FCM token when token is null
  ✓ Session Management: should clear refresh token and fcmToken on logout
  ```
- **Anti-BOLA Customer Token Protection** ([`apps/api/test/customer.spec.ts`](file:///u:/Kumaran-finance/apps/api/test/customer.spec.ts)):
  ```text
  ✓ Customer Device FCM Push Token: should allow customer to update their own FCM token
  ✓ Customer Device FCM Push Token: should allow staff to update customer FCM token
  ✓ Customer Device FCM Push Token: should reject customer attempting to update another customer's FCM token (HTTP 403)
  ```

### 7.2 Live Server Lifecycle Proofs

- **Lifecycle 1** ([`verify-lifecycle-1.ts`](file:///u:/Kumaran-finance/apps/api/scripts/verify-lifecycle-1.ts) Step 3):
  ```text
  --- [3/24] PATCH /auth/fcm-token (Register FCM Device Token) ---
  Status: 200
  Response: {"success":true,"message":"Device FCM token registered successfully.","fcmToken":"fcm-staff-sample-token-..."}
  [PostgreSQL DB Verification]: User ebf67759... fcmToken = 'fcm-staff-sample-token-...'
  ✅ Step 3 PASSED: Device FCM push token registered in PostgreSQL.
  ```
- **Lifecycle 2** ([`verify-lifecycle-2.ts`](file:///u:/Kumaran-finance/apps/api/scripts/verify-lifecycle-2.ts) Step 7):
  ```text
  --- [7/11] PATCH /customers/:id/fcm-token (Register Customer FCM Token) ---
  Status: 200
  Response: {"success":true,"message":"Customer device FCM push token registered successfully."}
  [PostgreSQL DB Verification]: Customer 6cb8a9e8... fcmToken updated in DB.
  ✅ Step 7 PASSED: Customer mobile FCM push token registered.
  ```
- **Lifecycle 11** ([`verify-lifecycle-11.ts`](file:///u:/Kumaran-finance/apps/api/scripts/verify-lifecycle-11.ts) Step 9):
  ```text
  --- [9/15] GET /jobs/notification-audit-logs (Push Notification Audit Trail) ---
  Status: 200
  Total Notification Audit Logs: 4
  Channel Breakdown: PUSH_NOTIFICATION: 4, SMS_DLT: 0
  ✅ Step 9 PASSED: Mobile App Push dispatches audited with zero dropped messages.
  ```
