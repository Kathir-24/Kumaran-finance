# ==============================================================================
# Kumaran Chits — Automated DRP Disaster Recovery Drill Runner (PowerShell)
# Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
# Compliance: docs/06-devops/infrastructure-and-drp.md (§3.1, §3.3)
# Invariants: docs/05-testing/financial-tests.md (§1 - §4), AGENTS.md §3
# ==============================================================================

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path "$PSScriptRoot\..\.."
Set-Location $RepoRoot

Write-Host "[INFO] Starting Kumaran Chits Automated DRP Disaster Recovery Drill..." -ForegroundColor Cyan

# Execute the TypeScript DRP drill engine via canonical pnpm command
pnpm run db:drp:drill

if ($LASTEXITCODE -eq 0) {
  Write-Host "[SUCCESS] Disaster Recovery Drill completed with 100% compliance!" -ForegroundColor Green
} else {
  Write-Error "[ERROR] Disaster Recovery Drill encountered failure with exit code: $LASTEXITCODE"
}
