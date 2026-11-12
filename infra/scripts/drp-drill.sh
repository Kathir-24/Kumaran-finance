#!/usr/bin/env bash
# ==============================================================================
# Kumaran Chits — Automated DRP Disaster Recovery Drill Runner (Bash)
# Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
# Compliance: docs/06-devops/infrastructure-and-drp.md (§3.1, §3.3)
# Invariants: docs/05-testing/financial-tests.md (§1 - §4), AGENTS.md §3
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

echo "[INFO] Starting Kumaran Chits Automated DRP Disaster Recovery Drill..."

pnpm run db:drp:drill

echo "[SUCCESS] Disaster Recovery Drill completed with 100% compliance!"
