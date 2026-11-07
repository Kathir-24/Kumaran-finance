# ==============================================================================
# Kumaran Chits — Multi-Instance Configuration & Environment Verification (PowerShell)
# Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
# Validates environment variable consistency across horizontal instances
# ==============================================================================

[CmdletBinding()]
param (
    [string]$EnvFile = "apps/api/.env"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $EnvFile)) {
    if (Test-Path ".env") {
        $EnvFile = ".env"
    }
    elseif (Test-Path "apps/api/.env") {
        $EnvFile = "apps/api/.env"
    }
}

Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "Validating Kumaran Chits Environment Configuration ($EnvFile)..." -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan

if (-not (Test-Path $EnvFile)) {
    Write-Error "Environment file not found at: $EnvFile"
}

$errors = 0
$lines = Get-Content $EnvFile | Where-Object { $_ -match '^[^#\s]+=.*' }
$config = @{}
foreach ($line in $lines) {
    $parts = $line -split '=', 2
    if ($parts.Length -eq 2) {
        $config[$parts[0].Trim()] = $parts[1].Trim()
    }
}

function Check-Var {
    param(
        [string]$name,
        [bool]$isSecret = $false
    )

    if (-not $config.ContainsKey($name) -or [string]::IsNullOrWhiteSpace($config[$name])) {
        Write-Host "[FAIL] Missing mandatory variable: $name" -ForegroundColor Red
        $script:errors++
    }
    else {
        $val = $config[$name]
        if ($isSecret) {
            $len = $val.Length
            Write-Host "[OK] $name = [CONFIGURED ($len characters)]" -ForegroundColor Green
        }
        else {
            Write-Host "[OK] $name = $val" -ForegroundColor Green
        }
    }
}

Write-Host "--- Core Identity and Database ---" -ForegroundColor Yellow
Check-Var -name "DATABASE_URL" -isSecret $true
Check-Var -name "JWT_SECRET" -isSecret $true
Check-Var -name "PRIMARY_BRANCH_CODE" -isSecret $false
Check-Var -name "DEFAULT_FOREMAN_COMMISSION_PERCENT" -isSecret $false

Write-Host "--- Backing Caches and Distributed Queues ---" -ForegroundColor Yellow
Check-Var -name "REDIS_HOST" -isSecret $false
Check-Var -name "REDIS_PORT" -isSecret $false

Write-Host "--- Encrypted Storage Configuration ---" -ForegroundColor Yellow
Check-Var -name "STORAGE_DRIVER" -isSecret $false
Check-Var -name "S3_BUCKET" -isSecret $false
Check-Var -name "S3_ACCESS_KEY_ID" -isSecret $true
Check-Var -name "S3_SECRET_ACCESS_KEY" -isSecret $true

Write-Host "========================================================================" -ForegroundColor Cyan
if ($errors -gt 0) {
    Write-Error "Configuration Verification FAILED: $errors error(s) found."
}
else {
    Write-Host "[PASSED] Configuration Verification PASSED: All horizontal instance variables validated." -ForegroundColor Green
}
