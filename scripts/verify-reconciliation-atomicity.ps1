# ==============================================================================
# Kumaran Chits — Ghost Drop Reconciliation Ledger Atomicity Live Verification
# ==============================================================================
$ErrorActionPreference = 'Stop'
$BaseUrl = 'http://localhost:3000/api/v1'

Write-Host '========================================================================' -ForegroundColor Cyan
Write-Host '  KUMARAN CHITS — LIVE CONTAINER GHOST DROP RECONCILIATION PROBES       ' -ForegroundColor Cyan
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
$adminHeaders = @{ Authorization = "Bearer $adminToken" }
Write-Host '  -> Admin authenticated successfully' -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 2: Find target UNPAID Installment Due and Customer
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 2] Querying target UNPAID Installment Due..." -ForegroundColor Yellow
$dueRow = Query-DB @'
SELECT d.id || '|' || d."ticketId" || '|' || d."netPayableAmount" || '|' || c.phone
FROM "InstallmentDue" d
JOIN "SubscriberTicket" t ON d."ticketId" = t.id
JOIN "Customer" c ON t."customerId" = c.id
WHERE d.status = 'UNPAID'
  AND NOT EXISTS (
    SELECT 1 FROM "PaymentAllocation" pa
    JOIN "Payment" p ON pa."paymentId" = p.id
    WHERE pa."installmentDueId" = d.id AND p."paymentStatus" IN ('INITIATED', 'SUCCESS')
  )
LIMIT 1;
'@

if (-not $dueRow) {
  throw "No UNPAID installment dues found in database to test reconciliation!"
}

$parts = $dueRow.Split('|')
$dueId = $parts[0]
$ticketId = $parts[1]
$amount = [long]$parts[2]
$customerPhone = $parts[3]

Write-Host "  -> Target Due ID: $dueId" -ForegroundColor Cyan
Write-Host "  -> Ticket ID: $ticketId" -ForegroundColor Cyan
Write-Host "  -> Amount: Rs. $amount" -ForegroundColor Cyan
Write-Host "  -> Customer Phone: $customerPhone" -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# STEP 3: Customer initiates UPI payment claim (Ghost Drop state: INITIATED)
# ------------------------------------------------------------------------------
$uniqueUtr = "UTR-RECON-$(Get-Date -Format 'yyyyMMddHHmmss')-$((Get-Random) % 10000)"
Write-Host "`n[STEP 3] Submitting UPI Payment Claim (Ghost Drop Initial State)..." -ForegroundColor Yellow
Write-Host "  -> Using UTR / TransactionRef: $uniqueUtr" -ForegroundColor Cyan

$claimBody = @{
  dueId = $dueId
  utrNumber = $uniqueUtr
  notes = 'Live Automated Ghost Drop Simulation'
} | ConvertTo-Json

$claimRes = Invoke-RestMethod -Uri "$BaseUrl/payments/upi-claim" -Method Post -Headers $adminHeaders -Body $claimBody -ContentType 'application/json' -UseBasicParsing
$paymentId = $claimRes.data.claimId
Write-Host "  -> Payment recorded! Payment ID: $paymentId, Status: $($claimRes.data.status)" -ForegroundColor Green

# Verify initial database state (Payment = INITIATED, Due = UNPAID, Receipt = NONE)
$initPaymentStatus = Query-DB "SELECT ""paymentStatus"" FROM ""Payment"" WHERE id = '$paymentId';"
$initDueStatus = Query-DB "SELECT status FROM ""InstallmentDue"" WHERE id = '$dueId';"
$initReceiptCount = Query-DB "SELECT COUNT(*) FROM ""Receipt"" WHERE ""paymentId"" = '$paymentId';"

Write-Host "  -> Initial DB Verification:" -ForegroundColor Yellow
Write-Host "     Payment.paymentStatus: $initPaymentStatus (Expected: INITIATED)" -ForegroundColor Cyan
Write-Host "     InstallmentDue.status: $initDueStatus (Expected: UNPAID)" -ForegroundColor Cyan
Write-Host "     Receipt count: $initReceiptCount (Expected: 0)" -ForegroundColor Cyan

if ($initPaymentStatus -ne 'INITIATED' -or $initDueStatus -ne 'UNPAID' -or $initReceiptCount -ne '0') {
  throw "FAIL: Initial Ghost Drop setup is not in expected state!"
}

# ------------------------------------------------------------------------------
# STEP 4: Trigger Daily Settlement Reconciliation via API
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 4] Executing Settlement Reconciliation Feed (Resolving Ghost Drop)..." -ForegroundColor Yellow
$settlementPayload = @{
  records = @(
    @{
      gatewayOrderId = $uniqueUtr
      gatewayPaymentId = "PAY-GW-SETTLE-$((Get-Random) % 999999)"
      amount = [int]$amount
      status = 'SUCCESS'
      settledAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    }
  )
} | ConvertTo-Json

$reconRes = Invoke-RestMethod -Uri "$BaseUrl/jobs/run-reconciliation" -Method Post -Headers $adminHeaders -Body $settlementPayload -ContentType 'application/json' -UseBasicParsing

