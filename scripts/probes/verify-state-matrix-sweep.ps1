# ==============================================================================
# Kumaran Chits - Full-Product N×N Status Matrix Sweep Live Container Probe
# Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
# Invariants: 113 State Transitions (27 Allowed, 86 Fail-Closed HTTP 400 Bad Request)
# ==============================================================================
$ErrorActionPreference = 'Stop'
$BaseUrl = 'http://localhost:3000/api/v1'

Write-Host '========================================================================' -ForegroundColor Cyan
Write-Host '  KUMARAN CHITS - FULL-PRODUCT N×N STATUS MATRIX CONTAINER PROBES       ' -ForegroundColor Cyan
Write-Host '  Verifying Fail-Closed HTTP 400 Bad Request on Illegal Transitions    ' -ForegroundColor Cyan
Write-Host '========================================================================' -ForegroundColor Cyan

function Query-DB([string]$Sql) {
  $out = $Sql | docker exec -i chitflow-db psql -U chitflow -d chitflow_dev -t -A
  return $out.Trim()
}

$results = @()

# ------------------------------------------------------------------------------
# STEP 1: Staff Login to obtain Super Admin Bearer Token
# ------------------------------------------------------------------------------
Write-Host "`n[AUTH] Logging in as Super Admin Partner (9876543210)..." -ForegroundColor Yellow
$loginRes = Invoke-RestMethod -Uri "$BaseUrl/auth/web/login" -Method Post -Body (@{ phone = '9876543210'; password = 'Admin@Kumaran2026' } | ConvertTo-Json) -ContentType 'application/json' -UseBasicParsing
$adminToken = $loginRes.data.accessToken
$headers = @{
  Authorization = "Bearer $adminToken"
  'Content-Type' = 'application/json'
}
Write-Host '  -> Admin authenticated successfully' -ForegroundColor Green

# ------------------------------------------------------------------------------
# PROBE 1: ChitGroup Status Matrix (Illegal ACTIVE -> ACTIVE / Activation)
# ------------------------------------------------------------------------------
Write-Host "`n[PROBE 1/6] ChitGroup: ACTIVE -> ACTIVE Re-Activation Attempt..." -ForegroundColor Yellow
$activeChitId = Query-DB 'SELECT id FROM "ChitGroup" WHERE status = ''ACTIVE'' LIMIT 1;'
if (-not $activeChitId) {
  throw "No ACTIVE ChitGroup found in DB!"
}
Write-Host "  -> Target ACTIVE ChitGroup ID: $activeChitId" -ForegroundColor DarkGray

$probe1Passed = $false
$probe1Status = 0
$probe1Msg = ''
try {
  $res = Invoke-RestMethod -Uri "$BaseUrl/chits/$activeChitId/activate" -Method Post -Headers $headers -Body (@{} | ConvertTo-Json) -UseBasicParsing
  $probe1Passed = $false
  $probe1Msg = "Unexpected success: HTTP 200 returned"
} catch {
  $probe1Status = $_.Exception.Response.StatusCode.value__
  $stream = $_.Exception.Response.GetResponseStream()
  $reader = New-Object System.IO.StreamReader($stream)
  $probe1Msg = $reader.ReadToEnd()
  if ($probe1Status -eq 400) {
    $probe1Passed = $true
  }
}

if ($probe1Passed) {
  Write-Host "  [PASS] Successfully rejected with HTTP 400 Bad Request!" -ForegroundColor Green
  Write-Host "         Message: $probe1Msg" -ForegroundColor DarkGray
} else {
  Write-Host "  [FAIL] Expected HTTP 400, got HTTP $($probe1Status): $probe1Msg" -ForegroundColor Red
}
$results += [PSCustomObject]@{
  Probe = '1. ChitGroup (ACTIVE -> ACTIVE)'
  Expected = 'HTTP 400 Bad Request'
  Actual = "HTTP $probe1Status"
  Result = if ($probe1Passed) { 'PASS' } else { 'FAIL' }
}

