# BullMQ Automated Background Cron Schedules & Event Queue Guide

> **Module**: `apps/api/src/jobs/`  
> **Company**: **Kumaran Finance** (Perundurai, Erode, Tamil Nadu)  
> **Standard Timezone**: **Indian Standard Time (IST — `Asia/Kolkata` / `UTC+05:30`)**  
> **Broker Policy (`KFC-INF-001`)**: Redis 7 pinned to `--maxmemory 512mb --maxmemory-policy noeviction`  
> **Process Bulkheading**: `chitflow-api` runs producer-only (`ENABLE_BULLMQ_WORKERS="false"`); dedicated `chitflow-worker` executes consumers (`ENABLE_BULLMQ_WORKERS="true"`)  
> **Guiding ADRs**: [ADR-04, ADR-07, ADR-10, ADR-12, ADR-19, ADR-21, ADR-23, ADR-26](../../../../docs/01-business/decision-log.md)

---

## 1. Overview & Operational Schedule

Kumaran Chits utilizes **BullMQ Repeatable Jobs** pinned to Indian Standard Time (`Asia/Kolkata`) to run midnight arrears evaluation, direct UPI settlement reconciliation, and pre-auction reminder broadcasts without manual triggers:

```text
[00:01 AM IST] ---> Daily Midnight Arrears & 3-Month Default Tagging (DailyArrearsService)
                         |
[06:00 AM IST] ---> Daily Direct KVB UPI & Pending Receipt Reconciliation (ReconciliationService)
                         |
[09:00 AM IST] ---> Pre-Auction Broadcast Scan: 3 Days Ahead (AuctionReminderSchedulerService)
```

---

## 2. Active Repeatable Cron Jobs Catalog (3 IST Schedules)

Defined in `apps/api/src/jobs/constants/cron-schedules.constant.ts` and registered by `BullmqQueueProvider`:

| # | Job Name | Cron Expression | Time (IST) | Queue | Target Service | Business Action |
|---|---|:---:|:---:|---|---|---|
| **1** | `repeatable-daily-arrears-midnight` | `1 0 * * *` | **00:01 AM** | `daily-maintenance-queue` | [`DailyArrearsService`](services/daily-arrears.service.ts) | Transitions past `UNPAID` dues to `OVERDUE`. Computes longest contiguous unpaid streak via canonical `arrears.util.ts` (`DEF-13`), tags $\ge 3$ consecutive unpaid months as `DEFAULT_3_MONTHS` per `ADR-07`, and enqueues default warning alerts. |
| **2** | `repeatable-settlement-reconciliation-morning` | `0 6 * * *` | **06:00 AM** | `reconciliation-queue` | [`ReconciliationService`](services/reconciliation.service.ts) | Reconciles direct Karur Vysya Bank (KVB) UPI claim & settlement records against internal `INITIATED` payments (`ADR-19`, zero payment gateway). Updates arrears safely via canonical `arrears.util.ts` (`DEF-M8-REV-01` — never resurrects `REMOVED_DEF_3M` defaulters). |
| **3** | `repeatable-pre-auction-reminders-morning` | `0 9 * * *` | **09:00 AM** | `notification-queue` | [`AuctionReminderSchedulerService`](services/auction-reminder-scheduler.service.ts) | Queries auctions scheduled in exactly 3 days (strictly Months $2..N-1$ per Guardrail 5) and dispatches bilingual notices with branch address and auction time. |

---

## 2.1 Dynamic Event-Driven Queue Jobs Catalog (5 Live Jobs)

Defined in `apps/api/src/jobs/constants/queue-names.constant.ts` and consumed on `notification-queue`:

| # | Constant / Job Name | Triggering Modules | Queue | Business Action |
| :-: |---|---|---|---|
| **1** | `JOB_DISPATCH_PAYMENT_RECEIPT` (`dispatch-payment-receipt`) | `PaymentService`, `CollectionService`, `ReconciliationService` | `notification-queue` | Pre-renders bilingual A5 receipt PDF to private S3/R2 using `paymentId` (`XR-M8-PAY-01`) and dispatches Phase 1 bilingual TRAI DLT SMS (`MSG91` / `KMRCHT`, zero WhatsApp per `Q34`; Phase 2 Q2 2027 Android FCM Push per `ADR-23`/`ADR-26`). |
| **2** | `JOB_DISPATCH_AUCTION_REMINDER` (`dispatch-auction-reminder`) | `JobsController`, `AuctionReminderSchedulerService` | `notification-queue` | Dispatches bilingual upcoming monthly auction reminders to eligible group subscribers. |
| **3** | `JOB_DISPATCH_AUCTION_RESULT` (`dispatch-auction-result`) | `AuctionService` | `notification-queue` | Broadcasts finalized auction winning discount, dividend credit, and next-month $I_{net}$ to subscribers. |
| **4** | `JOB_DISPATCH_DEFAULT_WARNING` (`dispatch-default-warning`) | `DailyArrearsService` | `notification-queue` | Sends statutory arrears warning notices to subscribers reaching default thresholds (`ADR-07`). |
| **5** | `JOB_DISPATCH_APPROVAL_ALERT` (`dispatch-approval-alert`) | Maker–Checker services | `notification-queue` | Notifies distinct Verified Partners of pending dual-control approvals (`Guardrails 10 & 11`). |

