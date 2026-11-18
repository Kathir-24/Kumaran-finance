# Kumaran Chits — Comprehensive Troubleshooting Guide

> **Product**: **Kumaran Chits** (Kumaran Finance, Perundurai, Tamil Nadu)  
> **Scope**: Diagnostic runbooks and remedies for all operational, infrastructural, database, financial, and development failure modes across the entire platform.

---

## 1. Quick Diagnostic Decision Matrix

```mermaid
flowchart TD
    Start([Encountered an Error]) --> CheckType{Where did it occur?}
    
    CheckType -->|Containers & Ports| CatA[Category A: Docker & Ports]
    CheckType -->|Database & Migrations| CatB[Category B: PostgreSQL & Prisma]
    CheckType -->|S3 & Document Storage| CatC[Category C: S3 & MinIO Storage]
    CheckType -->|Background Queues| CatD[Category D: BullMQ & Redis]
    CheckType -->|Financial & Business Logic| CatE[Category E: Invariants & Guardrails]
    CheckType -->|Auth & Permissions| CatF[Category F: JWT & RBAC]
    CheckType -->|PowerShell & Windows| CatG[Category G: Tooling & CLI]
    CheckType -->|Nginx & Gateway| CatH[Category H: Ingress & CORS]

    CatA --> Resolve([Apply Section Remediation])
    CatB --> Resolve
    CatC --> Resolve
    CatD --> Resolve
    CatE --> Resolve
    CatF --> Resolve
    CatG --> Resolve
    CatH --> Resolve
```

---

## Category A: Docker & Container Infrastructure Failures

### A.1. Port Collision (`bind: address already in use`)
- **Symptoms**: `Error response from daemon: driver failed programming external connectivity on endpoint chitflow-db: bind: address already in use: 0.0.0.0:5433` (or port `6379`, `9000`, `9001`, `80`).
- **Root Cause**: A leftover background instance of PostgreSQL, Redis, MinIO, or host service is already listening on that port.
- **Remedy**:
  ```powershell
  # 1. Identify which process is holding the port (e.g. port 5433)
  netstat -ano | findstr :5433

  # 2. Kill the conflicting PID (replace <PID> with number from column 5)
  Stop-Process -Id <PID> -Force

  # 3. If port is held by orphan docker container:
  docker stop $(docker ps -q)
  pnpm docker:up
  ```

### A.2. Docker Daemon Not Running
- **Symptoms**: `error during connect: This error may indicate that the docker daemon is not running.`
- **Root Cause**: Docker Desktop is not started, or the WSL2 Linux subsystem backend crashed.
- **Remedy**:
  ```powershell
  # Start Docker Desktop on Windows
  Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"

  # Or restart the WSL2 engine
  wsl --shutdown
  ```

