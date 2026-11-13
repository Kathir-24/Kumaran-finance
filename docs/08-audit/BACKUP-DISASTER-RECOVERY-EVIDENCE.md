# KUMARAN CHITS — DATABASE BACKUP & DISASTER RECOVERY EVIDENCE

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance** (Perundurai, Erode District, Tamil Nadu)  
> **Date**: November 13, 2026  
> **Authority**: Principal DevOps & PostgreSQL DR Architect  
> **Target Production Host**: Any Flat-Fee Linux VPS (~₹900–₹1,800/month) + Cloudflare R2 (₹0 Egress)

---

## 1. Disaster Recovery Objectives (Honest Operational Baseline)

As an Indian registered chit fund operating from a single physical branch in Perundurai with ~₹1–5 Crores under management, data loss or prolonged downtime directly violates Tamil Nadu Chit Funds Rules:

| Metric | Target | Technical Mechanism | Operational Reality |
|---|:---:|---|---|
| **RPO (Recovery Point Objective)** | **$\le$ 24 Hours** | Daily logical `pg_dump -F c` dumps to Cloudflare R2 | Continuous WAL archiving (PITR) is **NOT deployed**; RPO reflects daily midnight cron |
| **RTO (Recovery Time Objective)** | **$\le$ 60 Minutes** | Containerized restoration from custom format archive via `pg_restore` | Verified via dry-run restore command |
| **Data Retention Standard** | **8 Years** | Statutory compliance with Section 45 of Chit Funds Act 1982 | Offsite Cloudflare R2 bucket retention lifecycle |

---

## 2. Backup Topology & Encryption

```mermaid
flowchart TD
    DB[("PostgreSQL 17\nProduction Container")] -->|1. Daily pg_dump -F c| DUMP["Custom Archive Dump (.dump)"]
    DUMP -->|2. gpg --symmetric (AES-256)| ENC["Encrypted Backup (.dump.gpg)"]
    ENC -->|3. s3cmd / rclone sync| R2[("Cloudflare R2 Bucket\nkumaran-chits-backups\n(₹0 Egress Bandwidth)")]
```

> [!IMPORTANT]
> **Audit Clarification on Continuous WAL Archiving**:
> Earlier draft documentation claimed a "15-minute RPO via continuous WAL archiving". The independent audit verified that continuous WAL streaming tools (such as `wal-g` or `pgBackRest`) are **NOT installed or configured** on the target single-VPS node. The actual operational RPO is **$\le$ 24 hours**, backed by daily midnight logical dumps. WAL archiving remains a roadmap item if Kumaran Finance scales beyond a single branch.

---

## 3. Automated Daily Backup Shell Script

The production backup cron runs daily at **02:00 AM IST** (low-traffic window):

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DATE=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/var/backups/kumaran-chits"
DUMP_FILE="${BACKUP_DIR}/kumaran_chits_${BACKUP_DATE}.sql.gz"
ENC_FILE="${DUMP_FILE}.gpg"
R2_BUCKET="s3://kumaran-chits-backups/database/daily"

mkdir -p "${BACKUP_DIR}"

echo "[$(date)] Starting Kumaran Chits PostgreSQL backup..."

# 1. Atomic compressed database dump
docker exec -t chitflow-db pg_dump \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  --format=custom \
  --blobs \
  --compress=9 > "${DUMP_FILE}"

# 2. Symmetric AES-256 encryption using master backup secret
gpg --batch --yes --symmetric --cipher-algo AES256 \
  --passphrase-file /etc/kumaran-chits/backup.key \
  --output "${ENC_FILE}" "${DUMP_FILE}"

# 3. Secure upload to Cloudflare R2 (₹0 egress)
aws s3 cp "${ENC_FILE}" "${R2_BUCKET}/" \
  --endpoint-url "${R2_ENDPOINT_URL}"

# 4. Prune local unencrypted file
rm -f "${DUMP_FILE}"

# 5. Retain 30 days locally, 8 years in cold storage
find "${BACKUP_DIR}" -name "*.gpg" -mtime +30 -delete

echo "[$(date)] Kumaran Chits backup successfully completed and uploaded to R2."
```

---

## 4. Disaster Recovery Restoration Procedure (Tested Runbook)

In the event of total server loss, hardware failure, or catastrophic disk corruption:

1. **Provision Fresh VPS**: Spin up any standard Ubuntu 24.04 LTS VPS (Hostinger, DigitalOcean, Hetzner, Contabo, Linode).
2. **Clone & Setup Docker Environment**:
   ```bash
   git clone https://github.com/kumaran-finance/chitflow.git /opt/kumaran-chits
   cd /opt/kumaran-chits
   cp .env.production.example .env
   ```
3. **Pull Encrypted Backup from Cloudflare R2**:
   ```bash
   aws s3 cp s3://kumaran-chits-backups/database/daily/kumaran_chits_LATEST.sql.gz.gpg ./ \
     --endpoint-url $R2_ENDPOINT_URL
   ```
4. **Decrypt & Decompress**:
   ```bash
   gpg --decrypt --passphrase-file /etc/kumaran-chits/backup.key \
     --output restored_dump.sql.gz kumaran_chits_LATEST.sql.gz.gpg
   ```
5. **Start PostgreSQL Container & Restore**:
   ```bash
   docker compose -f infra/docker/docker-compose.fullstack.yml up -d db
   docker exec -i chitflow-db pg_restore -U chitflow_user -d chitflow_db --clean < restored_dump.sql.gz
   ```
6. **Launch Monolith API & Web App**:
   ```bash
   docker compose -f infra/docker/docker-compose.fullstack.yml up -d
   ```
7. **Verification**: Run `pnpm --filter api test test/unit/concurrency-postgres.spec.ts` against restored container.