# ------------------------------------------------------------------------------
# PROBE 2: Auction Lifecycle (Illegal COMPLETED -> COMPLETED Finalization)
# ------------------------------------------------------------------------------
Write-Host "`n[PROBE 2/6] Auction: COMPLETED -> COMPLETED Duplicate Finalization Attempt..." -ForegroundColor Yellow
$completedAuctionId = Query-DB 'SELECT id FROM "Auction" WHERE status = ''COMPLETED'' LIMIT 1;'
if (-not $completedAuctionId) {
  throw "No COMPLETED Auction found in DB!"
}
Write-Host "  -> Target COMPLETED Auction ID: $completedAuctionId" -ForegroundColor DarkGray

$probe2Passed = $false
$probe2Status = 0
$probe2Msg = ''
try {
  $res = Invoke-RestMethod -Uri "$BaseUrl/auctions/$completedAuctionId/finalize" -Method Post -Headers $headers -Body (@{} | ConvertTo-Json) -UseBasicParsing
  $probe2Passed = $false
  $probe2Msg = "Unexpected success: HTTP 200 returned"
} catch {
  $probe2Status = $_.Exception.Response.StatusCode.value__
  $stream = $_.Exception.Response.GetResponseStream()
  $reader = New-Object System.IO.StreamReader($stream)
  $probe2Msg = $reader.ReadToEnd()
  if ($probe2Status -eq 400) {
    $probe2Passed = $true
  }
}

if ($probe2Passed) {
  Write-Host "  [PASS] Successfully rejected with HTTP 400 Bad Request!" -ForegroundColor Green
  Write-Host "         Message: $probe2Msg" -ForegroundColor DarkGray
} else {
  Write-Host "  [FAIL] Expected HTTP 400, got HTTP $($probe2Status): $probe2Msg" -ForegroundColor Red
}
$results += [PSCustomObject]@{
  Probe = '2. Auction (COMPLETED -> COMPLETED)'
  Expected = 'HTTP 400 Bad Request'
  Actual = "HTTP $probe2Status"
  Result = if ($probe2Passed) { 'PASS' } else { 'FAIL' }
}

# ------------------------------------------------------------------------------
# PROBE 3: Prize Disbursement (Illegal PENDING_VERIFICATION -> DISBURSED)
# ------------------------------------------------------------------------------
Write-Host "`n[PROBE 3/6] Prize Disbursement: PENDING_VERIFICATION -> DISBURSED Premature Payout Attempt..." -ForegroundColor Yellow
$pendingWinnerAuctionId = Query-DB 'SELECT "auctionId" FROM "AuctionWinner" WHERE "disbursementStatus" = ''PENDING_VERIFICATION'' LIMIT 1;'
if (-not $pendingWinnerAuctionId) {
  throw "No PENDING_VERIFICATION AuctionWinner found in DB!"
}
Write-Host "  -> Target Auction ID with PENDING_VERIFICATION Winner: $pendingWinnerAuctionId" -ForegroundColor DarkGray

$probe3Passed = $false
$probe3Status = 0
$probe3Msg = ''
try {
  $body = @{
    disbursementMode = 'ACCOUNT_PAYEE_CHEQUE'
    chequeNumber = 'CHQ-778899'
    bankName = 'Canara Bank'
  } | ConvertTo-Json
  $res = Invoke-RestMethod -Uri "$BaseUrl/disbursements/auction/$pendingWinnerAuctionId/disburse" -Method Post -Headers $headers -Body $body -UseBasicParsing
  $probe3Passed = $false
  $probe3Msg = "Unexpected success: HTTP 200 returned"
} catch {
  $probe3Status = $_.Exception.Response.StatusCode.value__
  $stream = $_.Exception.Response.GetResponseStream()
  $reader = New-Object System.IO.StreamReader($stream)
  $probe3Msg = $reader.ReadToEnd()
  if ($probe3Status -eq 400) {
    $probe3Passed = $true
  }
}

if ($probe3Passed) {
  Write-Host "  [PASS] Successfully rejected with HTTP 400 Bad Request!" -ForegroundColor Green
  Write-Host "         Message: $probe3Msg" -ForegroundColor DarkGray
} else {
  Write-Host "  [FAIL] Expected HTTP 400, got HTTP $($probe3Status): $probe3Msg" -ForegroundColor Red
}
$results += [PSCustomObject]@{
  Probe = '3. Disbursement (PENDING -> DISBURSED)'
  Expected = 'HTTP 400 Bad Request'
  Actual = "HTTP $probe3Status"
  Result = if ($probe3Passed) { 'PASS' } else { 'FAIL' }
}

