# Observability, Monitoring & Audit Architecture — Master Specification

> **Product**: **Kumaran Chits** (Chit Fund Operations Management System)  
> **Company**: **Kumaran Finance** (Perundurai, Erode District, Tamil Nadu)  
> **Target Audience**: Core Engineering, Security Architects, Compliance Auditors, Vibe Coders & Beginners  
> **Status**: **100% IMPLEMENTED, VERIFIED & LIVE IN REPOSITORY**  
> **Classification**: Core Architectural Document (Companion to [`payment-architecture.md`](payment-architecture.md) and [`security-and-access-guardians.md`](security-and-access-guardians.md))

---

## 1. Executive Summary & Plain-English Overview

In a chit fund platform handling subscribers' hard-earned money, backend operations cannot be a black box. Observability turns your backend from a dark, closed room into a **transparent glass house** where every request, error, background job, and cash mutation is measured, alerted, and permanently recorded.

All four observability pillars in Kumaran Chits are designed to operate at **₹0 cost (100% free / open source)**, with no mandatory paid third-party dependencies.

```mermaid
flowchart TD
    subgraph INGRESS["Client Traffic & Operations"]
        HTTP["Incoming HTTP Requests\n(Web, Mobile, External Ingress)"]
        JOBS["Background BullMQ Jobs\n(SMS Reminders, Arrears Scans, Recon)"]
        MUT["Financial & Dual-Control Actions\n(Payments, Reversals, Payouts)"]
    end

    subgraph P1["Pillar 1: Prometheus Metrics (/metrics)"]
        PM["MetricsService & Registry (prom-client)\nLatency Histograms: p95 <= 200ms (reads), <= 500ms (writes)\nDomain KPIs: Active chits, defaulters, BigInt daily volume"]
        AUTH1["MetricsAuthGuard\n(HTTP Basic Auth Protected)"]
    end

    subgraph P2["Pillar 2: Sentry Error Monitoring"]
        SN["@sentry/nestjs & GlobalExceptionFilter\nSafe-Bypass in Dev/CI (0 overhead when DSN empty)\nDPDP Act 2023 PII Sanitizer (scrubPii)\nBigInt Serialization Safety"]
        TEST["GET /health/sentry-test\n(Intentional 500 crash diagnostic probe)"]
    end

    subgraph P3["Pillar 3: Visual Queue Dashboard"]
        BB["Bull Board UI (/admin/queues)\n3 Monitored Queues: maintenance, notification, recon\nVisual job status, stack traces, and 1-click retry"]
        AUTH2["BullBoardAuthMiddleware\n(HTTP Basic Auth Protected)"]
    end

    subgraph P4["Pillar 4: Regulatory Audit Logging"]
        AL["PostgreSQL 'AuditLog' Table (Append-Only)\nTracks actor, entity, old/new JSONB, timestamp, IP\nImmutable ledger: GET /reports/audit-logs"]
        NL["Notification Audit: GET /jobs/notification-audit-logs\nHistorical delivery logs for FCM Push and DLT SMS"]
    end

    HTTP --> P1
    HTTP --> P2
    JOBS --> P3
    MUT --> P4
```

---

### The Beginner's Guide: The 4 Pillars as a Car Analogy

For a vibe coder or beginner, think of your backend server like a car driving on a highway:

| Pillar | Real-World Analogy | What Problem It Solves | Cost |
|---|---|---|:---:|
| **1. Prometheus (`/metrics`)** | **The Speedometer & Gas Tank Gauge** | Measures how fast the app responds in milliseconds ($p95 \le 200\text{ ms}$) and how much work the server is doing right now. | **₹0 (Free / Open Source)** |
| **2. Sentry (`@sentry/nestjs`)** | **The "Check Engine" Warning Buzzer** | When code crashes, it immediately catches the error, tells you the exact line number, and alerts you before customers notice. | **₹0 (Free Tier / Safe-Bypass)** |
| **3. Bull Board (`/admin/queues`)** | **The Delivery Tracking Screen** | Shows a visual webpage of background tasks (e.g. 500 SMS messages: 480 sent, 20 queued, 0 failed). Allows 1-click retry. | **₹0 (Free / Open Source)** |
| **4. PostgreSQL `AuditLog`** | **The Bank's 24/7 CCTV Camera** | Permanently records who touched the money, who reversed a payment, and who approved a prize disbursement. Nobody can cheat or deny their actions. | **₹0 (Free / Postgres Table)** |

