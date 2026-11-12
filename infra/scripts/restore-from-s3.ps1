# ==============================================================================
# Kumaran Chits — Restore Database from S3 Backup (PowerShell)
# Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
# Compliance: docs/06-devops/infrastructure-and-drp.md (§3.1, §3.3)
# ==============================================================================

param(
  [string]$S3Key = "",
  [switch]$List
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path "$PSScriptRoot\..\.."
Set-Location $RepoRoot

if ($List) {
  pnpm run db:backups:list
} elseif ($S3Key) {
  pnpm run db:restore:s3 $S3Key
} else {
  Write-Host "[INFO] Restoring latest available backup from S3..." -ForegroundColor Cyan
  pnpm run db:restore:s3
}
