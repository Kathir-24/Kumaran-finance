# ==============================================================================
# Kumaran Chits - Extended Concurrency Edge Cases Live Container Penetration Probes
# Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
# Invariants: PostgreSQL Row-Locking (SELECT FOR UPDATE) under concurrent load
# ==============================================================================
$ErrorActionPreference = 'Stop'
$BaseUrl = 'http://localhost:3000/api/v1'

Write-Host '========================================================================' -ForegroundColor Cyan
Write-Host '  KUMARAN CHITS - EXTENDED CONCURRENCY EDGE CASES LIVE PROBES           ' -ForegroundColor Cyan
Write-Host '  Verifying PostgreSQL Row-Locking Under Parallel Container Stress      ' -ForegroundColor Cyan
Write-Host '========================================================================' -ForegroundColor Cyan

function Query-DB([string]$Sql) {
  $out = $Sql | docker exec -i chitflow-db psql -U chitflow -d chitflow_dev -t -A
  if ($null -eq $out) { return '' }
  return ($out -join "`n").Trim()
}

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

$results = @()

# ==============================================================================
# PROBE 1: Concurrent Desk Cash Handover Contention (SELECT FOR UPDATE on Payments)
# ==============================================================================
Write-Host "`n[PROBE 1] Testing Concurrent Desk Cash Handover Contention..." -ForegroundColor Yellow

# Resolve an active branch and customer
$branchId = Query-DB 'SELECT id FROM "Branch" LIMIT 1;'
$customerId = Query-DB 'SELECT id FROM "Customer" LIMIT 1;'
$collectorUserId = 'c9fde612-cd4b-4b35-a4db-8e64f7191b2f' # Agent 1

# Create an isolated test payment in PENDING_HANDOVER
$paymentId = [guid]::NewGuid().ToString()
$insertPaymentSql = @"
INSERT INTO "Payment" (id, "branchId", "recordedByUserId", "customerId", amount, "paymentMethod", "paymentStatus", "cashHandoverStatus", "createdAt")
VALUES ('$paymentId', '$branchId', '$collectorUserId', '$customerId', 4000, 'CASH', 'SUCCESS', 'PENDING_HANDOVER', NOW());
"@
Query-DB $insertPaymentSql | Out-Null
Write-Host "  -> Seeded test payment $paymentId in PENDING_HANDOVER" -ForegroundColor Gray

# Launch 2 parallel background jobs targeting the exact same handover batch
$scriptBlockHandover = {
  param($Url, $Token, $CollectorId, $PayId, $WorkerIdx)
  $hdrs = @{
    Authorization = "Bearer $Token"
    'Content-Type' = 'application/json'
  }
  $body = @{
    collectorUserId = $CollectorId
    acknowledgedAmount = 4000
    paymentIds = @($PayId)
    notes = "Parallel worker $WorkerIdx live test"
  } | ConvertTo-Json
  
  try {
    $res = Invoke-RestMethod -Uri "$Url/collections/cash-handover/acknowledge" -Method Post -Headers $hdrs -Body $body -UseBasicParsing
    return @{ Worker = $WorkerIdx; Status = 200; Data = $res }
  } catch {
    $code = 0
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    $msg = $_.ErrorDetails.Message
    return @{ Worker = $WorkerIdx; Status = $code; Error = $msg }
  }
}

$job1 = Start-Job -ScriptBlock $scriptBlockHandover -ArgumentList $BaseUrl, $adminToken, $collectorUserId, $paymentId, 1
$job2 = Start-Job -ScriptBlock $scriptBlockHandover -ArgumentList $BaseUrl, $adminToken, $collectorUserId, $paymentId, 2

$job1Res = Receive-Job -Job $job1 -Wait
$job2Res = Receive-Job -Job $job2 -Wait
Remove-Job -Job $job1, $job2

$statuses = @($job1Res.Status, $job2Res.Status)
$successCount = ($statuses | Where-Object { $_ -eq 200 }).Count
$rejectedCount = ($statuses | Where-Object { $_ -eq 400 }).Count

$probe1Passed = ($successCount -eq 1 -and $rejectedCount -eq 1)

# Check final status in DB
$finalStatus = Query-DB "SELECT ""cashHandoverStatus"" FROM ""Payment"" WHERE id = '$paymentId';"
if ($finalStatus -ne 'ACKNOWLEDGED') {
  $probe1Passed = $false
}

