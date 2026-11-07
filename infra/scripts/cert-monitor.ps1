# ==============================================================================
# Kumaran Chits — SSL/TLS Certificate Expiration Monitor (PowerShell)
# Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
# Compliance: docs/03-architecture/server-and-infrastructure-resilience.md
# Threshold: Alert when certificate expiration is within 30 days
# ==============================================================================

param (
    [string]$CertPath = "infra/docker/nginx/ssl/live/fullchain.pem",
    [int]$DaysThreshold = 30
)

$ErrorActionPreference = "Stop"

Write-Host "[INFO] Running SSL/TLS certificate expiration probe..."
Write-Host "[INFO] Target certificate: $CertPath"
Write-Host "[INFO] Expiration alert threshold: $DaysThreshold days"

# Resolve relative path if necessary
if (-not (Test-Path $CertPath)) {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $resolvedPath = Join-Path $scriptDir "..\docker\nginx\ssl\live\fullchain.pem"
    if (Test-Path $resolvedPath) {
        $CertPath = (Resolve-Path $resolvedPath).Path
    } else {
        Write-Error "[CRITICAL ALERT] Certificate file not found at: $CertPath"
        exit 1
    }
}

try {
    $bytes = [System.IO.File]::ReadAllBytes($CertPath)
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2
    $cert.Import($bytes)

    $expiryDate = $cert.NotAfter
    $now = Get-Date
    $timeSpan = $expiryDate - $now
    $daysRemaining = [math]::Round($timeSpan.TotalDays, 1)

    Write-Host "[METRIC] Certificate Subject: $($cert.Subject)"
    Write-Host "[METRIC] Certificate Expiration Date: $expiryDate"
    Write-Host "[METRIC] Days Remaining: $daysRemaining days"

    if ($daysRemaining -le 0) {
        Write-Error "[CRITICAL ALERT] Certificate has EXPIRED on $expiryDate!"
        exit 1
    }

    if ($daysRemaining -le $DaysThreshold) {
        Write-Error "[CRITICAL ALERT] Certificate will expire in $daysRemaining days (threshold: $DaysThreshold days)!"
        Write-Host "[ACTION REQUIRED] Trigger Certbot renewal via 'docker compose exec certbot certbot renew' or rotate TLS keys immediately."
        exit 1
    }

    Write-Host "[SUCCESS] SSL/TLS certificate is healthy and valid for $daysRemaining days (> $DaysThreshold days)."
    exit 0
} catch {
    Write-Error "[ERROR] Failed to inspect certificate: $_"
    exit 1
}
