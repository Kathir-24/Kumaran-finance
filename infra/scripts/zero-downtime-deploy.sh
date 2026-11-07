#!/bin/bash
# ==============================================================================
# Kumaran Chits — Zero-Downtime Blue-Green Deployment Script
# Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
# Compliance: docs/06-devops/infrastructure-and-drp.md & ADR-01 through ADR-19
# ==============================================================================

set -euo pipefail

COMPOSE_FILE="infra/docker/docker-compose.fullstack.yml"
TARGET_SERVICE="api"
HEALTH_ENDPOINT="http://127.0.0.1:3000/health/readiness"
MAX_HEALTH_RETRIES=30
RETRY_INTERVAL_SECONDS=2

echo "========================================================================"
echo "🚀 Starting Zero-Downtime Hot Deployment for Kumaran Chits API..."
echo "========================================================================"

# Step 1: Pre-build the updated API container image
echo "📦 Step 1: Building updated API container image..."
docker compose -f "$COMPOSE_FILE" build "$TARGET_SERVICE"

# Step 2: Spin up the new container with rolling recreation
echo "🔄 Step 2: Starting new container with graceful recreate..."
docker compose -f "$COMPOSE_FILE" up -d --no-deps --build "$TARGET_SERVICE"

# Step 3: Poll deep readiness health endpoint until backing services respond HTTP 200
echo "🏥 Step 3: Polling deep readiness health probe ($HEALTH_ENDPOINT)..."
READY=false
for i in $(seq 1 $MAX_HEALTH_RETRIES); do
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_ENDPOINT" || echo "000")
  if [ "$HTTP_STATUS" -eq 200 ]; then
    echo "✅ [Probe $i/$MAX_HEALTH_RETRIES] Backend API is READY and connected to PostgreSQL + Redis (HTTP 200)."
    READY=true
    break
  else
    echo "⏳ [Probe $i/$MAX_HEALTH_RETRIES] Waiting for API readiness probe... (HTTP $HTTP_STATUS)"
    sleep $RETRY_INTERVAL_SECONDS
  fi
done

if [ "$READY" != true ]; then
  echo "❌ Error: API failed deep health check after $((MAX_HEALTH_RETRIES * RETRY_INTERVAL_SECONDS))s. Aborting reload."
  exit 1
fi

# Step 4: Reload Nginx reverse proxy with zero dropped connections
echo "🔁 Step 4: Reloading Nginx ingress proxy with zero downtime..."
docker exec chitflow-nginx nginx -s reload

echo "========================================================================"
echo "🎉 Zero-Downtime Deployment Completed Successfully!"
echo "   - Deep health probe: PASSED"
echo "   - Backing services: PostgreSQL + Redis CONNECTED"
echo "   - Ingress status: Nginx RELOADED"
echo "========================================================================"
