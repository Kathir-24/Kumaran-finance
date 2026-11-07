#!/bin/bash
# ==============================================================================
# Kumaran Chits — One-Click Instant Rollback Script
# Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
# Compliance: docs/06-devops/infrastructure-and-drp.md & ADR-01 through ADR-19
# ==============================================================================

set -euo pipefail

COMPOSE_FILE="infra/docker/docker-compose.fullstack.yml"
TARGET_SERVICE="api"
HEALTH_ENDPOINT="http://127.0.0.1:3000/health/readiness"
MAX_RETRIES=20
RETRY_INTERVAL_SECONDS=2

echo "========================================================================"
echo "🚨 Triggering One-Click Emergency Rollback for Kumaran Chits API..."
echo "========================================================================"

# Check if chitflow-api:previous exists
if ! docker image inspect chitflow-api:previous >/dev/null 2>&1; then
  echo "❌ Error: Previous backup image 'chitflow-api:previous' not found!"
  echo "   Cannot perform automated rollback without a preserved release image."
  exit 1
fi

CURRENT_IMAGE_NAME=$(docker inspect --format='{{.Config.Image}}' chitflow-api 2>/dev/null || echo "docker-api")
echo "🔄 Restoring $TARGET_SERVICE image from chitflow-api:previous to $CURRENT_IMAGE_NAME..."
docker tag chitflow-api:previous "$CURRENT_IMAGE_NAME"

echo "🔄 Recreating $TARGET_SERVICE container using previous release image..."
docker compose -f "$COMPOSE_FILE" up -d --no-deps "$TARGET_SERVICE"

echo "🏥 Verifying restored API readiness probe ($HEALTH_ENDPOINT)..."
READY=false
for i in $(seq 1 "$MAX_RETRIES"); do
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_ENDPOINT" || echo "000")
  if [ "$HTTP_STATUS" -eq 200 ]; then
    echo "✅ [Probe $i/$MAX_RETRIES] Restored API is READY and connected to PostgreSQL + Redis (HTTP 200)."
    READY=true
    break
  else
    echo "⏳ [Probe $i/$MAX_RETRIES] Waiting for rollback readiness... (HTTP $HTTP_STATUS)"
    sleep "$RETRY_INTERVAL_SECONDS"
  fi
done

if [ "$READY" != true ]; then
  echo "🚨 CRITICAL: Rolled back container failed health checks. Please inspect container logs: docker logs chitflow-api"
  exit 1
fi

echo "🔁 Reloading Nginx ingress proxy with zero dropped connections..."
docker exec chitflow-nginx nginx -s reload

echo "========================================================================"
echo "🎉 Emergency Rollback Completed Successfully!"
echo "   - Container state: RESTORED to chitflow-api:previous"
echo "   - Deep health probe: PASSED (HTTP 200)"
echo "   - Ingress status: Nginx RELOADED"
echo "========================================================================"
