#!/usr/bin/env bash
# ==============================================================================
# Kumaran Chits — Automated Database Backup Script (Linux/Bash)
# Target: PostgreSQL 17 Container (chitflow-db)
# ==============================================================================
set -euo pipefail

BACKUP_DIR="${1:-$(dirname "$0")/../backups}"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="kumaran_chits_backup_${TIMESTAMP}.dump"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILE}"

echo "[INFO] Starting database backup for Kumaran Chits..."

# Check if container is running
if ! docker ps --filter "name=chitflow-db" --filter "status=running" --format "{{.Names}}" | grep -q "chitflow-db"; then
  echo "[ERROR] Docker container 'chitflow-db' is not running." >&2
  exit 1
fi

# Generate compressed binary dump
echo "[INFO] Generating binary dump from PostgreSQL 17..."
docker exec chitflow-db pg_dump -U chitflow -d chitflow_dev -F c -f "/tmp/${BACKUP_FILE}"

# Copy to host
docker cp "chitflow-db:/tmp/${BACKUP_FILE}" "${BACKUP_PATH}"

# Clean up container tmp
docker exec chitflow-db rm "/tmp/${BACKUP_FILE}"

if [ -f "${BACKUP_PATH}" ]; then
  FILE_SIZE=$(wc -c < "${BACKUP_PATH}")
  echo "[SUCCESS] Backup successfully created!"
  echo "   File: ${BACKUP_PATH}"
  echo "   Size: ${FILE_SIZE} bytes"
else
  echo "[ERROR] Backup file verification failed." >&2
  exit 1
fi
