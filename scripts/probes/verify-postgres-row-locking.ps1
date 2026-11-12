# ==============================================================================
# Kumaran Chits - Real PostgreSQL Row-Lock Concurrency Live Verification
# Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
# Invariants: ADR-07 Zero Double-Spending, SELECT ... FOR UPDATE Row Serialization
# ==============================================================================
$ErrorActionPreference = 'Stop'
$BaseUrl = 'http://localhost:3000/api/v1'

Write-Host '========================================================================' -ForegroundColor Cyan
Write-Host '  KUMARAN CHITS - REAL POSTGRESQL ROW-LOCKING CONCURRENCY PROBES        ' -ForegroundColor Cyan
Write-Host '========================================================================' -ForegroundColor Cyan

function Query-DB([string]$Sql) {
  $out = $Sql | docker exec -i chitflow-db psql -U chitflow -d chitflow_dev -t -A
  return $out.Trim()
}

# ------------------------------------------------------------------------------
# STEP 1: Staff Login to obtain Admin Bearer Token
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 1] Logging in as Partner Admin (9876543210)..." -ForegroundColor Yellow
$loginRes = Invoke-RestMethod -Uri "$BaseUrl/auth/web/login" -Method Post -Body (@{ phone = '9876543210'; password = 'Admin@Kumaran2026' } | ConvertTo-Json) -ContentType 'application/json' -UseBasicParsing
$adminToken = $loginRes.data.accessToken
Write-Host '  -> Admin authenticated successfully' -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 2: Find target UNPAID Installment Due
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 2] Finding target UNPAID Installment Due for double-payment stampede..." -ForegroundColor Yellow
$dueRow = Query-DB @'
SELECT d.id || '|' || d."ticketId" || '|' || d."installmentMonth" || '|' || d."netPayableAmount" || '|' || c."fullName"
FROM "InstallmentDue" d
JOIN "SubscriberTicket" t ON d."ticketId" = t.id
JOIN "Customer" c ON t."customerId" = c.id
WHERE d.status = 'UNPAID'
  AND NOT EXISTS (
    SELECT 1 FROM "PaymentAllocation" pa
    JOIN "Payment" p ON pa."paymentId" = p.id
    WHERE pa."installmentDueId" = d.id AND p."paymentStatus" = 'SUCCESS'
  )
LIMIT 1;
'@

if (-not $dueRow) {
  throw "No UNPAID installment dues found in database to test concurrency!"
}

$parts = $dueRow.Split('|')
$dueId = $parts[0]
$ticketId = $parts[1]
$month = [int]$parts[2]
$amount = [long]$parts[3]
$customerName = $parts[4]

Write-Host "  -> Target Due ID: $dueId" -ForegroundColor Cyan
Write-Host "  -> Ticket ID: $ticketId" -ForegroundColor Cyan
Write-Host "  -> Month: $month, Net Payable: Rs. $amount" -ForegroundColor Cyan
Write-Host "  -> Customer: $customerName" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# STEP 3: Fire 10 Simultaneous Parallel HTTP Payment Requests (Race Condition)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 3] Launching 10 Simultaneous Parallel HTTP Requests on Due $dueId..." -ForegroundColor Yellow
$concurrencyCount = 10
$timestamp = Get-Date -Format 'yyyyMMddHHmmss'

$scriptBlock = {
  param($BaseUrl, $adminToken, $ticketId, $month, $amount, $workerId, $timestamp)
  $body = @{
    ticketId = $ticketId
    installmentMonth = $month
    amount = $amount
    paymentMethod = 'CASH'
    idempotencyKey = "live-stampede-$timestamp-$workerId"
    notes = "Live Concurrency Stampede Worker #$workerId"
  } | ConvertTo-Json

  $headers = @{
    Authorization = "Bearer $adminToken"
    'Content-Type' = 'application/json'
  }

  try {
    $res = Invoke-WebRequest -Uri "$BaseUrl/payments" -Method Post -Headers $headers -Body $body -UseBasicParsing
    return @{ Worker = $workerId; StatusCode = [int]$res.StatusCode; Content = $res.Content }
  } catch [System.Net.WebException] {
    $resp = $_.Exception.Response
    $stream = $resp.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $errContent = $reader.ReadToEnd()
    return @{ Worker = $workerId; StatusCode = [int]$resp.StatusCode; Content = $errContent }
  } catch {
    return @{ Worker = $workerId; StatusCode = 500; Content = $_.Exception.Message }
  }
}

