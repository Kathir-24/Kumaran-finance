# ==============================================================================
# Kumaran Chits — Automated Local Database Backup Script (PowerShell)
# Target: PostgreSQL 17 Container (chitflow-db)
# ==============================================================================

param(
  [string]$BackupDir = "$PSScriptRoot\..\backups"
)

$ErrorActionPreference = "Stop"

# 1. Ensure backup directory exists
if (!(Test-Path $BackupDir)) {
  New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupFileName = "kumaran_chits_backup_$Timestamp.dump"
$BackupFilePath = "$BackupDir\$BackupFileName"

Write-Host "[INFO] Starting database backup for Kumaran Chits..." -ForegroundColor Cyan

# 2. Check if container is running
$ContainerRunning = docker ps --filter "name=chitflow-db" --filter "status=running" --format "{{.Names}}"
if (-not $ContainerRunning) {
  Write-Error "[ERROR] Docker container 'chitflow-db' is not running. Please start it using 'docker compose up -d' in infra\docker."
}

# 3. Execute pg_dump inside container in custom format (-F c for compression and integrity)
Write-Host "[INFO] Generating binary dump from PostgreSQL 17..." -ForegroundColor Yellow
docker exec chitflow-db pg_dump -U chitflow -d chitflow_dev -F c -f "/tmp/$BackupFileName"

# 4. Copy dump out of container to host backups directory
docker cp "chitflow-db:/tmp/$BackupFileName" "$BackupFilePath"

# 5. Clean up temporary file inside container
docker exec chitflow-db rm "/tmp/$BackupFileName"

# 6. Verify backup file size
if (Test-Path $BackupFilePath) {
  $FileSize = (Get-Item $BackupFilePath).Length
  Write-Host "[SUCCESS] Backup successfully created!" -ForegroundColor Green
  Write-Host "   File: $BackupFilePath"
  Write-Host "   Size: $FileSize bytes"
} else {
  Write-Error "[ERROR] Backup file verification failed."
}
