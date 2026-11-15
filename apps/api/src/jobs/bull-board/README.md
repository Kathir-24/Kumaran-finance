# Bull Board Background Queue Monitor

> **Package**: `@bull-board/api` & `@bull-board/express`  
> **Route**: `/admin/queues` (Super Admin JWT Session / HTTP Basic Auth fallback)  
> **Access Level**: `SUPER_ADMIN` (Strictly Super Admin Identity)  
> **Compliance**: [`docs/01-business/permissions-matrix.md`](../../../../../docs/01-business/permissions-matrix.md) §1 & §2, [`docs/03-architecture/security-and-access-guardians.md`](../../../../../docs/03-architecture/security-and-access-guardians.md) §7.10 (F11 Remediation)  

---

## 1. Overview

The Bull Board Queue Monitor provides a visual web interface mounted at `/admin/queues` to inspect, manage, and monitor the three core BullMQ background queues powering Kumaran Chits:

1. **`daily-maintenance-queue`**:
   - Executes daily midnight overdue installment recalculation.
   - Tags 3-month consecutive defaulters for company removal rights per ADR-07.
2. **`notification-queue`**:
   - Dispatches In-App Mobile Push Notifications with Indian Telecom DLT SMS fallback for keypad phones.
   - Broadcasts upcoming monthly auction reminders.
   - Sends default warning notices to subscribers entering arrears.
3. **`reconciliation-queue`**:
   - Executes the daily 06:00 AM payment settlement reconciliation.
   - Detects and auto-resolves payment gateway ghost drops.

---

## 2. Security & Authentication Architecture

In strict adherence to the **Maker-Checker & Super Admin access governance** mandated in [`docs/01-business/permissions-matrix.md`](../../../../../docs/01-business/permissions-matrix.md) and security remediation **F11**, access to `/admin/queues` is restricted strictly to verified Super Admin sessions:

```mermaid
flowchart TD
    Req["Request: GET /admin/queues\n(Header / Query / Cookie)"] --> Middleware["BullBoardAuthMiddleware"]
    Middleware --> HasJWT{"Super Admin JWT\nPresent & Valid?"}
    HasJWT -->|Yes| RevokeCheck{"Session Revoked\nor Inactive?"}
    RevokeCheck -->|No| Allow["200 OK — Render Bull Board UI"]
    RevokeCheck -->|Yes| Deny401["401 Unauthorized\n(Session Revoked)"]
    HasJWT -->|No / Invalid| CheckBasic{"Configured Basic Auth\nProvided & Non-Default?"}
    CheckBasic -->|Yes| Allow
    CheckBasic -->|No / Default| DenyBasic["401 Unauthorized\n(Active Super Admin Session Required)"]
```

### Authentication Mechanisms
1. **Primary Authentication (Super Admin JWT Session)**:
   - Validates active `Role.SUPER_ADMIN` access tokens delivered via `Authorization: Bearer <token>`, query param `?token=<token>`, or browser cookies (`access_token` or `jwt`).
   - Asserts real-time user status (`user.isActive`) and verifies fast-path Redis revocation cutoffs (`auth:revoked:${sub}`) on every dashboard navigation. Non-Super Admin roles receive `403 Forbidden`.
2. **Secondary Fallback (HTTP Basic Auth)**:
   - Evaluated ONLY IF explicitly configured with strong, non-default credentials via `BULL_BOARD_USER` and `BULL_BOARD_PASSWORD`.
   - The insecure development fallback password `chitflow_secret` is permanently rejected across all environments under F11.

---

## 3. Ingress Reverse Proxy Configuration

When running through the production Nginx reverse proxy, `/admin/queues` is configured with WebSocket and SSE support in [`infra/docker/nginx/conf.d/chitflow.conf`](../../../../../infra/docker/nginx/conf.d/chitflow.conf):

```nginx
location /admin/queues {
    proxy_pass http://api_upstream/admin/queues;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}
```

---

## 4. Key Administrative Capabilities

Inside the dashboard, Super Admins can:
1. **View Real-Time Counters**: Inspect active, waiting, completed, delayed, and failed job counts across all 3 queues.
2. **Inspect Job Data & Payloads**: Click into any job to view input parameters, execution start time, duration, and worker logs.
3. **Retry Failed Jobs**: One-click manual retry for failed notifications or gateway reconciliations. Failed jobs are capped automatically via BullMQ `removeOnFail: { count: 500, age: 604800 }` (retaining up to 500 recent failures or 7 days per queue) so DLQ entries remain actionable without unbounded Redis memory growth.
4. **Purge Completed / Failed Jobs**: Clean up historical jobs manually in addition to automated completion (`removeOnComplete: true`) and bounded failure pruning (`removeOnFail: { count: 500, age: 604800 }`).

---

## 5. Automated Test Verification

The Bull Board subsystem is verified by automated test suites in [`apps/api/test/bull-board.spec.ts`](../../../test/bull-board.spec.ts):
- Rejects unauthenticated requests with `401 Unauthorized`.
- Rejects invalid passwords with `401 Unauthorized`.
- Authorizes valid Super Admin credentials.
- Binds active BullMQ queues cleanly in both connected and offline fallback modes.
