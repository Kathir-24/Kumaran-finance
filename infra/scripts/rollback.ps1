# ==============================================================================
# Kumaran Chits — One-Click Instant Rollback Script (PowerShell)
# Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
# Compliance: docs/06-devops/infrastructure-and-drp.md & ADR-01 through ADR-19
# ==============================================================================

[CmdletBinding()]
param (
    [string]$ComposeFile = "infra/docker/docker-compose.fullstack.yml",
    [string]$TargetService = "api",
    [string]$HealthEndpoint = "http://127.0.0.1:3000/health/readiness",
    [int]$MaxRetries = 20,
    [int]$RetryIntervalSeconds = 2
)

$ErrorActionPreference = "Stop"

Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "🚨 Triggering One-Click Emergency Rollback for Kumaran Chits API..." -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan

# Check if chitflow-api:previous exists
$previousInspect = docker image inspect chitflow-api:previous 2>$null
if (-not $previousInspect) {
    Write-Error "Previous backup image 'chitflow-api:previous' not found! Cannot perform automated rollback without a preserved release image."
}

$currentImageName = (docker inspect --format='{{.Config.Image}}' chitflow-api 2>$null).Trim()
if (-not $currentImageName) { $currentImageName = "docker-api" }

Write-Host "🔄 Restoring $TargetService image from chitflow-api:previous to $currentImageName..." -ForegroundColor Yellow
docker tag "chitflow-api:previous" $currentImageName 2>$null

Write-Host "🔄 Recreating $TargetService container using previous release image..." -ForegroundColor Yellow
docker compose -f $ComposeFile up -d --no-deps $TargetService
if ($LASTEXITCODE -ne 0) {
    Write-Error "Container restart failed with exit code $LASTEXITCODE"
}

Write-Host "🏥 Verifying restored API readiness probe ($HealthEndpoint)..." -ForegroundColor Yellow
$isReady = $false

for ($i = 1; $i -le $MaxRetries; $i++) {
    try {
        $response = Invoke-WebRequest -Uri $HealthEndpoint -UseBasicParsing -TimeoutSec 3 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            Write-Host "✅ [Probe $i/$MaxRetries] Restored API is READY and connected to PostgreSQL + Redis (HTTP 200)." -ForegroundColor Green
            $isReady = $true
            break
        }
    }
    catch {
        $status = $_.Exception.Response.StatusCode.value__
        Write-Host "⏳ [Probe $i/$MaxRetries] Waiting for rollback readiness... (HTTP $status)" -ForegroundColor DarkGray
    }
    Start-Sleep -Seconds $RetryIntervalSeconds
}

if (-not $isReady) {
    Write-Error "CRITICAL: Rolled back container failed health checks. Please inspect container logs: docker logs chitflow-api"
}

Write-Host "🔁 Reloading Nginx ingress proxy with zero dropped connections..." -ForegroundColor Yellow
docker exec chitflow-nginx nginx -s reload
if ($LASTEXITCODE -ne 0) {
    Write-Error "Nginx reload failed with exit code $LASTEXITCODE"
}

Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "🎉 Emergency Rollback Completed Successfully!" -ForegroundColor Green
Write-Host "   - Container state: RESTORED to chitflow-api:previous" -ForegroundColor Green
Write-Host "   - Deep health probe: PASSED (HTTP 200)" -ForegroundColor Green
Write-Host "   - Ingress status: Nginx RELOADED" -ForegroundColor Green
Write-Host "========================================================================" -ForegroundColor Cyan
