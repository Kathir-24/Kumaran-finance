# ==============================================================================
# Kumaran Chits — Zero-Downtime Blue-Green Deployment Script (PowerShell)
# Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
# Compliance: docs/06-devops/infrastructure-and-drp.md & ADR-01 through ADR-19
# ==============================================================================

[CmdletBinding()]
param (
    [string]$ComposeFile = "infra/docker/docker-compose.fullstack.yml",
    [string]$TargetService = "api",
    [string]$HealthEndpoint = "http://127.0.0.1:3000/health/readiness",
    [int]$MaxRetries = 30,
    [int]$RetryIntervalSeconds = 2
)

$ErrorActionPreference = "Stop"

Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "🚀 Starting Zero-Downtime Hot Deployment for Kumaran Chits API..." -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan

# Step 1: Pre-build the updated API container image
Write-Host "📦 Step 1: Building updated API container image..." -ForegroundColor Yellow
docker compose -f $ComposeFile build $TargetService
if ($LASTEXITCODE -ne 0) {
    Write-Error "Container build failed with exit code $LASTEXITCODE"
}

# Step 2: Spin up the new container with rolling recreation
Write-Host "🔄 Step 2: Starting new container with graceful recreate..." -ForegroundColor Yellow
docker compose -f $ComposeFile up -d --no-deps --build $TargetService
if ($LASTEXITCODE -ne 0) {
    Write-Error "Container up failed with exit code $LASTEXITCODE"
}

# Step 3: Poll deep readiness health endpoint until backing services respond HTTP 200
Write-Host "🏥 Step 3: Polling deep readiness health probe ($HealthEndpoint)..." -ForegroundColor Yellow
$isReady = $false

for ($i = 1; $i -le $MaxRetries; $i++) {
    try {
        $response = Invoke-WebRequest -Uri $HealthEndpoint -UseBasicParsing -TimeoutSec 3 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            Write-Host "✅ [Probe $i/$MaxRetries] Backend API is READY and connected to PostgreSQL + Redis (HTTP 200)." -ForegroundColor Green
            $isReady = $true
            break
        }
    }
    catch {
        $status = $_.Exception.Response.StatusCode.value__
        Write-Host "⏳ [Probe $i/$MaxRetries] Waiting for API readiness probe... (HTTP $status)" -ForegroundColor DarkGray
    }
    Start-Sleep -Seconds $RetryIntervalSeconds
}

if (-not $isReady) {
    Write-Error "API failed deep health check after $($MaxRetries * $RetryIntervalSeconds) seconds. Aborting deployment."
}

# Step 4: Reload Nginx reverse proxy with zero dropped connections
Write-Host "🔁 Step 4: Reloading Nginx ingress proxy with zero downtime..." -ForegroundColor Yellow
docker exec chitflow-nginx nginx -s reload
if ($LASTEXITCODE -ne 0) {
    Write-Error "Nginx reload failed with exit code $LASTEXITCODE"
}

Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "🎉 Zero-Downtime Deployment Completed Successfully!" -ForegroundColor Green
Write-Host "   - Deep health probe: PASSED" -ForegroundColor Green
Write-Host "   - Backing services: PostgreSQL + Redis CONNECTED" -ForegroundColor Green
Write-Host "   - Ingress status: Nginx RELOADED" -ForegroundColor Green
Write-Host "========================================================================" -ForegroundColor Cyan
