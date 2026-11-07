# ==============================================================================
# Kumaran Chits — Host Storage & Disk Capacity Monitor (PowerShell)
# Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
# Compliance: docs/06-devops/infrastructure-and-drp.md (§2.4)
# Threshold: Alert when disk capacity exceeds 80% (and SSL cert expires <= 30 days)
# ==============================================================================

param (
    [int]$ThresholdPercent = 80,
    [string]$DriveLetter = "C",
    [string]$CertPath = "infra/docker/nginx/ssl/live/fullchain.pem",
    [int]$CertDaysThreshold = 30
)

$ErrorActionPreference = "Stop"

Write-Host "[INFO] Running storage capacity monitor for drive: $DriveLetter"
Write-Host "[INFO] Alert threshold configured at: $ThresholdPercent%"

$drive = Get-PSDrive -Name $DriveLetter -ErrorAction SilentlyContinue
if (-not $drive) {
    # Fallback to drive from current location
    $driveLetter = (Get-Location).Drive.Name
    $drive = Get-PSDrive -Name $driveLetter
}

$usedBytes = $drive.Used
$freeBytes = $drive.Free
$totalBytes = $usedBytes + $freeBytes

$usedPercent = [math]::Round(($usedBytes / $totalBytes) * 100, 2)
$freeGb = [math]::Round($freeBytes / 1GB, 2)
$totalGb = [math]::Round($totalBytes / 1GB, 2)

Write-Host "[METRIC] Current Usage: $usedPercent% ($freeGb GB free of $totalGb GB total)"

if ($usedPercent -ge $ThresholdPercent) {
    Write-Error "[CRITICAL ALERT] Disk usage ($usedPercent%) exceeds safety threshold ($ThresholdPercent%)!"
    exit 1
}

Write-Host "[SUCCESS] Storage capacity is healthy ($usedPercent% < $ThresholdPercent%)."

# Optional SSL Certificate Expiration Check
if (Test-Path $CertPath) {
    try {
        $bytes = [System.IO.File]::ReadAllBytes($CertPath)
        $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2
        $cert.Import($bytes)

        $daysRemaining = [math]::Round(($cert.NotAfter - (Get-Date)).TotalDays, 1)
        Write-Host "[METRIC] Certificate Expiration Date: $($cert.NotAfter) ($daysRemaining days remaining)"

        if ($daysRemaining -le $CertDaysThreshold) {
            Write-Error "[CRITICAL ALERT] Certificate will expire in $daysRemaining days (threshold: $CertDaysThreshold days)!"
            exit 1
        }
        Write-Host "[SUCCESS] Certificate validity is healthy ($daysRemaining days remaining > $CertDaysThreshold days)."
    } catch {
        Write-Warning "[WARN] Could not inspect certificate: $_"
    }
}

exit 0
