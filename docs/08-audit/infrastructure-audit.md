# INFRASTRUCTURE, DEVOPS & PRODUCTION READINESS AUDIT — KUMARAN CHITS
**Kumaran Finance — Perundurai Head Office, Erode District, Tamil Nadu**  
**Audit Stage**: Independent Verification & Infrastructure Audit  
**Date**: November 2026  
**Auditor**: Antigravity Senior Engineering & Audit Swarm  

---

## 1. Hosting Target & Infrastructure Sizing

Kumaran Chits is engineered for deployment on any standard **Flat-Fee Linux Virtual Private Server (VPS)** combined with S3-compatible cloud object storage:
- **Target Providers**: Hostinger, DigitalOcean, Hetzner, Linode, Vultr, Contabo, or OVH.
- **Monthly Cost**: ~₹900 to ₹1,800 / month flat fee (zero hourly hyperscaler surprises).
- **Recommended Node Specs**:
  - CPU: 4 vCPU cores
  - RAM: 8 GB DDR4/DDR5
  - Storage: 100 GB NVMe SSD
  - Bandwidth: 1 TB to 5 TB included
- **Object Storage**: Cloudflare R2 (₹0 egress bandwidth fees, 10 GB free tier) or MinIO private instance.

---

## 2. Containerized Service Topology

The entire application runs in isolated Docker containers orchestrated via `docker-compose.prod.yml`:

```
Internet (HTTPS 443)
       │
       ▼
┌────────────────────────────────────────┐
│  Reverse Proxy (Caddy / Nginx)         │
│  - Automated Let's Encrypt TLS         │
│  - Rate Limiting & HTTP Security Headers│
└──────────────┬─────────────────────────┘
               │
       ┌───────┴───────┐
       ▼               ▼
┌──────────────┐┌──────────────┐
│  Next.js Web ││  NestJS API  │
│  Port 3000   ││  Port 3001   │
└──────────────┘└──────┬───────┘
                       │
       ┌───────────────┴───────────────┐
       ▼                               ▼
┌──────────────┐                ┌──────────────┐
│PostgreSQL 17 │                │   Redis 7    │
│Port 5432(int)│                │Port 6379(int)│
│NVMe Volume   │                │BullMQ / Cache│
└──────────────┘                └──────────────┘
```

---

## 3. Backup, Disaster Recovery & RPO / RTO Realities

### Honest Assessment of Disaster Recovery:
- **Backup Mechanism**: Logical database dumps generated via `pg_dump -F c` (PostgreSQL custom archive format) using `scripts/backup.sh`.
- **Encryption & Offsite Storage**: Dumps are compressed, encrypted via OpenSSL (`AES-256-CBC`), and uploaded to Cloudflare R2 / MinIO offsite storage.
- **Recovery Point Objective (RPO)**:
  - **RPO $\le$ 24 hours** (Based on daily midnight automated dumps).
  - *Clarification*: Continuous WAL archiving (Point-In-Time-Recovery / PITR) is **NOT currently deployed**. Any claim of a "15-minute RPO" in earlier drafts was unproven and has been corrected.
- **Recovery Time Objective (RTO)**:
  - **RTO $\le$ 60 minutes** (Verified via test restore using `pg_restore -d kumaran_chits`).

---

## 4. Background Processing & Queue Reliability

- **Queue Framework**: BullMQ v5 on Redis 7.
- **Job Queues**:
  1. `notification-queue`: Dispatches TRAI DLT SMS notifications.
  2. `report-queue`: Generates asynchronous heavy PDF vouchers and statutory schedules.
  3. `cleanup-queue`: Prunes expired OTP tokens and temporary upload staging files.
- **Reliability Invariants**:
  - Exponential backoff retry (3 attempts) with dead-letter queue inspection.
  - Financial write operations are **never blocked** by queue or Redis offline events (fire-and-forget fallback verified in `auction.spec.ts` and `queue-resilience.spec.ts`).

---

## 5. Security & Secrets Management

- **Zero Secrets in Git**: Verified `.gitignore` excludes all `.env`, `.env.production`, `.pem`, and dump files.
- **File Permissions**: Production `.env` file secured via `chmod 600` (readable only by root/app user).
- **Database Network Isolation**: PostgreSQL port `5432` and Redis port `6379` are bound strictly to internal Docker bridge network (`127.0.0.1` / internal docker network); zero public internet exposure.
- **Rate Limiting**: Throttler module protects `/auth/otp/request` (max 3 per minute) and `/payments` from automated abuse.
