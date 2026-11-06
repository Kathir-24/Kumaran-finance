#!/usr/bin/env bash
# ==============================================================================
# Kumaran Chits — Generate Self-Signed SSL/TLS Certificates for Local/Staging
# Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
# ==============================================================================

set -euo pipefail

SSL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIVE_DIR="${SSL_DIR}/live"

mkdir -p "${LIVE_DIR}"

echo "[INFO] Generating 2048-bit RSA Private Key and Self-Signed Certificate..."

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "${LIVE_DIR}/privkey.pem" \
  -out "${LIVE_DIR}/fullchain.pem" \
  -subj "/C=IN/ST=Tamil Nadu/L=Perundurai/O=Kumaran Finance/OU=IT Operations/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,DNS:kumaranfinance.in,IP:127.0.0.1"

chmod 600 "${LIVE_DIR}/privkey.pem"
chmod 644 "${LIVE_DIR}/fullchain.pem"

echo "[SUCCESS] Self-signed certificates generated successfully in: ${LIVE_DIR}"
echo "  - Certificate: ${LIVE_DIR}/fullchain.pem"
echo "  - Private Key: ${LIVE_DIR}/privkey.pem"
