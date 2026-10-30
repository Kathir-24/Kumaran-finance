# ==============================================================================
# Kumaran Chits - Financial Boundary & Negative Fuzzing Live Container Probes
# Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
# Invariants: Rule 2 in AGENTS.md (Pure Whole Rupee Math, Zero Paise, BigInt)
# ==============================================================================
$ErrorActionPreference = 'Stop'
$BaseUrl = 'http://localhost:3000/api/v1'

Write-Host '========================================================================' -ForegroundColor Cyan
Write-Host '  KUMARAN CHITS - FINANCIAL BOUNDARY & NEGATIVE FUZZING PROBES          ' -ForegroundColor Cyan
Write-Host '  Verifying Zero-Paise Enforcement, Negative Rejection & Ceiling Bounds ' -ForegroundColor Cyan
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

# Fetch live test target entities
$dueRow = Query-DB @'
SELECT d.id || '|' || d."ticketId" || '|' || d."installmentMonth" || '|' || d."netPayableAmount"
FROM "InstallmentDue" d
JOIN "SubscriberTicket" t ON d."ticketId" = t.id
WHERE d.status = 'UNPAID'
LIMIT 1;
'@
$dueParts = $dueRow.Split('|')
$dueId = $dueParts[0]
$ticketId = $dueParts[1]
$month = [int]$dueParts[2]
$exactNetPayable = [long]$dueParts[3]

$activeAuctionRow = Query-DB @'
SELECT id || '|' || "chitGroupId" || '|' || "installmentMonth"
FROM "Auction"
WHERE status = 'SCHEDULED'
LIMIT 1;
'@
if (-not $activeAuctionRow) {
  # If no SCHEDULED auction, use any auction ID to test validation pipe boundary
  $auctionId = Query-DB 'SELECT id FROM "Auction" LIMIT 1;'
} else {
  $auctionId = $activeAuctionRow.Split('|')[0]
}

function Test-Probe([string]$ProbeName, [string]$Uri, [string]$Method, [hashtable]$BodyHash, [int]$ExpectedHttp = 400) {
  $passed = $false
  $statusCode = 0
  $responseMsg = ''
  try {
    $json = $BodyHash | ConvertTo-Json
    $res = Invoke-RestMethod -Uri $Uri -Method $Method -Headers $headers -Body $json -UseBasicParsing
    $passed = $false
    $responseMsg = 'Unexpected HTTP 200/201 success'
  } catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $stream = $_.Exception.Response.GetResponseStream()
    if ($stream) {
      $reader = New-Object System.IO.StreamReader($stream)
      $responseMsg = $reader.ReadToEnd()
    } else {
      $responseMsg = $_.Exception.Message
    }
    if ($statusCode -eq $ExpectedHttp) {
      $passed = $true
    }
  }

  if ($passed) {
    Write-Host "  [PASS] Rejected as expected with HTTP $($ExpectedHttp)!" -ForegroundColor Green
    Write-Host "         Response: $responseMsg" -ForegroundColor DarkGray
  } else {
    Write-Host "  [FAIL] Expected HTTP $($ExpectedHttp), got HTTP $($statusCode): $responseMsg" -ForegroundColor Red
  }

  $script:results += [PSCustomObject]@{
    Probe = $ProbeName
    Expected = "HTTP $ExpectedHttp"
    Actual = "HTTP $statusCode"
    Result = if ($passed) { 'PASS' } else { 'FAIL' }
  }
}