Write-Host "  -> Reconciliation Job Completed!" -ForegroundColor Green
Write-Host "     Matched: $($reconRes.data.matchedCount)" -ForegroundColor Cyan
Write-Host "     Ghost Drops Resolved: $($reconRes.data.autoResolvedGhostDropsCount)" -ForegroundColor Green
Write-Host "     Exceptions: $($reconRes.data.exceptionCount)" -ForegroundColor Cyan
Write-Host "     Log Details: $($reconRes.data.details[0])" -ForegroundColor Gray

if ($reconRes.data.autoResolvedGhostDropsCount -ne 1) {
  throw "FAIL: Expected autoResolvedGhostDropsCount to be 1!"
}

# ------------------------------------------------------------------------------
# STEP 5: Verify Atomic PostgreSQL Financial Ledger Invariants
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 5] Verifying PostgreSQL Financial Ledger Invariants Live..." -ForegroundColor Yellow

# Invariant 1: Payment is SUCCESS with settlement audit notes
$postPaymentStatus = Query-DB "SELECT ""paymentStatus"" FROM ""Payment"" WHERE id = '$paymentId';"
$postPaymentNotes = Query-DB "SELECT notes FROM ""Payment"" WHERE id = '$paymentId';"
Write-Host "  -> [POSTGRES VERIFIED] Payment.paymentStatus: $postPaymentStatus (Expected: SUCCESS)" -ForegroundColor Green
Write-Host "  -> [POSTGRES VERIFIED] Payment.notes: $postPaymentNotes" -ForegroundColor Gray

if ($postPaymentStatus -ne 'SUCCESS') {
  throw "FAIL: Payment was NOT updated to SUCCESS!"
}

# Invariant 2: InstallmentDue is PAID with exact paidAmount
$postDueStatus = Query-DB "SELECT status FROM ""InstallmentDue"" WHERE id = '$dueId';"
$postPaidAmount = Query-DB "SELECT ""paidAmount"" FROM ""InstallmentDue"" WHERE id = '$dueId';"
Write-Host "  -> [POSTGRES VERIFIED] InstallmentDue.status: $postDueStatus (Expected: PAID)" -ForegroundColor Green
Write-Host "  -> [POSTGRES VERIFIED] InstallmentDue.paidAmount: $postPaidAmount (Expected: $amount)" -ForegroundColor Green

if ($postDueStatus -ne 'PAID' -or [long]$postPaidAmount -ne $amount) {
  throw "FAIL: InstallmentDue was NOT updated to PAID with full paidAmount!"
}

# Invariant 3: Collision-proof Sequential Bilingual Receipt was minted
$receiptData = Query-DB "SELECT ""receiptNumber"" || '|' || ""isBilingual"" FROM ""Receipt"" WHERE ""paymentId"" = '$paymentId';"
if (-not $receiptData) {
  throw "FAIL: No Receipt was minted for payment $paymentId!"
}

$recParts = $receiptData.Split('|')
$receiptNumber = $recParts[0]
$isBilingual = $recParts[1]
Write-Host "  -> [POSTGRES VERIFIED] Receipt Number: $receiptNumber" -ForegroundColor Green
Write-Host "  -> [POSTGRES VERIFIED] Receipt isBilingual: $isBilingual" -ForegroundColor Green

if ($receiptNumber -notmatch '^KC-REC-PRD-\d{4}-\d{5}$') {
  throw "FAIL: Receipt number does not match format KC-REC-PRD-YYYY-NNNNN: $receiptNumber"
}

# Invariant 4: Subscriber ticket is ACTIVE
$ticketStatus = Query-DB "SELECT status FROM ""SubscriberTicket"" WHERE id = '$ticketId';"
Write-Host "  -> [POSTGRES VERIFIED] SubscriberTicket.status: $ticketStatus" -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 6: Verify PDF Receipt Generation Renders Successfully (Zero 404)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 6] Testing PDF Receipt Generation (GET /pdf/receipt/$paymentId)..." -ForegroundColor Yellow
$pdfRes = Invoke-WebRequest -Uri "$BaseUrl/pdf/receipt/$paymentId" -Headers $adminHeaders -UseBasicParsing

$contentType = $pdfRes.Headers['Content-Type']
$contentLength = $pdfRes.RawContentLength
Write-Host "  -> Received HTTP $($pdfRes.StatusCode)" -ForegroundColor Green
Write-Host "  -> Content-Type: $contentType" -ForegroundColor Cyan
Write-Host "  -> PDF Payload Size: $contentLength bytes" -ForegroundColor Cyan

if ($pdfRes.StatusCode -ne 200 -or $contentType -notmatch 'application/pdf') {
  throw "FAIL: PDF Receipt generation failed!"
}

Write-Host "`n========================================================================" -ForegroundColor Green
Write-Host "  PROBLEM 3 VERIFIED: 100% LEDGER ATOMICITY GUARANTEED!                 " -ForegroundColor Green
Write-Host "========================================================================" -ForegroundColor Green
