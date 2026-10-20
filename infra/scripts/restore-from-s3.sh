#!/usr/bin/env bash
# ==============================================================================
# Kumaran Chits — Restore Database from S3 Backup (POSIX Bash)
# Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
# Compliance: docs/06-devops/infrastructure-and-drp.md (§3.1, §3.3)
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${REPO_ROOT}"

pnpm --filter api exec ts-node scripts/restore-from-s3.ts "$@"
