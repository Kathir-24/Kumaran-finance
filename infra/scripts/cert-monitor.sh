#!/usr/bin/env bash
# ==============================================================================
# Kumaran Chits — SSL/TLS Certificate Expiration Monitor
# Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
# Compliance: docs/03-architecture/server-and-infrastructure-resilience.md
# Threshold: Alert when certificate expiration is within 30 days (2,592,000s)
# ==============================================================================

set -euo pipefail

CERT_PATH="${1:-infra/docker/nginx/ssl/live/fullchain.pem}"
THRESHOLD_SECONDS="${SSL_EXPIRY_THRESHOLD_SECONDS:-2592000}" # 30 days
THRESHOLD_DAYS=$((THRESHOLD_SECONDS / 86400))

echo "[INFO] Running SSL/TLS certificate expiration probe..."
echo "[INFO] Target certificate: ${CERT_PATH}"
echo "[INFO] Expiration alert threshold: ${THRESHOLD_DAYS} days (${THRESHOLD_SECONDS}s)"

if [ ! -f "${CERT_PATH}" ]; then
  echo "[CRITICAL ALERT] Certificate file not found at: ${CERT_PATH}" >&2
  exit 1
fi

if ! command -v openssl &>/dev/null; then
  echo "[WARN] openssl CLI not found in environment. Skipping OpenSSL probe."
  exit 0
fi

# Print certificate expiration date
EXPIRY_DATE=$(openssl x509 -enddate -noout -in "${CERT_PATH}" | cut -d= -f2)
echo "[METRIC] Certificate Expiration Date: ${EXPIRY_DATE}"

# Check if certificate expires within THRESHOLD_SECONDS
if ! openssl x509 -checkend "${THRESHOLD_SECONDS}" -noout -in "${CERT_PATH}"; then
  echo "[CRITICAL ALERT] Certificate will expire within ${THRESHOLD_DAYS} days (or is already expired)!" >&2
  echo "[ACTION REQUIRED] Trigger Certbot renewal via 'docker compose exec certbot certbot renew' or rotate TLS keys immediately." >&2
  exit 1
fi

echo "[SUCCESS] SSL/TLS certificate is healthy and valid for > ${THRESHOLD_DAYS} days."
exit 0
