#!/usr/bin/env bash
# ==============================================================================
# Kumaran Chits — Host Storage & Disk Capacity Monitor
# Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
# Compliance: docs/06-devops/infrastructure-and-drp.md (§2.4)
# Threshold: Alert when disk capacity exceeds 80%
# ==============================================================================

set -euo pipefail

THRESHOLD_PERCENT="${DISK_ALERT_THRESHOLD:-80}"
TARGET_PATH="${1:-/}"

echo "[INFO] Running storage capacity monitor for mount: ${TARGET_PATH}"
echo "[INFO] Alert threshold configured at: ${THRESHOLD_PERCENT}%"

# Extract used percentage for the target path (POSIX compliant)
CURRENT_USAGE=$(df -P "${TARGET_PATH}" | awk 'NR==2 {gsub("%",""); print $5}')
AVAILABLE_KB=$(df -P "${TARGET_PATH}" | awk 'NR==2 {print $4}')
TOTAL_KB=$(df -P "${TARGET_PATH}" | awk 'NR==2 {print $2}')

AVAILABLE_GB=$((AVAILABLE_KB / 1024 / 1024))
TOTAL_GB=$((TOTAL_KB / 1024 / 1024))

echo "[METRIC] Current Usage: ${CURRENT_USAGE}% (${AVAILABLE_GB}GB free of ${TOTAL_GB}GB total)"

if [ "${CURRENT_USAGE}" -ge "${THRESHOLD_PERCENT}" ]; then
  echo "[CRITICAL ALERT] Disk usage (${CURRENT_USAGE}%) exceeds safety threshold (${THRESHOLD_PERCENT}%)!" >&2
  echo "[ACTION REQUIRED] Prune stale Docker logs, container images, or rotate backups immediately." >&2
  exit 1
fi

echo "[SUCCESS] Storage capacity is healthy (${CURRENT_USAGE}% < ${THRESHOLD_PERCENT}%)."
exit 0