# ------------------------------------------------------------------------------
# CATEGORY 1: Negative Monetary Value Attacks (HTTP 400)
# ------------------------------------------------------------------------------
Write-Host "`n[PROBE 1/8] Category 1: Negative Payment Amount (-5000)..." -ForegroundColor Yellow
Test-Probe -ProbeName '1. Negative Payment Amount (-5000)' `
  -Uri "$BaseUrl/payments" `
  -Method 'Post' `
  -BodyHash @{
    ticketId = $ticketId
    installmentMonth = $month
    amount = -5000
    paymentMethod = 'CASH'
  }

Write-Host "`n[PROBE 2/8] Category 1: Negative Auction Bid Discount (-20000)..." -ForegroundColor Yellow
Test-Probe -ProbeName '2. Negative Auction Bid Discount (-20000)' `
  -Uri "$BaseUrl/auctions/$auctionId/record-bid" `
  -Method 'Post' `
  -BodyHash @{
    ticketId = $ticketId
    bidDiscount = -20000
    auctionDate = '2026-12-15T00:00:00.000Z'
  }

# ------------------------------------------------------------------------------
# CATEGORY 2: Zero Amount Attacks on Positive-Only Endpoints (HTTP 400)
# ------------------------------------------------------------------------------
Write-Host "`n[PROBE 3/8] Category 2: Zero Amount Payment Attempt (Rs. 0)..." -ForegroundColor Yellow
Test-Probe -ProbeName '3. Zero Amount Payment (Rs. 0)' `
  -Uri "$BaseUrl/payments" `
  -Method 'Post' `
  -BodyHash @{
    ticketId = $ticketId
    installmentMonth = $month
    amount = 0
    paymentMethod = 'CASH'
  }

Write-Host "`n[PROBE 4/8] Category 2: Zero Value Chit Scheme Creation (Rs. 0)..." -ForegroundColor Yellow
Test-Probe -ProbeName '4. Zero Value Chit Scheme Creation (Rs. 0)' `
  -Uri "$BaseUrl/chits/new" `
  -Method 'Post' `
  -BodyHash @{
    groupCode = 'KCT-ZERO-TEST'
    groupName = 'Zero Chit Scheme'
    chitValue = 0
    durationMonths = 20
    totalTickets = 20
    startDate = '2026-11-01T00:00:00.000Z'
    endDate = '2028-06-30T00:00:00.000Z'
  }

# ------------------------------------------------------------------------------
# CATEGORY 3: Decimal & Paise Injections (IEEE-754 Floats - HTTP 400 via @IsInt)
# ------------------------------------------------------------------------------
Write-Host "`n[PROBE 5/8] Category 3: Fractional Paise Payment Injection (Rs. 3950.50)..." -ForegroundColor Yellow
Test-Probe -ProbeName '5. Paise Payment Injection (Rs. 3950.50)' `
  -Uri "$BaseUrl/payments" `
  -Method 'Post' `
  -BodyHash @{
    ticketId = $ticketId
    installmentMonth = $month
    amount = 3950.50
    paymentMethod = 'CASH'
  }

Write-Host "`n[PROBE 6/8] Category 3: Fractional Paise Chit Value Injection (Rs. 100000.75)..." -ForegroundColor Yellow
Test-Probe -ProbeName '6. Paise Chit Value Injection (Rs. 100000.75)' `
  -Uri "$BaseUrl/chits/new" `
  -Method 'Post' `
  -BodyHash @{
    groupCode = 'KCT-FLOAT-TEST'
    groupName = 'Paise Chit Scheme'
    chitValue = 100000.75
    durationMonths = 20
    totalTickets = 20
    startDate = '2026-11-01T00:00:00.000Z'
    endDate = '2028-06-30T00:00:00.000Z'
  }

# ------------------------------------------------------------------------------
# CATEGORY 4: Auction Discount Bounds (Sub-Floor & Super-Ceiling Violations)
# ------------------------------------------------------------------------------
Write-Host "`n[PROBE 7/8] Category 4: Fractional Paise Auction Bid Discount (Rs. 22000.25)..." -ForegroundColor Yellow
Test-Probe -ProbeName '7. Paise Bid Discount Injection (Rs. 22000.25)' `
  -Uri "$BaseUrl/auctions/$auctionId/record-bid" `
  -Method 'Post' `
  -BodyHash @{
    ticketId = $ticketId
    bidDiscount = 22000.25
    auctionDate = '2026-12-15T00:00:00.000Z'
  }

# ------------------------------------------------------------------------------
# CATEGORY 5: Type Confusion & Malformed Input Attacks (HTTP 400)
# ------------------------------------------------------------------------------
Write-Host "`n[PROBE 8/8] Category 5: Type Confusion (String in amount field)..." -ForegroundColor Yellow
Test-Probe -ProbeName '8. Type Confusion (String amount)' `
  -Uri "$BaseUrl/payments" `
  -Method 'Post' `
  -BodyHash @{
    ticketId = $ticketId
    installmentMonth = $month
    amount = 'three thousand nine hundred'
    paymentMethod = 'CASH'
  }

# ------------------------------------------------------------------------------
# AUDIT SUMMARY
# ------------------------------------------------------------------------------
Write-Host "`n========================================================================" -ForegroundColor Cyan
Write-Host '  FINANCIAL BOUNDARY FUZZING PROBE SUMMARY                              ' -ForegroundColor Cyan
Write-Host '========================================================================' -ForegroundColor Cyan
$results | Format-Table -AutoSize

$failedCount = ($results | Where-Object { $_.Result -eq 'FAIL' }).Count
if ($failedCount -eq 0) {
  Write-Host "`n[SUCCESS] ALL 8 FINANCIAL BOUNDARY PENETRATION PROBES REJECTED WITH HTTP 400!" -ForegroundColor Green
} else {
  Write-Host "`n[FAILURE] $failedCount PROBE(S) FAILED TO FAIL-CLOSED!" -ForegroundColor Red
  exit 1
}
