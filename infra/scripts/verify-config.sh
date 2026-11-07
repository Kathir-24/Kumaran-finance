#!/bin/bash
# ==============================================================================
# Kumaran Chits — Multi-Instance Configuration & Environment Verification
# Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
# Validates environment variable consistency across horizontal instances
# ==============================================================================

set -euo pipefail

ENV_FILE="${1:-apps/api/.env}"

if [ ! -f "$ENV_FILE" ]; then
  if [ -f ".env" ]; then
    ENV_FILE=".env"
  elif [ -f "apps/api/.env" ]; then
    ENV_FILE="apps/api/.env"
  fi
fi

echo "========================================================================"
echo "🔍 Validating Kumaran Chits Environment Configuration ($ENV_FILE)..."
echo "========================================================================"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Error: Environment file not found at: $ENV_FILE"
  exit 1
fi

ERRORS=0

check_var() {
  local var_name="$1"
  local is_secret="${2:-false}"
  
  if ! grep -q "^${var_name}=" "$ENV_FILE" || [ -z "$(grep "^${var_name}=" "$ENV_FILE" | cut -d'=' -f2-)" ]; then
    echo "❌ Missing mandatory variable: $var_name"
    ERRORS=$((ERRORS + 1))
  else
    local val
    val=$(grep "^${var_name}=" "$ENV_FILE" | cut -d'=' -f2-)
    if [ "$is_secret" = true ]; then
      echo "✅ $var_name = [CONFIGURED (${#val} chars)]"
    else
      echo "✅ $var_name = $val"
    fi
  fi
}

echo "--- Core Identity & Database ---"
check_var "DATABASE_URL" true
check_var "JWT_SECRET" true
check_var "PRIMARY_BRANCH_CODE" false
check_var "DEFAULT_FOREMAN_COMMISSION_PERCENT" false

echo "--- Backing Caches & Distributed Queues ---"
check_var "REDIS_HOST" false
check_var "REDIS_PORT" false

echo "--- Encrypted Storage Configuration ---"
check_var "STORAGE_DRIVER" false
check_var "S3_BUCKET" false
check_var "S3_ACCESS_KEY_ID" true
check_var "S3_SECRET_ACCESS_KEY" true

echo "========================================================================"
if [ "$ERRORS" -gt 0 ]; then
  echo "❌ Configuration Verification FAILED: $ERRORS error(s) found."
  exit 1
else
  echo "🎉 Configuration Verification PASSED: All horizontal instance variables validated."
  exit 0
fi
