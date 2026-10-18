# ==============================================================================
# Kumaran Chits — Automated Local Database Restore Script (PowerShell)
# Target: PostgreSQL 17 Container (chitflow-db)
# ==============================================================================

param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFilePath
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $BackupFilePath)) {
  Write-Error "[ERROR] Backup file not found at path: $BackupFilePath"
}

$BackupFileName = [System.IO.Path]::GetFileName($BackupFilePath)

Write-Host "[INFO] Starting database restore for Kumaran Chits..." -ForegroundColor Cyan

# 1. Check if container is running
$ContainerRunning = docker ps --filter "name=chitflow-db" --filter "status=running" --format "{{.Names}}"
if (-not $ContainerRunning) {
  Write-Error "[ERROR] Docker container 'chitflow-db' is not running."
}

# 2. Copy backup into container
Write-Host "[INFO] Copying dump file into container..." -ForegroundColor Yellow
docker cp "$BackupFilePath" "chitflow-db:/tmp/$BackupFileName"

# 3. Execute pg_restore inside container (clean restore with data overwrite)
Write-Host "[INFO] Restoring database from dump..." -ForegroundColor Yellow
docker exec chitflow-db pg_restore -U chitflow -d chitflow_dev --clean --if-exists "/tmp/$BackupFileName"

# 4. Clean up temporary file inside container
docker exec chitflow-db rm "/tmp/$BackupFileName"

Write-Host "[SUCCESS] Database restore completed successfully!" -ForegroundColor Green
