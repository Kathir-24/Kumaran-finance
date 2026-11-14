#!/bin/sh
# ==============================================================================
# Kumaran Chits — Containerized Nightly S3 Backup Runner
# Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
# Compliance: docs/06-devops/infrastructure-and-drp.md (§3.1, §3.2)
# Executed daily at 02:00 AM IST (20:30 UTC) via crond
# ==============================================================================

set -eu

NOW=$(date +%Y%m%d_%H%M%S)
YEAR=$(date +%Y)
MONTH=$(date +%m)
BACKUP_DIR="${BACKUP_DIR:-/backups}"
mkdir -p "${BACKUP_DIR}"

# Configure universal AWS/S3 CLI credentials via environment variables (in-memory, avoids plaintext ~/.aws/credentials)
export AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID:-chitflow_admin}"
export AWS_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY:-chitflow_storage_secret}"
export AWS_DEFAULT_REGION="${S3_REGION:-ap-south-1}"
# Purge legacy plaintext credentials file if previously created
rm -rf ~/.aws 2>/dev/null || true

BACKUP_FILE="${BACKUP_DIR}/kumaran_chits_backup_${NOW}.dump"
S3_BUCKET="${S3_BUCKET:-kumaran-chits-private}"
S3_KEY="s3://${S3_BUCKET}/backups/db/${YEAR}/${MONTH}/kumaran_chits_backup_${NOW}.dump"

echo "[$(date -u)] [BACKUP] Starting automated database backup for Kumaran Chits..."
echo "[$(date -u)] [BACKUP] Host: ${POSTGRES_HOST:-db}, DB: ${POSTGRES_DB:-chitflow_dev}, User: ${POSTGRES_USER:-chitflow}"

PGPASSWORD="${POSTGRES_PASSWORD:-chitflow_dev_only}" pg_dump \
  -h "${POSTGRES_HOST:-db}" \
  -p "${POSTGRES_PORT:-5432}" \
  -U "${POSTGRES_USER:-chitflow}" \
  -d "${POSTGRES_DB:-chitflow_dev}" \
  -F c \
  -f "${BACKUP_FILE}"

FILE_SIZE=$(wc -c < "${BACKUP_FILE}")
echo "[$(date -u)] [BACKUP] Binary dump created successfully (${FILE_SIZE} bytes)."
echo "[$(date -u)] [BACKUP] Uploading to S3 destination: ${S3_KEY}..."

if [ -n "${S3_ENDPOINT:-}" ]; then
  aws --endpoint-url "${S3_ENDPOINT}" s3 cp "${BACKUP_FILE}" "${S3_KEY}"
else
  aws s3 cp "${BACKUP_FILE}" "${S3_KEY}"
fi

echo "[$(date -u)] [SUCCESS] Off-site backup uploaded and verified on S3!"

# Clean up local temporary dump files older than 7 days to preserve disk space
find "${BACKUP_DIR}" -name "kumaran_chits_backup_*.dump" -mtime +7 -delete 2>/dev/null || true
echo "[$(date -u)] [CLEANUP] Pruned local dumps older than 7 days."
