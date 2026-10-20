# ==============================================================================
# Kumaran Chits — Automated S3 Database Backup Runner (PowerShell)
# Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
# Compliance: docs/06-devops/infrastructure-and-drp.md (§3.1, §3.2, §3.4)
# ==============================================================================

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path "$PSScriptRoot\..\.."
Set-Location $RepoRoot

Write-Host "[INFO] Starting Kumaran Chits S3 Database Backup Runner..." -ForegroundColor Cyan

# Execute the TypeScript S3 backup & 30-day retention pruner
pnpm --filter api exec ts-node scripts/backup-to-s3.ts

if ($LASTEXITCODE -eq 0) {
  Write-Host "[SUCCESS] S3 Database backup executed cleanly!" -ForegroundColor Green
} else {
  Write-Error "[ERROR] S3 Database backup script exited with non-zero code: $LASTEXITCODE"
}