# Cleanup
Query-DB "DELETE FROM ""AuditLog"" WHERE ""action"" = 'CASH_HANDOVER_ACKNOWLEDGED' AND ""entityId"" = '$collectorUserId' AND ""timestamp"" > NOW() - INTERVAL '5 minutes';" | Out-Null
Query-DB "DELETE FROM ""Payment"" WHERE id = '$paymentId';" | Out-Null

if ($probe1Passed) {
  Write-Host "  -> PASS: Handover Stampede resolved cleanly (1 HTTP 200, 1 HTTP 400 rejected, DB=ACKNOWLEDGED)" -ForegroundColor Green
  $results += [PSCustomObject]@{ Probe = 'CONCURR-PROBE-1 (Cash Handover)'; Status = 'PASS'; Detail = '1 winner, 1 rejected with row lock' }
} else {
  Write-Host "  -> FAIL: Handover Stampede failed (Success: $successCount, Rejected: $rejectedCount, Final DB: $finalStatus)" -ForegroundColor Red
  $results += [PSCustomObject]@{ Probe = 'CONCURR-PROBE-1 (Cash Handover)'; Status = 'FAIL'; Detail = "Success=$successCount, Rejected=$rejectedCount" }
}


# ==============================================================================
# PROBE 2: Concurrent Defaulter Ticket Substitution Race (SELECT FOR UPDATE)
# ==============================================================================
Write-Host "`n[PROBE 2] Testing Concurrent Defaulter Ticket Substitution Race..." -ForegroundColor Yellow

$chitGroupId = Query-DB 'SELECT id FROM "ChitGroup" LIMIT 1;'
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

# Create isolated defaulter customer
$defCustId = [guid]::NewGuid().ToString()
$insertDefCustSql = @"
INSERT INTO "Customer" (id, "branchId", "customerCode", "fullName", phone, "addressLine1", city, pincode, "isKycVerified", "createdAt", "updatedAt")
VALUES ('$defCustId', '$branchId', 'KC-CUST-DEF-$timestamp', 'Defaulter Test User', '91998$($timestamp.ToString().Substring($timestamp.ToString().Length - 5))9', 'Defaulter Road', 'Erode', '638052', true, NOW(), NOW());
"@
Query-DB $insertDefCustSql | Out-Null

# Create isolated vacated ticket in REMOVED_DEF_3M
$ticketId = [guid]::NewGuid().ToString()
$adminUserId = 'ebf67759-bf05-4fa6-b653-577b3f144900'
$insertTicketSql = @"
INSERT INTO "SubscriberTicket" (id, "chitGroupId", "customerId", "ticketNumber", status, "consecutiveUnpaidMonths", "removedAt", "removedByUserId", "joiningDate")
VALUES ('$ticketId', '$chitGroupId', '$defCustId', 9988, 'REMOVED_DEF_3M', 3, NOW(), '$adminUserId', NOW());
"@
Query-DB $insertTicketSql | Out-Null

# Create 2 candidate replacement customers with verified KYC
$cand1Id = [guid]::NewGuid().ToString()
$cand2Id = [guid]::NewGuid().ToString()
$insertCand1Sql = @"
INSERT INTO "Customer" (id, "branchId", "customerCode", "fullName", phone, "addressLine1", city, pincode, "isKycVerified", "createdAt", "updatedAt")
VALUES ('$cand1Id', '$branchId', 'KC-CUST-RACE-$timestamp-1', 'Candidate Customer 1', '91991$($timestamp.ToString().Substring($timestamp.ToString().Length - 5))1', 'Sub Road 1', 'Erode', '638052', true, NOW(), NOW());
"@
$insertCand2Sql = @"
INSERT INTO "Customer" (id, "branchId", "customerCode", "fullName", phone, "addressLine1", city, pincode, "isKycVerified", "createdAt", "updatedAt")
VALUES ('$cand2Id', '$branchId', 'KC-CUST-RACE-$timestamp-2', 'Candidate Customer 2', '91991$($timestamp.ToString().Substring($timestamp.ToString().Length - 5))2', 'Sub Road 2', 'Erode', '638052', true, NOW(), NOW());
"@
Query-DB $insertCand1Sql | Out-Null
Query-DB $insertCand2Sql | Out-Null

Write-Host "  -> Seeded vacated ticket $ticketId and 2 replacement candidate customers" -ForegroundColor Gray

