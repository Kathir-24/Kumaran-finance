#!/usr/bin/env bash
# ==============================================================================
# Kumaran Chits — Automated Database Restore Script (Linux/Bash)
# Target: PostgreSQL 17 Container (chitflow-db)
# ==============================================================================
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <path-to-backup.dump>" >&2
  exit 1
fi

BACKUP_PATH="$1"
if [ ! -f "${BACKUP_PATH}" ]; then
  echo "[ERROR] Backup file not found: ${BACKUP_PATH}" >&2
  exit 1
fi

BACKUP_FILE=$(basename "${BACKUP_PATH}")

echo "[INFO] Starting database restore for Kumaran Chits..."

# Check if container is running
if ! docker ps --filter "name=chitflow-db" --filter "status=running" --format "{{.Names}}" | grep -q "chitflow-db"; then
  echo "[ERROR] Docker container 'chitflow-db' is not running." >&2
  exit 1
fi

# Copy backup to container
echo "[INFO] Copying dump file into container..."
docker cp "${BACKUP_PATH}" "chitflow-db:/tmp/${BACKUP_FILE}"

# Execute restore
echo "[INFO] Restoring database from dump..."
docker exec chitflow-db pg_restore -U chitflow -d chitflow_dev --clean --if-exists "/tmp/${BACKUP_FILE}"

# Clean up container tmp
docker exec chitflow-db rm "/tmp/${BACKUP_FILE}"

echo "[SUCCESS] Database restore completed successfully!"