---

## 3. Monitoring & Visual Dashboard

### A. Bull Board Web UI (`/admin/queues`)
- **URL**: `http://127.0.0.1:3000/admin/queues` (proxied over HTTPS via Nginx `chitflow.conf`).
- **Authentication (`F11` / Guardrail 11)**:
  - **Primary**: Active `SUPER_ADMIN` JWT session (`Authorization: Bearer`, `?token=`, or `access_token`/`jwt` cookie) verified against live DB `isActive` and Redis `auth:revoked:${sub}`.
  - **Secondary Fallback**: Explicitly configured non-default HTTP Basic Auth (`BULL_BOARD_USER` / `BULL_BOARD_PASSWORD`; insecure default `chitflow_secret` is permanently rejected).
- **Retention & DLQ Policy**: Queue `defaultJobOptions` auto-remove completed jobs (`removeOnComplete: true`) and cap retained failed jobs at `{ count: 500, age: 604800 }` (500 jobs / 7 days) across all 3 queues; workers emit explicit `[DLQ]` error logs when retries exhaust.

### B. REST Endpoints for Health & Auditing (`SUPER_ADMIN` Strictly)
- `GET /api/v1/jobs/queue-status`: Real-time job counters across all 3 queues (`SUPER_ADMIN` only).
- `GET /api/v1/jobs/repeatable-schedules`: Registered `Asia/Kolkata` cron schedules & next run timestamps (`SUPER_ADMIN` only).
- `GET /api/v1/jobs/notification-audit-logs`: Paginated audit trail of dispatched DLT SMS & Push notifications (`SUPER_ADMIN` only).

---

## 4. Manual Override & Operational Trigger Endpoints

All 6 manual triggers exposed by `JobsController` (`apps/api/src/jobs/jobs.controller.ts`):

1. **Daily Arrears (Sync / Async)**:
   - `POST /api/v1/jobs/run-daily-arrears?cutoffDate=YYYY-MM-DD` (`SUPER_ADMIN`, `BRANCH_MANAGER`)
   - `POST /api/v1/jobs/enqueue-daily-arrears` (`SUPER_ADMIN` only)
2. **Pre-Auction & Targeted Reminders**:
   - `POST /api/v1/jobs/run-pre-auction-scan?targetDate=YYYY-MM-DD` (`SUPER_ADMIN`, `BRANCH_MANAGER`)
   - `POST /api/v1/jobs/send-auction-reminder/:chitGroupId/:month` (`SUPER_ADMIN`, `BRANCH_MANAGER`; strictly Months $2..N-1$ & branch-scoped)
3. **Direct UPI Settlement Reconciliation (Sync / Async)**:
   - `POST /api/v1/jobs/run-reconciliation` (`SUPER_ADMIN`, `ACCOUNTANT`)
   - `POST /api/v1/jobs/enqueue-reconciliation` (`SUPER_ADMIN`, `ACCOUNTANT`)

---

## 5. Testing & Verification

Verified by **37 automated Jest unit tests** + **18 PostgreSQL 17 E2E tests**:

- `apps/api/test/unit/jobs.spec.ts` (**22** tests): IST cron registration, queue status, arrears/reconciliation/reminder execution, and offline fallback.
- `apps/api/test/unit/queue-resilience.spec.ts` (**15** tests): Bounded `removeOnFail`, retry backoff, `[DLQ]` logging, and Redis outage isolation.
- `apps/api/test/e2e/05-disbursements-jobs.e2e-spec.ts` (**18** E2E tests): End-to-end RBAC & live execution proofs.

```bash
pnpm --filter api test -- test/unit/jobs.spec.ts test/unit/queue-resilience.spec.ts
```
