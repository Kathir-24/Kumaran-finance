# BullMQ Automated Background Cron Schedules Guide

> **Module**: `apps/api/src/jobs/`  
> **Company**: **Kumaran Finance** (Perundurai, Erode, Tamil Nadu)  
> **Standard Timezone**: **Indian Standard Time (IST — `Asia/Kolkata` / UTC+05:30)**  
> **Guiding ADRs**: [ADR-04, ADR-07, ADR-10, ADR-12](../../../../docs/01-business/decision-log.md)

---

## 1. Overview & Operational Schedule

Kumaran Chits utilizes **BullMQ Repeatable Jobs** configured to Indian Standard Time (`Asia/Kolkata`) to run financial housekeeping, overdue arrears calculations, and subscriber reminders without requiring manual human triggers:

```
[00:01 AM IST] ---> Daily Midnight Arrears & 3-Month Default Tagging (DailyArrearsService)
                         |
[06:00 AM IST] ---> Daily Payment Settlement Reconciliation (ReconciliationService)
                         |
[09:00 AM IST] ---> Pre-Auction Broadcast Scan: 3 Days Ahead (AuctionReminderSchedulerService)
```

---

## 2. Active Repeatable Cron Jobs Catalog

| # | Job Name | Cron Expression | Time (IST) | Queue | Target Service | Business Action |
|---|---|:---:|:---:|---|---|---|
| **1** | `repeatable-daily-arrears-midnight` | `1 0 * * *` | **00:01 AM** | `daily-maintenance-queue` | [`DailyArrearsService`](file:///u:/Kumaran-finance/apps/api/src/jobs/services/daily-arrears.service.ts) | Transitions past `UNPAID` dues to `OVERDUE`. Identifies members with $\ge 3$ consecutive missed installments, tags status as `DEFAULT_3_MONTHS` per ADR-07, and emits statutory warning alerts. |
| **2** | `repeatable-settlement-reconciliation-morning` | `0 6 * * *` | **06:00 AM** | `reconciliation-queue` | [`ReconciliationService`](file:///u:/Kumaran-finance/apps/api/src/jobs/services/reconciliation.service.ts) | Reconciles bank settlement files against internal payment records. Auto-resolves ghost drops from `INITIATED` to `SUCCESS`. |
| **3** | `repeatable-pre-auction-reminders-morning` | `0 9 * * *` | **09:00 AM** | `notification-queue` | [`AuctionReminderSchedulerService`](file:///u:/Kumaran-finance/apps/api/src/jobs/services/auction-reminder-scheduler.service.ts) | Queries auctions scheduled in exactly 3 days. Dispatches bilingual Mobile Push (FCM) & TRAI DLT SMS notices with branch address and scheduled time. |

---

## 2.1 Dynamic Event-Driven Queue Jobs Catalog

In addition to scheduled cron runs, BullMQ queues handle real-time transactional background events:

| Job Name | Triggering Module | Queue | Target Service | Business Action |
|---|---|---|---|---|
| `JOB_DISPATCH_PAYMENT_RECEIPT` | [`PaymentService`](file:///u:/Kumaran-finance/apps/api/src/payment/payment.service.ts), [`CollectionService`](file:///u:/Kumaran-finance/apps/api/src/collection/collection.service.ts) | `notification-queue` | `NotificationService` | Asynchronously dispatches bilingual payment receipt notification upon commit (FCM Push primary for app users; Telecom DLT SMS fallback for keypad phones). Decouples customer response time from SMS gateway latencies. |

---

## 3. Monitoring & Visual Dashboard

### A. Bull Board Web UI
- **URL**: `http://127.0.0.1:3000/admin/queues`
- **Authentication**: HTTP Basic Auth with credentials configured in `apps/api/.env`:
  - Username: `BULL_BOARD_USER`
  - Password: `BULL_BOARD_PASSWORD`
- **Features**: Visual inspection of waiting, active, completed, and failed jobs with 1-click dead-letter queue (DLQ) retry and stack trace exploration. Queue `defaultJobOptions` cap retained failures at `{ count: 500, age: 604800 }` (500 jobs / 7 days) and auto-remove completed runs (`removeOnComplete: true`) across all 3 IST cron schedules and ad-hoc jobs, while Workers emit explicit `[DLQ]` error logs when retries exhaust.

### B. REST Endpoints for Health & Auditing (Super Admin Strictly)
- `GET /api/v1/jobs/queue-status`: Real-time job counters across all 3 queues (Super Admin only).
- `GET /api/v1/jobs/repeatable-schedules`: Lists registered repeatable jobs, cron patterns, and next scheduled run timestamps (Super Admin only).
- `GET /api/v1/jobs/notification-audit-logs`: Retrieves audit trail of recently dispatched push notifications and DLT SMS messages (Super Admin only).

---

## 4. Manual Override & Testing Endpoints

If staff or developers need to force-run a schedule outside of its cron window:

1. **Force Midnight Arrears**:
   ```bash
   curl -X POST "http://localhost:3000/api/v1/jobs/run-daily-arrears?cutoffDate=2026-10-21" \
     -H "Authorization: Bearer <SUPER_ADMIN_JWT>"
   ```
2. **Force Pre-Auction Scan**:
   ```bash
   curl -X POST "http://localhost:3000/api/v1/jobs/run-pre-auction-scan?targetDate=2026-10-25" \
     -H "Authorization: Bearer <SUPER_ADMIN_JWT>"
   ```

---

## 5. Testing & Verification

Unit tests verifying timezone adherence (`Asia/Kolkata`), schedule registration, and direct fallback execution:

```bash
pnpm --filter api test -- test/jobs.spec.ts
```