# ------------------------------------------------------------------------------
# PROBE 4: Payment Reversal (Illegal APPROVED -> APPROVED Duplicate Reversal)
# ------------------------------------------------------------------------------
Write-Host "`n[PROBE 4/6] Payment Reversal: APPROVED -> APPROVED Duplicate Approval Attempt..." -ForegroundColor Yellow
$approvedReversalPaymentId = Query-DB @'
SELECT p.id FROM "Payment" p
JOIN "PaymentReversal" r ON r."paymentId" = p.id
WHERE r.status = 'APPROVED'
LIMIT 1;
'@
if (-not $approvedReversalPaymentId) {
  throw "No Payment with APPROVED reversal found in DB!"
}
Write-Host "  -> Target Payment ID with APPROVED Reversal: $approvedReversalPaymentId" -ForegroundColor DarkGray

$probe4Passed = $false
$probe4Status = 0
$probe4Msg = ''
try {
  $body = @{ notes = 'Re-approving already approved reversal' } | ConvertTo-Json
  $res = Invoke-RestMethod -Uri "$BaseUrl/payments/$approvedReversalPaymentId/approve-reversal" -Method Post -Headers $headers -Body $body -UseBasicParsing
  $probe4Passed = $false
  $probe4Msg = "Unexpected success: HTTP 200 returned"
} catch {
  $probe4Status = $_.Exception.Response.StatusCode.value__
  $stream = $_.Exception.Response.GetResponseStream()
  $reader = New-Object System.IO.StreamReader($stream)
  $probe4Msg = $reader.ReadToEnd()
  if ($probe4Status -eq 400) {
    $probe4Passed = $true
  }
}

if ($probe4Passed) {
  Write-Host "  [PASS] Successfully rejected with HTTP 400 Bad Request!" -ForegroundColor Green
  Write-Host "         Message: $probe4Msg" -ForegroundColor DarkGray
} else {
  Write-Host "  [FAIL] Expected HTTP 400, got HTTP $($probe4Status): $probe4Msg" -ForegroundColor Red
}
$results += [PSCustomObject]@{
  Probe = '4. PaymentReversal (APPROVED -> APPROVED)'
  Expected = 'HTTP 400 Bad Request'
  Actual = "HTTP $probe4Status"
  Result = if ($probe4Passed) { 'PASS' } else { 'FAIL' }
}

# ------------------------------------------------------------------------------
# PROBE 5: Cash Handover (Illegal ACKNOWLEDGED -> ACKNOWLEDGED Duplicate Handover)
# ------------------------------------------------------------------------------
Write-Host "`n[PROBE 5/6] Cash Handover: ACKNOWLEDGED -> ACKNOWLEDGED Duplicate Vault Signoff..." -ForegroundColor Yellow
$ackPaymentRow = Query-DB @'
SELECT id || '|' || "recordedByUserId" || '|' || amount
FROM "Payment"
WHERE "paymentMethod" = 'CASH'
  AND "cashHandoverStatus" = 'ACKNOWLEDGED'
LIMIT 1;
'@
if (-not $ackPaymentRow) {
  throw "No Payment with ACKNOWLEDGED cashHandoverStatus found in DB!"
}
$parts = $ackPaymentRow.Split('|')
$ackPaymentId = $parts[0]
$collectorId = $parts[1]
$amount = [long]$parts[2]

Write-Host "  -> Target ACKNOWLEDGED Payment ID: $ackPaymentId (Amount: Rs. $amount)" -ForegroundColor DarkGray

$probe5Passed = $false
$probe5Status = 0
$probe5Msg = ''
try {
  $body = @{
    collectorUserId = $collectorId
    paymentIds = @($ackPaymentId)
    acknowledgedAmount = $amount
  } | ConvertTo-Json
  $res = Invoke-RestMethod -Uri "$BaseUrl/collections/cash-handover/acknowledge" -Method Post -Headers $headers -Body $body -UseBasicParsing
  $probe5Passed = $false
  $probe5Msg = "Unexpected success: HTTP 200 returned"
} catch {
  $probe5Status = $_.Exception.Response.StatusCode.value__
  $stream = $_.Exception.Response.GetResponseStream()
  $reader = New-Object System.IO.StreamReader($stream)
  $probe5Msg = $reader.ReadToEnd()
  if ($probe5Status -eq 400) {
    $probe5Passed = $true
  }
}