---

## 2. Pillar 1: Prometheus Metrics Exporter (`GET /metrics`)

Managed by [`MetricsModule`](file:///u:/Kumaran-finance/apps/api/src/metrics/metrics.module.ts) using the official `prom-client` library.

### 2.1 Architecture & Cardinality Protection
* **Endpoint**: `GET /metrics` (Exempt from response wrapper via `@BypassEnvelope()`).
* **Security**: Strictly protected by HTTP Basic Authentication via [`MetricsAuthGuard`](file:///u:/Kumaran-finance/apps/api/src/metrics/guards/metrics-auth.guard.ts). Unauthenticated scrapes return `401 Unauthorized` with `WWW-Authenticate: Basic realm="Prometheus Metrics"`.
* **URL Route Normalization ([`HttpMetricsInterceptor`](file:///u:/Kumaran-finance/apps/api/src/metrics/interceptors/http-metrics.interceptor.ts))**:
  - In high-throughput APIs, dynamic paths like `/api/v1/customers/550e8400-e29b-41d4-a716-446655440000` create unique metric labels for every customer, leading to **Prometheus high-cardinality memory exhaustion**.
  - `HttpMetricsInterceptor` normalizes paths using regex: any dynamic UUID or numeric ID is converted to `:id` (e.g. `/api/v1/customers/:id`).
  - Self-metrics exclusion: Requests to `/metrics`, `/health`, `/api/docs`, and `/admin/queues` are ignored to prevent telemetry feedback loops.

### 2.2 Complete Exported Metrics Catalog

```mermaid
classDiagram
    class MetricsService {
        +Counter httpRequestsTotal
        +Histogram httpRequestDurationSeconds
        +Gauge dbConnected
        +Histogram dbQueryDurationSeconds
        +Gauge bullMqQueueJobsCount
        +Gauge activeChitGroupsTotal
        +Gauge activeSubscribersTotal
        +Gauge defaulterTicketsCount
        +Gauge makerCheckerPendingCount
        +Gauge dailyCollectedAmountRupees
        +getMetrics() Promise~string~
    }
```

| Metric Name | Type | Labels | Description & SLA Compliance |
|---|---|---|---|
| `http_requests_total` | Counter | `method`, `route`, `status_code` | Total HTTP requests processed across all endpoints. |
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Latency distribution. Buckets: `[0.01, 0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0]` tailored for **NFR §3** ($p95 \le 200\text{ ms}$ for reads, $\le 500\text{ ms}$ for financial writes). |
| `chitflow_db_connected` | Gauge | — | `1` = PostgreSQL healthy; `0` = database unreachable. |
| `chitflow_db_query_duration_seconds` | Histogram | `model`, `action` | Database query execution time in seconds. |
| `bullmq_queue_jobs_count` | Gauge | `queue`, `status` | Job count per queue (`daily-maintenance-queue`, `notification-queue`, `reconciliation-queue`) and state (`waiting`, `active`, `completed`, `failed`, `delayed`). |
| `chitflow_active_chit_groups_total` | Gauge | — | Total running chit schemes. |
| `chitflow_active_subscribers_total` | Gauge | — | Total active subscriber tickets across all groups. |
| `chitflow_defaulter_tickets_count` | Gauge | `bucket` | Count of overdue subscribers in `1_MONTH` or `3_MONTH_REMOVAL` buckets. |
| `chitflow_maker_checker_pending_count` | Gauge | `type` | Pending dual-control tasks (`PAYMENT_REVERSAL`, `PRIZE_DISBURSEMENT`). |
| `chitflow_daily_collected_amount_rupees`| Gauge | — | Cumulative collections recorded today in **whole integer Rupees (`BigInt`)**. |
| `nodejs_*` | Process | — | Standard V8 heap size, memory RSS, and event-loop lag metrics. |

### 2.3 Prometheus Scrape Configuration (`prometheus.yml`)
```yaml
scrape_configs:
  - job_name: 'kumaran-chits-api'
    scrape_interval: 15s
    scrape_timeout: 10s
    metrics_path: '/metrics'
    basic_auth:
      username: 'admin'
      password: 'chitflow_secret'
    static_configs:
      - targets: ['api:3000']
```

### 2.4 Production Grafana PromQL Recipes
* **95th Percentile Read Latency ($p95 \le 200\text{ ms}$)**:
  ```promql
  histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{method="GET"}[5m])) by (le))
  ```
* **95th Percentile Financial Mutation Latency ($p95 \le 500\text{ ms}$)**:
  ```promql
  histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{method=~"POST|PUT|PATCH"}[5m])) by (le))
  ```
* **Failed Background Queue Jobs Alert**:
  ```promql
  sum(bullmq_queue_jobs_count{status="failed"}) by (queue) > 0
  ```

---

## 3. Pillar 2: Sentry Error Monitoring & Crash Tracking (`@sentry/nestjs`)

Configured in [`apps/api/src/common/sentry/sentry.config.ts`](file:///u:/Kumaran-finance/apps/api/src/common/sentry/sentry.config.ts) and wired into [`GlobalExceptionFilter`](file:///u:/Kumaran-finance/apps/api/src/common/filters/global-exception.filter.ts).

### 3.1 Architectural Guarantees
1. **Safe-Bypass Mode (Zero Cost in Dev & CI)**:
   - When `SENTRY_DSN` is empty or omitted, Sentry initialization exits immediately (`initSentry() === false`).
   - The application runs with **0 external network requests, 0 latency overhead, and 0 crashes**.
2. **Indian DPDP Act 2023 Compliance ([`scrubPii`](file:///u:/Kumaran-finance/apps/api/src/common/sentry/sentry.config.ts#L40))**:
   - Every event passes through `beforeSend` before transmission to external APM.
   - Sensitive credentials are redacted to `[FILTERED]`: `password`, `mpin`, `refreshToken`, `token`, `totpSecret`, `aadhaar`, `pan`, `bankAccountNumber`, `chequeNumber`, `authkey`.
   - Indian mobile numbers are normalized and masked: `9842143210` $\to$ `+91******3210`.
3. **Whole-Rupee `BigInt` Serialization Safety**:
   - Standard JSON serialization crashes when encountering JavaScript `bigint` primitives (`TypeError: Do not know how to serialize a BigInt`).
   - `scrubPii()` recursively converts all `bigint` values to strings before Sentry builds the event envelope.
4. **4xx vs. 5xx Error Separation**:
   - Normal client validation errors (`400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`) are returned to the user without sending alerts to Sentry.
   - Only true unhandled server-side crashes ($\ge 500$) trigger Sentry incident alerts.

### 3.2 Health & Diagnostic Probes
* `GET /health`: Liveness probe returning `{ status: 'ok', sentryActive: boolean, time: ISOString }`.
* `GET /health/sentry-test`: Intentional $500$ crash diagnostic endpoint throwing `InternalServerErrorException('Sentry Verification Diagnostic Test Error')` to verify Sentry event capture in staging.

---

## 4. Pillar 3: Visual Background Queue Telemetry (Bull Board)

Managed by [`BullBoardService`](file:///u:/Kumaran-finance/apps/api/src/jobs/bull-board/bull-board.service.ts) using `@bull-board/api` and `@bull-board/express`.

```mermaid
flowchart LR
    Admin["Partner / Admin Browser"] -->|Basic Auth Credentials| Middleware["BullBoardAuthMiddleware\n(BULL_BOARD_USER / BULL_BOARD_PASSWORD)"]
    Middleware --> UI["Bull Board Express Adapter\n(/admin/queues)"]
    UI --> Q1["daily-maintenance-queue\n(Midnight Arrears, 3M Defaults)"]
    UI --> Q2["notification-queue\n(Receipts, Auction Reminders, DLT SMS)"]
    UI --> Q3["reconciliation-queue\n(Cash Book & Bank Recon)"]
```

### 4.1 Dashboard Capabilities
* **Route**: `http://localhost:3000/admin/queues/`
* **Access Control**: Protected by [`BullBoardAuthMiddleware`](file:///u:/Kumaran-finance/apps/api/src/jobs/bull-board/bull-board-auth.middleware.ts) requiring HTTP Basic Auth.
* **Monitored Queues**:
  1. `daily-maintenance-queue`: Midnight arrears calculation and 3-month default tagging.
  2. `notification-queue`: DLT SMS and FCM push dispatch for receipts and auction reminders.
  3. `reconciliation-queue`: Daily cash book balancing and bank reconciliation.
* **Administrative Controls**:
  - Live inspection of `waiting`, `active`, `completed`, `failed`, and `delayed` jobs.
  - Full stack-trace viewer for failed jobs with input payload inspection.
  - One-click **Retry** and **Clean** buttons to recover from network hiccups without running database scripts.
* **Offline Fallback**: If Redis is temporarily offline during testing, `BullBoardService` boots gracefully in fallback mode without crashing the NestJS server.

---

## 5. Pillar 4: Regulatory & Financial Audit Logging

Operating records in Kumaran Chits are permanently tracked for compliance with the Tamil Nadu Chit Funds Act and statutory auditing guidelines.

### 5.1 Database Schema (`public."AuditLog"`)
```prisma
model AuditLog {
  id         String   @id @default(uuid())
  timestamp  DateTime @default(now())
  userId     String?
  action     String   // e.g., 'PAYMENT_REVERSED', 'SAFETY_PROOF_VERIFIED'
  entityType String   // e.g., 'Payment', 'AuctionWinner', 'CustomerDocument'
  entityId   String
  oldValue   Json?
  newValue   Json?
  ipAddress  String?

  user       User?    @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([entityId])
  @@index([userId])
  @@index([action])
  @@index([timestamp])
}
```

### 5.2 Audited Financial & Dual-Control Actions
Every critical mutation in the codebase automatically writes an append-only entry to `AuditLog`:

| Action Code | Triggering Workflow | Maker-Checker Actor Recorded |
|---|---|---|
| `USER_LOGIN` | Staff or Customer authentication | Caller user ID + IP address |
| `PAYMENT_RECORDED` | Cash or UPI payment entry | Desk Accountant / Field Agent ID |
| `PAYMENT_REVERSAL_REQUESTED` | Maker initiates reversal request | Maker user ID + reason code |
| `PAYMENT_REVERSAL_REJECTED` | Checker rejects reversal | Checker user ID + rejection notes |
| `PAYMENT_REVERSED` | Checker authorizes reversal & due rollback | Checker user ID + restored due ID |
| `SAFETY_PROOF_DOCUMENT_UPLOADED` | Photo of cheques/agreement uploaded | Maker user ID + S3 key |
| `SAFETY_PROOF_VERIFIED` | Maker completes safety checklist | Maker user ID + cheque numbers |
| `DISBURSEMENT_AUTHORIZED` | Checker authorizes prize payout | Checker user ID (`maker != checker`) |
| `DISBURSEMENT_COMMITTED` | Cash/NEFT disbursement released | Disbursing officer user ID |
| `CUSTOMER_DOCUMENT_DELETED` | KYC scan purged from storage | Authorizing admin user ID |

### 5.3 Audit Query Endpoints & Customer Privacy
* **`GET /api/v1/reports/audit-logs`**:
  - Paginated audit trail with filters by `action`, `entityType`, and date range.
  - **Customer Self-Isolation**: If caller has `Role.CUSTOMER`, the service automatically forces `where.userId = currentUser.sub`. Subscribers can **never** view staff actions or other subscribers' records.
  - Super Admin and Auditor have global company-wide read oversight.
* **`GET /api/v1/jobs/notification-audit-logs`**:
  - Detailed audit trail of all outbound FCM Push Notifications and DLT SMS messages, including recipient phone numbers, template IDs, message bodies, timestamps, and delivery status (`DELIVERED` / `FAILED`).

---

## 6. System Probes & Real-Time SSE Streams

* **Liveness & Health Probe (`GET /health`)**:
  - Unauthenticated endpoint for container orchestrators (Kubernetes / ECS / Docker).
  - Returns: `{ "status": "ok", "service": "chitflow-api", "sentryActive": false, "time": "2026-10-25T13:30:00Z" }`.
* **Real-Time Maker-Checker SSE Stream (`GET /api/v1/reports/approvals-stream`)**:
  - Long-lived Server-Sent Events (SSE) connection pushing pending approvals in real-time to connected web dashboards.
  - Configured with Nginx reverse proxy headers `proxy_buffering off; chunked_transfer_encoding on; proxy_read_timeout 24h;` to eliminate gateway dropouts.

---

## 7. Concrete Verification Proofs & Results

All components are verified via automated unit test suites and live server E2E executions:

### 7.1 Automated Jest Unit Tests (**42 / 42 Tests Passing**)

```text
PASS test/metrics.spec.ts     (13 tests)
PASS test/sentry.spec.ts      (10 tests)
PASS test/bull-board.spec.ts  (6 tests)
PASS test/report.spec.ts      (13 tests, including Section 7 AuditLog)

Test Suites: 4 passed, 4 total
Tests:       42 passed, 42 total
Time:        3.642 s
```

#### Key Test Assertions:
1. `metrics.spec.ts`: Default process metrics initialized; `http_requests_total` increments; `MetricsAuthGuard` rejects unauthenticated requests with `401`; route normalizer masks dynamic UUIDs to `:id`.
2. `sentry.spec.ts`: Safe-bypass mode confirmed when `SENTRY_DSN` is empty; DPDP PII sanitizer scrubs passwords, tokens, Aadhaar, and masks phone numbers; `bigint` primitives stringified.
3. `bull-board.spec.ts`: `BullBoardAuthMiddleware` rejects missing or invalid credentials with `401`; valid admin credentials pass; service initializes in clean fallback when Redis is offline.
4. `report.spec.ts`: `AuditLog` queries return filtered results; customer caller is strictly scoped to own user ID (`where.userId = customerUser.sub`).

---

### 7.2 Live Server End-to-End Proofs (Live Postgres, Redis 7 & NestJS)

#### Proof 1: Observability Probes & Scrapes ([`verify-lifecycle-11.ts`](file:///u:/Kumaran-finance/apps/api/scripts/verify-lifecycle-11.ts))
* **Step 2 (`GET /health`)**: Status `200 OK`, response `{ status: 'ok' }`.
* **Step 3 (`GET /health/sentry-test`)**: Status `500 Internal Server Error`, intentional diagnostic crash captured cleanly.
* **Step 4 (`GET /metrics`)**: Scraped with Basic Auth (`admin:chitflow_secret`); verified `http_requests_total`, `chitflow_db_connected`, and `bullmq_queue_jobs_count`.
* **Step 5 (`GET /admin/queues/`)**: Status `200 OK`, returned Bull Board HTML dashboard UI.
* **Step 13 (`GET /jobs/queue-status`)**: Confirmed queue health report across all 3 queues.
* **Step 14 (`GET /jobs/notification-audit-logs`)**: Retrieved recent SMS and Push delivery logs.

#### Proof 2: Live Financial Audit Trail ([`verify-lifecycle-7.ts`](file:///u:/Kumaran-finance/apps/api/scripts/verify-lifecycle-7.ts))
* **Reversal Rejection Audit**:
  ```sql
  SELECT action, "entityId", "userId" FROM public."AuditLog" 
  WHERE "entityId" = '84413ed8...' AND action = 'PAYMENT_REVERSAL_REJECTED';
  -- Output: PAYMENT_REVERSAL_REJECTED | 84413ed8... | ebf67759-bf05-4fa6-b653-577b3f144900
  ```
* **Reversal Approval Audit**:
  ```sql
  SELECT action, "entityId", "userId" FROM public."AuditLog" 
  WHERE "entityId" = '652ad723...' AND action = 'PAYMENT_REVERSED';
  -- Output: PAYMENT_REVERSED | 652ad723... | ebf67759-bf05-4fa6-b653-577b3f144900
  ```

---

## 8. Summary Matrix

| Pillar | Technology | Endpoint / Route | Security Guard | Cost | Status |
|---|---|---|---|:---:|:---:|
| **1. Metrics** | `prom-client` | `GET /metrics` | `MetricsAuthGuard` (Basic Auth) | **₹0** | ✅ 100% Verified |
| **2. Error Tracking** | `@sentry/nestjs` | `GET /health/sentry-test` | Safe-Bypass / DPDP Sanitizer | **₹0** | ✅ 100% Verified |
| **3. Queue UI** | `@bull-board/express` | `GET /admin/queues/` | `BullBoardAuthMiddleware` (Basic Auth) | **₹0** | ✅ 100% Verified |
| **4. Audit Logs** | PostgreSQL `AuditLog` | `GET /reports/audit-logs` | `JwtAuthGuard` + Customer Scoping | **₹0** | ✅ 100% Verified |
| **Liveness Probe** | Core NestJS | `GET /health` | Public / Container Probe | **₹0** | ✅ 100% Verified |
| **Live Alert Stream**| Server-Sent Events | `GET /reports/approvals-stream` | `JwtAuthGuard` (Staff Only) | **₹0** | ✅ 100% Verified |