# Launch 2 parallel background jobs attempting to substitute the ticket
$scriptBlockSub = {
  param($Url, $Token, $TId, $NewCustId, $WorkerIdx)
  $hdrs = @{
    Authorization = "Bearer $Token"
    'Content-Type' = 'application/json'
  }
  $body = @{
    newCustomerId = $NewCustId
    reason = "Parallel live probe substitution worker $WorkerIdx"
  } | ConvertTo-Json
  
  try {
    $res = Invoke-RestMethod -Uri "$Url/tickets/$TId/substitute" -Method Post -Headers $hdrs -Body $body -UseBasicParsing
    return @{ Worker = $WorkerIdx; Status = 200; Data = $res }
  } catch {
    $code = 0
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    $msg = $_.ErrorDetails.Message
    return @{ Worker = $WorkerIdx; Status = $code; Error = $msg }
  }
}

$subJob1 = Start-Job -ScriptBlock $scriptBlockSub -ArgumentList $BaseUrl, $adminToken, $ticketId, $cand1Id, 1
$subJob2 = Start-Job -ScriptBlock $scriptBlockSub -ArgumentList $BaseUrl, $adminToken, $ticketId, $cand2Id, 2

$sub1Res = Receive-Job -Job $subJob1 -Wait
$sub2Res = Receive-Job -Job $subJob2 -Wait
Remove-Job -Job $subJob1, $subJob2

$subStatuses = @($sub1Res.Status, $sub2Res.Status)
$subSuccessCount = ($subStatuses | Where-Object { $_ -eq 200 }).Count
$subRejectedCount = ($subStatuses | Where-Object { $_ -eq 400 }).Count

$probe2Passed = ($subSuccessCount -eq 1 -and $subRejectedCount -eq 1)

# Check final ticket status and customer in DB
$finalTicketRow = Query-DB "SELECT status || '|' || ""customerId"" FROM ""SubscriberTicket"" WHERE id = '$ticketId';"
$finalTicketParts = $finalTicketRow.Split('|')
$finalTicketStatus = $finalTicketParts[0]
$finalAssignedCust = $finalTicketParts[1]

if ($finalTicketStatus -ne 'ACTIVE' -or ($finalAssignedCust -ne $cand1Id -and $finalAssignedCust -ne $cand2Id)) {
  $probe2Passed = $false
}

# Cleanup
Query-DB "DELETE FROM ""AuditLog"" WHERE ""action"" = 'TICKET_SUBSCRIBER_SUBSTITUTED' AND ""entityId"" = '$ticketId';" | Out-Null
Query-DB "DELETE FROM ""SubscriberTicket"" WHERE id = '$ticketId';" | Out-Null
Query-DB "DELETE FROM ""Customer"" WHERE id IN ('$defCustId', '$cand1Id', '$cand2Id');" | Out-Null

if ($probe2Passed) {
  Write-Host "  -> PASS: Substitution Race resolved cleanly (1 HTTP 200, 1 HTTP 400 rejected, Ticket restored to ACTIVE)" -ForegroundColor Green
  $results += [PSCustomObject]@{ Probe = 'CONCURR-PROBE-2 (Ticket Substitution)'; Status = 'PASS'; Detail = '1 winner, 1 rejected with row lock' }
} else {
  Write-Host "  -> FAIL: Substitution Race failed (Success: $subSuccessCount, Rejected: $subRejectedCount, Status: $finalTicketStatus)" -ForegroundColor Red
  $results += [PSCustomObject]@{ Probe = 'CONCURR-PROBE-2 (Ticket Substitution)'; Status = 'FAIL'; Detail = "Success=$subSuccessCount, Rejected=$subRejectedCount" }
}

# ==============================================================================
# SUMMARY TABLE
# ==============================================================================
Write-Host "`n========================================================================" -ForegroundColor Cyan
Write-Host "                      EXTENDED CONCURRENCY PROBES SUMMARY               " -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan
$results | Format-Table -AutoSize

$failedCount = ($results | Where-Object { $_.Status -ne 'PASS' }).Count
if ($failedCount -eq 0) {
  Write-Host "`nALL EXTENDED CONCURRENCY PROBES PASSED! PostgreSQL Row Locking verified on Live Container.`n" -ForegroundColor Green
  exit 0
} else {
  Write-Host "`n$failedCount EXTENDED CONCURRENCY PROBES FAILED.`n" -ForegroundColor Red
  exit 1
}