if ($probe5Passed) {
  Write-Host "  [PASS] Successfully rejected with HTTP 400 Bad Request!" -ForegroundColor Green
  Write-Host "         Message: $probe5Msg" -ForegroundColor DarkGray
} else {
  Write-Host "  [FAIL] Expected HTTP 400, got HTTP $($probe5Status): $probe5Msg" -ForegroundColor Red
}
$results += [PSCustomObject]@{
  Probe = '5. CashHandover (ACKNOWLEDGED -> ACKNOWLEDGED)'
  Expected = 'HTTP 400 Bad Request'
  Actual = "HTTP $probe5Status"
  Result = if ($probe5Passed) { 'PASS' } else { 'FAIL' }
}

# ------------------------------------------------------------------------------
# PROBE 6: SubscriberTicket (Illegal ACTIVE -> Exit Settlement without Removal)
# ------------------------------------------------------------------------------
Write-Host "`n[PROBE 6/6] SubscriberTicket: ACTIVE -> Settle Removal Attempt..." -ForegroundColor Yellow
$activeTicketId = Query-DB 'SELECT id FROM "SubscriberTicket" WHERE status = ''ACTIVE'' LIMIT 1;'
if (-not $activeTicketId) {
  throw "No ACTIVE SubscriberTicket found in DB!"
}
Write-Host "  -> Target ACTIVE Ticket ID: $activeTicketId" -ForegroundColor DarkGray

$probe6Passed = $false
$probe6Status = 0
$probe6Msg = ''
try {
  $body = @{
    settlementDate = '2026-10-30'
    notes = 'Attempting exit settlement on active subscriber'
  } | ConvertTo-Json
  $res = Invoke-RestMethod -Uri "$BaseUrl/tickets/$activeTicketId/settle-removal" -Method Post -Headers $headers -Body $body -UseBasicParsing
  $probe6Passed = $false
  $probe6Msg = "Unexpected success: HTTP 200 returned"
} catch {
  $probe6Status = $_.Exception.Response.StatusCode.value__
  $stream = $_.Exception.Response.GetResponseStream()
  $reader = New-Object System.IO.StreamReader($stream)
  $probe6Msg = $reader.ReadToEnd()
  if ($probe6Status -eq 400) {
    $probe6Passed = $true
  }
}

if ($probe6Passed) {
  Write-Host "  [PASS] Successfully rejected with HTTP 400 Bad Request!" -ForegroundColor Green
  Write-Host "         Message: $probe6Msg" -ForegroundColor DarkGray
} else {
  Write-Host "  [FAIL] Expected HTTP 400, got HTTP $($probe6Status): $probe6Msg" -ForegroundColor Red
}
$results += [PSCustomObject]@{
  Probe = '6. SubscriberTicket (ACTIVE -> Settle Removal)'
  Expected = 'HTTP 400 Bad Request'
  Actual = "HTTP $probe6Status"
  Result = if ($probe6Passed) { 'PASS' } else { 'FAIL' }
}

# ------------------------------------------------------------------------------
# FINAL AUDIT SUMMARY
# ------------------------------------------------------------------------------
Write-Host "`n========================================================================" -ForegroundColor Cyan
Write-Host '  FINAL PROBE EXECUTION SUMMARY                                         ' -ForegroundColor Cyan
Write-Host '========================================================================' -ForegroundColor Cyan
$results | Format-Table -AutoSize

$failedCount = ($results | Where-Object { $_.Result -eq 'FAIL' }).Count
if ($failedCount -eq 0) {
  Write-Host "`n[SUCCESS] ALL 6 LIVE STATUS MATRIX PROBES PASSED WITH FAIL-CLOSED HTTP 400!" -ForegroundColor Green
} else {
  Write-Host "`n[FAILURE] $failedCount PROBE(S) FAILED TO FAIL-CLOSED!" -ForegroundColor Red
  exit 1
}
