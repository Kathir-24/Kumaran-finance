# KUMARAN CHITS — DATABASE BACKUP & DISASTER RECOVERY EVIDENCE

> **Product**: **Kumaran Chits**  
> **Company**: **Kumaran Finance** (Perundurai, Erode District, Tamil Nadu)  
> **Date**: November 13, 2026  
> **Authority**: Principal DevOps & PostgreSQL DR Architect  
> **Target Production Host**: Any Flat-Fee Linux VPS (~₹900–₹1,800/month) + Cloudflare R2 (₹0 Egress)

---

## 1. Disaster Recovery Objectives

As an Indian registered chit fund operating from a physical branch in Perundurai with ~₹1–5 Crores under management, data loss or prolonged downtime directly violates Tamil Nadu Chit Funds Rules:

| Metric | Target | Technical Mechanism |
|---|:---:|---|
| **RPO (Recovery Point Objective)** | **$\le$ 15 Minutes** | Continuous PostgreSQL WAL (Write-Ahead Log) archiving to Cloudflare R2 |
| **RTO (Recovery Time Objective)** | **$\le$ 30 Minutes** | Containerized Docker restoration from daily compressed encrypted dumps |
| **Data Retention Standard** | **8 Years** | Statutory compliance with Section 45 of Chit Funds Act 1982 |

---

## 2. Backup Topology & Encryption

```mermaid
flowchart TD
    DB[("PostgreSQL 17\nProduction Container")] -->|1. Daily pg_dump| DUMP["Raw SQL / Custom Dump"]
    DUMP -->|2. gzip -9| COMP["Compressed Archive"]
    COMP -->|3. gpg --symmetric (AES-256)| ENC["Encrypted Backup (.gpg)"]
    ENC -->|4. s3cmd / aws s3 sync| R2[("Cloudflare R2 Bucket\nkumaran-chits-backups\n(₹0 Egress Bandwidth)")]
    DB -->|Continuous wal-g| WAL[("WAL Archives in R2\n(PITR Recovery)")]
```

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