### A.3. MinIO Image Deprecation & Distroless Startup
- **Symptoms**: `pull access denied for minio/minio, repository does not exist or may require 'docker login'`
- **Root Cause**: Legacy Docker Hub MinIO images now require authentication or are deprecated.
- **Remedy**: Use the official Chainguard drop-in image configured in [`infra/docker/docker-compose.yml`](file:///u:/Kumaran-finance/infra/docker/docker-compose.yml):
  ```yaml
  image: cgr.dev/chainguard/minio:latest
  ```
  *(Note: Do not attach `minio/mc` shell scripts; the backend TypeScript drivers handle bucket auto-initialization autonomously).*

---

## Category B: Database & Prisma ORM Failures

### B.1. Database Connection Refused (`Can't reach database server at 127.0.0.1:5433`)
- **Symptoms**: `PrismaClientInitializationError: Can't reach database server at 127.0.0.1:5433`
- **Root Cause**: Container `chitflow-db` is stopped, still booting, or `.env` points to the wrong port.
- **Remedy**:
  ```powershell
  # Check if container is running and healthy
  docker ps --filter "name=chitflow-db"

  # If not running, start container:
  pnpm docker:up

  # Verify connection string in apps/api/.env:
  # DATABASE_URL="postgresql://chitflow:chitflow_dev_only@127.0.0.1:5433/chitflow_dev?schema=public"
  ```

### B.2. Migration Drift or Schema Drift (`P3005: The database schema is not empty`)
- **Symptoms**: `prisma migrate dev` halts reporting pending changes or conflict.
- **Root Cause**: Manual schema edits were applied directly to PostgreSQL without generating a migration.
- **Remedy**:
  ```powershell
  # Synchronize schema without losing seed data:
  pnpm run prisma:migrate

  # If developing in a dirty branch and a complete wipe is acceptable:
  pnpm --filter api exec prisma migrate reset --force
  pnpm run prisma:seed
  ```

### B.3. Unique Constraint Violation on Seed (`P2002`)
- **Symptoms**: `Unique constraint failed on the fields: (chitGroupId, customerId)` (ADR-13).
- **Root Cause**: Attempting to insert a subscriber ticket for a customer who already holds a ticket in that exact same chit group.
- **Remedy**: A customer can hold tickets across multiple chit groups, but strictly **max 1 ticket** per individual chit group. Assign a different customer or different chit group.

---

## Category C: S3 Object Storage & Backup Automation Failures

### C.1. Server-Side Encryption Unsupported on MinIO (`NotImplemented: KMS not configured`)
- **Symptoms**: `NotImplemented: Server side encryption specified but KMS is not configured` when uploading or running backups.
- **Root Cause**: Cloud S3 providers natively handle server-side encryption, but local MinIO requires external KMS/KES services if SSE is passed explicitly without KMS configured.
- **Remedy**:
  - The system dynamically detects `endpoint` / `S3_ENDPOINT`:
    - When `S3_ENDPOINT` is configured (local MinIO / Cloudflare R2), `ServerSideEncryption` is automatically bypassed.
    - When running without custom `S3_ENDPOINT`, `AES256` is strictly enforced.
  - Verify your [`apps/api/.env`](file:///u:/Kumaran-finance/apps/api/.env) has:
    ```ini
    STORAGE_DRIVER=s3
    S3_ENDPOINT=http://127.0.0.1:9000
    S3_FORCE_PATH_STYLE=true
    ```

### C.2. S3 Bucket Does Not Exist (`NoSuchBucket`)
- **Symptoms**: `NoSuchBucket: The specified bucket does not exist`
- **Root Cause**: Fresh MinIO volume started without creating `kumaran-chits-private`.
- **Remedy**:
  - Both [`S3StorageDriver`](file:///u:/Kumaran-finance/apps/api/src/storage/drivers/aws-s3-storage.driver.ts) and [`backup-to-s3.ts`](file:///u:/Kumaran-finance/apps/api/scripts/ops/backup-to-s3.ts) feature self-healing `ensureBucketExists()` routines via `HeadBucketCommand` and `CreateBucketCommand`.
  - To manually verify or recreate via MinIO Web Console: open [http://localhost:9001](http://localhost:9001) (`chitflow_admin` / `chitflow_storage_secret`) and create bucket `kumaran-chits-private`.

### C.3. Clock Skew Error (`RequestTimeTooSkewed`)
- **Symptoms**: `RequestTimeTooSkewed: The difference between the request time and the current time is too large.`
- **Root Cause**: Host OS clock (Windows) drifted out of sync with Docker VM clock after system sleep/hibernate.
- **Remedy**:
  ```powershell
  # Resynchronize Windows system clock
  w32tm /resync

  # Restart Docker engine
  wsl --shutdown
  pnpm docker:up
  ```

---

## Category D: BullMQ & Redis Job Queue Failures

### D.1. Redis Offline Fallback (`ECONNREFUSED 127.0.0.1:6379`)
- **Symptoms**: Warning in logs: `[BullMqQueueProvider] Redis client not available. Operating BullMQ queues in direct-execution mode.`
- **Design Behavior**: The system is designed with **zero hard failure on Redis outage**. When Redis is offline, jobs execute in-process directly via fallback mode (`BullMqQueueProvider`).
- **Remedy to Restore Queued Mode**:
  ```powershell
  docker start chitflow-redis
  ```

### D.2. Bull Board Queue Monitor Returns `401 Unauthorized` or `403 Forbidden`
- **Symptoms**: Navigating to `http://localhost:3000/admin/queues` returns `401 Unauthorized` or prompts for credentials.
- **Root Cause**: Missing active Super Admin session or invalid Basic Auth credentials.
- **Remedy**:
  - **Primary Access (Super Admin Session)**: Log into the Web Operations Portal (`http://localhost:3001`) as Super Admin (`9876543210`). The browser session cookie (`access_token` or `jwt`, [`bull-board-auth.middleware.ts:101-108`](file:///u:/Kumaran-finance/apps/api/src/jobs/bull-board/bull-board-auth.middleware.ts#L101-L108)) or passing `?token=<access_token>` in the URL grants immediate access.
  - **Secondary Access (Basic Auth)**: If using Basic Auth, ensure non-default credentials are set in `.env` (`BULL_BOARD_USER` and `BULL_BOARD_PASSWORD`). Note that the insecure default `chitflow_secret` is strictly rejected by the server under F11.

### D.3. Inspecting Active Redis OTP Sessions & Background Queues
- **Symptoms**: Need to debug or audit active 6-digit SMS OTP sessions or check if receipt jobs are enqueued.
- **Diagnostic Commands via Redis CLI**:
  ```powershell
  # 1. Inspect all active OTP sessions in Redis (300s TTL)
  docker exec -it chitflow-redis redis-cli keys "auth:otp:*"

  # 2. View specific OTP payload (hashedOtp and failed attempt counter)
  docker exec -it chitflow-redis redis-cli get "auth:otp:9842100101"

  # 3. Check remaining TTL (seconds until automatic expiration)
  docker exec -it chitflow-redis redis-cli ttl "auth:otp:9842100101"

  # 4. View BullMQ notification-queue jobs
  docker exec -it chitflow-redis redis-cli keys "bull:notification-queue:*"
  ```
- **Web UI Alternative**: Open [http://localhost:3000/admin/queues](http://localhost:3000/admin/queues) to inspect, pause, or retry jobs in real time.

---

## Category E: Financial Invariants & Domain Guardrail Rejections

The **11 Invariant Architectural Guardrails** (`AGENTS.md`) reject invalid transactions by design:

| Guardrail Rejected | HTTP Status & Error Message | Root Cause | Legitimate Operator Action |
|---|---|---|---|
| **Maker $\ne$ Checker** | `403 Forbidden`<br>`Maker and checker cannot be the same user` | The user approving a reversal, payout, removal, or auction is the same user who initiated it (enforced in app + 8 DB `CHECK` constraints). | Have a different verified Partner (`isPartner: true`) review and approve the request. |
| **Verified Partner Identity (Guardrail 11 / ADR-21)** | `403 Forbidden`<br>`PARTNER_ONLY_ACTION` / `SUPER_ADMIN_REQUIRED` | Non-Partner IT Super Admin (`isPartner: false`) attempted a financial authorization, or non-Super-Admin queried audit logs / BullMQ telemetry. | Only verified Partners (`isPartner: true`) can authorize financial mutations; audit logs & queue status are strictly `SUPER_ADMIN`. |
| **1/4 Discount Ceiling** | `400 Bad Request`<br>`Maximum auction discount cannot exceed 25% of chit value` | Bid exceeds $\frac{V}{4}$ (e.g. ₹25,000 for a ₹1,00,000 chit). | Enter bid at or below the 25% ceiling ($D \le \frac{V}{4}$). |
| **Whole-Rupee Divisibility (`KFC-FIN-002`)** | `400 Bad Request`<br>`NON_DIVISIBLE_DIVIDEND` | Bid produces fractional dividend remainder: $(D - C_f) \pmod N \ne 0$. | Enter a clean bid discount where $(D - C_f)$ divides evenly by $N$. |
| **Defaulter Ineligible** | `400 Bad Request`<br>`Subscriber ineligible due to unpaid dues` | Customer attempted to bid in month $M$'s auction while their installment for month $M$ is `UNPAID`. | Record payment receipt for current month due before bidding. |
| **Month 1 & N Auction** | `400 Bad Request`<br>`Auctions strictly forbidden in Month 1 and Month N` | Attempted to schedule/conduct auction in month 1 (foreman pool) or month $N$ (final settlement). | Month 1 belongs to company ticket; Month $N$ is settled directly with 4% commission. |
| **Paise / Float Rejection** | `400 Bad Request`<br>`Floating point or fractional amounts prohibited` | API payload submitted decimal numbers (e.g. `2500.50`). | Submit whole integer Rupees (`BigInt`). All chit math is strictly integer Rupees. |

---

## Category F: Authentication & RBAC Access Failures

### F.1. Missing / Expired Bearer Token (`401 Unauthorized`)
- **Symptoms**: `{"statusCode": 401, "message": "Unauthorized"}`
- **Root Cause**: Request header missing `Authorization: Bearer <token>` or token expired past its 15-minute lifespan.
- **Remedy**:
  1. Login via `POST /api/v1/auth/web/login` with your 10-digit mobile number (`identifier`) and password (or `/api/v1/auth/mobile/login-mpin`).
  2. Extract `accessToken` from response.
  3. Include in header: `Authorization: Bearer <accessToken>`.

### F.2. Role Permission Denied (`403 Forbidden`)
- **Symptoms**: `{"statusCode": 403, "message": "Forbidden resource"}`
- **Root Cause**: User role (e.g. `COLLECTION_AGENT`, `ACCOUNTANT`, `AUDITOR`) lacks permission for the endpoint.
- **Reference**: Cross-check [`docs/01-business/permissions-matrix.md`](file:///u:/Kumaran-finance/docs/01-business/permissions-matrix.md). Field collection agents are strictly restricted to cash collection and customer onboarding.

---

## Category G: Windows PowerShell & Monorepo Tooling

### G.1. PowerShell Operator Syntax Error (`&&`)
- **Symptoms**: `The token '&&' is not a valid statement separator in this version.`
- **Root Cause**: Windows PowerShell 5.1 does not support the bash `&&` operator.
- **Remedy**: Use `;` (semicolon) instead:
  ```powershell
  # Correct in PowerShell:
  pnpm run lint; pnpm test
  ```

### G.2. PowerShell Script Execution Blocked (`PSSecurityException`)
- **Symptoms**: `File ...\activate.ps1 cannot be loaded because running scripts is disabled on this system.`
- **Remedy**:
  ```powershell
  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
  ```

### G.3. `ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT`
- **Symptoms**: `None of the selected packages has a "db:backups:list" script` when running a root-only script with `--filter api`.
- **Root Cause**: Scripts `db:backups:list` and `db:drp:drill` (colon syntax) are defined in the root monorepo [`package.json:34-38`](file:///u:/Kumaran-finance/package.json#L34-L38), whereas `apps/api/package.json:30-33` defines `db:backup:s3`, `db:backup:health`, `db:restore:s3`, and `db:drp-drill` (hyphenated).
- **Remedy**: Run backup/DRP scripts directly from the repository root:
  ```powershell
  pnpm run db:backup:s3
  pnpm run db:backups:list
  pnpm run db:restore:s3
  pnpm run db:drp:drill
  ```

---

## Category H: Reverse Proxy & Ingress Layer (Nginx)

### H.1. `502 Bad Gateway`
- **Symptoms**: Visiting `http://localhost/api` returns `502 Bad Gateway`.
- **Root Cause**: Ingress container `chitflow-nginx` ([`infra/docker/docker-compose.fullstack.yml:216`](file:///u:/Kumaran-finance/infra/docker/docker-compose.fullstack.yml#L216)) is running, but the upstream `chitflow-api` container is stopped or still starting.
- **Remedy**:
  ```powershell
  # Check if API is healthy
  docker logs chitflow-api

  # Verify API is listening on port 3000 (deep readiness probe at /health or /health/readiness)
  curl http://localhost:3000/health
  ```

### H.2. `413 Request Entity Too Large`
- **Symptoms**: Multipart fallback upload or `STORAGE_DRIVER=local` PUT upload fails with HTTP 413.
- **Root Cause**: Uncompressed raw file size exceeds the 10 MB application ceiling or Nginx upload limit.
- **Remedy**: Web uploads automatically invoke `compressImageIfNeeded()` (`<= 1920x1080` JPEG) and route directly to S3/R2 when cloud storage is enabled. For multipart fallbacks and local-driver `storage/upload/` routes, `infra/docker/nginx/conf.d/chitflow.conf` enforces `client_max_body_size 25M;`.

### H.3. Direct Browser S3/R2 `PUT` Fails With CORS or `403 SignatureDoesNotMatch`
- **Symptoms**: Browser upload fails with `"Direct storage upload failed due to network interruption or bucket CORS policy"` or HTTP `403`.
- **Root Cause**: Missing bucket CORS rule allowing `PUT` + `x-amz-*` headers from the web origin, or client `PUT` headers mismatching the presigned `PutObjectCommand` headers.
- **Remedy**:
  1. Ensure bucket CORS includes `"AllowedMethods": ["GET", "PUT", "HEAD"]`, `"AllowedHeaders": ["*"]`, `"ExposeHeaders": ["ETag"]`, and exact origin (`https://app.kumaranfinance.in` / `http://localhost:3000`). See [PRODUCTION-DEPLOYMENT-GUIDE.md §7.1](../07-operations/PRODUCTION-DEPLOYMENT-GUIDE.md#71-s3-bucket--cloudflare-r2-cors-configuration).
  2. Always run `compressImageIfNeeded()` *before* requesting `/storage/presigned-upload-url` and send `presigned.headers` verbatim without `Authorization` or cookie headers.

---

## Category I: Windows Developer Environment & SQL Diagnostics

### I.1. Windows Docker CLI Named Pipe Error (`pipe/dockerDesktopLinuxEngine`)
- **Symptoms**: `docker ps` returns:
  `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.`
- **Root Cause**: The Docker CLI context on Windows defaulted to an orphaned desktop endpoint (`desktop-linux`) rather than the active system engine (`default`).
- **Remedy**:
  ```powershell
  # Switch Docker CLI context to default
  docker context use default

  # Verify containers are visible
  docker ps
  ```

### I.2. PostgreSQL Reserved Keyword Conflict on `"User"` Table
- **Symptoms**: Executing `SELECT count(*) FROM User;` returns `1` instead of the actual number of seeded staff users (9).
- **Root Cause**: In PostgreSQL, `User` without double quotes is an internal system pseudo-function returning the current database user (`current_user` = `chitflow`, 1 row).
- **Remedy**:
  - Always quote the table name as `public."User"`:
    ```powershell
    # Query via standard input piping in PowerShell
    'SELECT count(*) FROM public."User";' | docker exec -i chitflow-db psql -U chitflow -d chitflow_dev
    ```
  - Prisma ORM automatically quotes model names as `"User"` in generated queries.

---

## 2. Nuclear Clean Slate Runbook (Reset in < 60 Seconds)

If the local development environment enters an irrecoverable state, run this sequence to restore a verified clean state:

```powershell
# 1. Stop and purge all local Docker volumes and containers
docker compose -f infra/docker/docker-compose.yml down -v

# 2. Restart fresh containers (Postgres 17, Redis 7, MinIO S3)
pnpm docker:up

# 3. Wait 5 seconds for Postgres to become healthy, then apply migrations
pnpm run prisma:migrate

# 4. Seed foundational head office branch and default Super Admin
pnpm run prisma:seed

# 5. Run test suite to verify 100% pass rate
pnpm test

# 6. Start API server
pnpm run start:dev
```
Following this nuclear sequence brings the entire local development stack back to a 100% green state.
