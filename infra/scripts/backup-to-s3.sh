#!/usr/bin/env bash
# ==============================================================================
# Kumaran Chits — Automated S3 Database Backup Runner (POSIX Bash)
# Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
# Compliance: docs/06-devops/infrastructure-and-drp.md (§3.1, §3.2, §3.4)
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${REPO_ROOT}"

echo "[INFO] Starting Kumaran Chits S3 Database Backup Runner..."

pnpm --filter api exec ts-node scripts/backup-to-s3.ts

echo "[SUCCESS] S3 Database backup executed cleanly!"
