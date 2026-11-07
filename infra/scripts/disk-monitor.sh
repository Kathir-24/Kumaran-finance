#!/usr/bin/env bash
# ==============================================================================
# Kumaran Chits — Host Storage & Disk Capacity Monitor
# Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
# Compliance: docs/06-devops/infrastructure-and-drp.md (§2.4)
# Threshold: Alert when disk capacity exceeds 80% (and SSL cert expires <= 30 days)
# ==============================================================================

set -euo pipefail

THRESHOLD_PERCENT="${DISK_ALERT_THRESHOLD:-80}"
TARGET_PATH="${1:-/}"
CERT_PATH="${CERT_PATH:-infra/docker/nginx/ssl/live/fullchain.pem}"
SSL_EXPIRY_THRESHOLD_SECONDS="${SSL_EXPIRY_THRESHOLD_SECONDS:-2592000}" # 30 days

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

# Optional SSL Certificate Expiration Check if Certificate exists
if [ -f "${CERT_PATH}" ] && command -v openssl &>/dev/null; then
  echo "[INFO] Probing SSL/TLS certificate expiration for: ${CERT_PATH}"
  EXPIRY_DATE=$(openssl x509 -enddate -noout -in "${CERT_PATH}" | cut -d= -f2)
  echo "[METRIC] Certificate Expiration Date: ${EXPIRY_DATE}"

  if ! openssl x509 -checkend "${SSL_EXPIRY_THRESHOLD_SECONDS}" -noout -in "${CERT_PATH}"; then
    echo "[CRITICAL ALERT] Certificate will expire within 30 days!" >&2
    exit 1
  fi
  echo "[SUCCESS] Certificate validity is healthy (> 30 days remaining)."
fi

exit 0