$tasks = @()
for ($i = 1; $i -le $concurrencyCount; $i++) {
  $tasks += Start-Job -ScriptBlock $scriptBlock -ArgumentList $BaseUrl, $adminToken, $ticketId, $month, $amount, $i, $timestamp
}

Write-Host "  -> Waiting for all $concurrencyCount parallel threads to complete..." -ForegroundColor Cyan
$jobResults = $tasks | Wait-Job | Receive-Job
$tasks | Remove-Job -Force

$successCount = 0
$rejectedCount = 0
$serverErrorCount = 0

foreach ($res in $jobResults) {
  if ($res.StatusCode -eq 201 -or $res.StatusCode -eq 200) {
    $successCount++
    Write-Host "     Worker $($res.Worker): SUCCESS (HTTP $($res.StatusCode))" -ForegroundColor Green
  } elseif ($res.StatusCode -eq 400 -or $res.StatusCode -eq 409) {
    $rejectedCount++
    Write-Host "     Worker $($res.Worker): REJECTED (HTTP $($res.StatusCode)) - Serialized by SELECT FOR UPDATE" -ForegroundColor DarkYellow
  } else {
    $serverErrorCount++
    Write-Host "     Worker $($res.Worker): ERROR (HTTP $($res.StatusCode)): $($res.Content)" -ForegroundColor Red
  }
}

$successColor = if ($successCount -eq 1) { 'Green' } else { 'Red' }
$rejectedColor = if ($rejectedCount -eq ($concurrencyCount - 1)) { 'Green' } else { 'Red' }
$errorColor = if ($serverErrorCount -eq 0) { 'Green' } else { 'Red' }

Write-Host "`n  -> Parallel HTTP Outcome:" -ForegroundColor Yellow
Write-Host "     Successes: $successCount (Expected: 1)" -ForegroundColor $successColor
Write-Host "     Rejections: $rejectedCount (Expected: 9)" -ForegroundColor $rejectedColor
Write-Host "     Server Crashes (500): $serverErrorCount (Expected: 0)" -ForegroundColor $errorColor

if ($successCount -ne 1 -or $rejectedCount -ne ($concurrencyCount - 1) -or $serverErrorCount -gt 0) {
  throw "FAIL: Concurrency race condition allowed multiple payments or caused server errors!"
}

# ------------------------------------------------------------------------------
# STEP 4: Verify Database Financial Invariants Directly in PostgreSQL
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 4] Verifying PostgreSQL Row-Level State Invariants..." -ForegroundColor Yellow

$sqlStatus = "SELECT status FROM ""InstallmentDue"" WHERE id = '$dueId';"
$sqlPaid = "SELECT ""paidAmount"" FROM ""InstallmentDue"" WHERE id = '$dueId';"
$sqlAlloc = "SELECT COUNT(*) FROM ""PaymentAllocation"" WHERE ""installmentDueId"" = '$dueId';"

$postDueStatus = Query-DB $sqlStatus
$postPaidAmount = Query-DB $sqlPaid
$postAllocCount = Query-DB $sqlAlloc

Write-Host "  -> [POSTGRES VERIFIED] InstallmentDue.status: $postDueStatus (Expected: PAID)" -ForegroundColor Green
Write-Host "  -> [POSTGRES VERIFIED] InstallmentDue.paidAmount: $postPaidAmount (Expected: $amount)" -ForegroundColor Green
Write-Host "  -> [POSTGRES VERIFIED] Active PaymentAllocations: $postAllocCount (Expected: 1)" -ForegroundColor Green

if ($postDueStatus -ne 'PAID' -or [long]$postPaidAmount -ne $amount -or $postAllocCount -ne '1') {
  throw "FAIL: PostgreSQL invariants violated! Double-spending detected!"
}

Write-Host "`n========================================================================" -ForegroundColor Green
Write-Host "  PROBLEM 4 VERIFIED: POSTGRESQL ROW LOCKING 100% BULLETPROOF!          " -ForegroundColor Green
Write-Host "========================================================================" -ForegroundColor Green
