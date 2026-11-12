# ==============================================================================
# Kumaran Chits — Branch Manager Cross-Branch KYC IDOR & BOLA Elimination Probes
# ==============================================================================
$ErrorActionPreference = 'Stop'
$BaseUrl = 'http://localhost:3000/api/v1'

Write-Host '========================================================================' -ForegroundColor Cyan
Write-Host '  KUMARAN CHITS — BRANCH MANAGER CROSS-BRANCH KYC IDOR / BOLA PROBES     ' -ForegroundColor Cyan
Write-Host '========================================================================' -ForegroundColor Cyan

function Query-DB([string]$Sql) {
  $out = $Sql | docker exec -i chitflow-db psql -U chitflow -d chitflow_dev -t -A
  return $out.Trim()
}

function Get-ErrorDetails($err) {
  $body = ''
  if ($err.ErrorDetails -and $err.ErrorDetails.Message) {
    $body = $err.ErrorDetails.Message
  }
  if (-not $body -and $err.Exception -and $err.Exception.Response) {
    try {
      $stream = $err.Exception.Response.GetResponseStream()
      $body = (New-Object System.IO.StreamReader($stream)).ReadToEnd()
    } catch {}
  }
  if (-not $body) {
    $body = $err.Exception.Message
  }
  $code = 0
  if ($err.Exception -and $err.Exception.Response -and $err.Exception.Response.StatusCode) {
    $code = [int]$err.Exception.Response.StatusCode
  }
  return @{ StatusCode = $code; Body = $body }
}

# ------------------------------------------------------------------------------
# STEP 1: Verify Branches and Authenticate Personas
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 1] Authenticating Staff Personas..." -ForegroundColor Yellow

# 1a. Super Admin Login
$adminLoginRes = Invoke-RestMethod -Uri "$BaseUrl/auth/web/login" -Method Post `
  -Body (@{ phone = '9876543210'; password = 'Admin@Kumaran2026' } | ConvertTo-Json) `
  -ContentType 'application/json' -UseBasicParsing
$adminToken = $adminLoginRes.data.accessToken
$adminHeaders = @{ Authorization = "Bearer $adminToken" }
Write-Host "  -> Super Admin (P. Kumaran) authenticated successfully" -ForegroundColor Green

# 1b. Branch Manager (Head Office - PRD) Login
$bmLoginRes = Invoke-RestMethod -Uri "$BaseUrl/auth/web/login" -Method Post `
  -Body (@{ phone = '9876543212'; password = 'Admin@Kumaran2026' } | ConvertTo-Json) `
  -ContentType 'application/json' -UseBasicParsing
$bmToken = $bmLoginRes.data.accessToken
$bmHeaders = @{ Authorization = "Bearer $bmToken" }
$bmBranchId = $bmLoginRes.data.user.branchId
$bmRole = $bmLoginRes.data.user.role
Write-Host "  -> Branch Manager (M. Rajendran) authenticated: Role=$bmRole, BranchId=$bmBranchId" -ForegroundColor Green

# Verify Branch IDs
$prdBranches = Query-DB "SELECT id FROM ""Branch"" WHERE code = 'PRD';"
$erdBranches = Query-DB "SELECT id FROM ""Branch"" WHERE code = 'ERD';"

Write-Host "  -> Head Office PRD Branch ID: $prdBranches" -ForegroundColor Cyan
Write-Host "  -> Erode ERD Branch ID:       $erdBranches" -ForegroundColor Cyan

if ($bmBranchId -ne $prdBranches) {
  throw "ASSERTION FAILED: Branch Manager is expected to belong to PRD branch ($prdBranches), but got ($bmBranchId)"
}

# ------------------------------------------------------------------------------
# STEP 2: Setup ERD Branch Test Customer and KYC Document in Database
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 2] Setting up ERD Branch Test Customer & Document..." -ForegroundColor Yellow

$erdCustId = "cust-erd-probe-$(Get-Random -Minimum 1000 -Maximum 9999)"
$erdCustPhone = "98765$(Get-Random -Minimum 10000 -Maximum 99999)"
$erdCustCode = "CUST-ERD-$(Get-Random -Minimum 1000 -Maximum 9999)"
$erdDocId = "doc-erd-probe-$(Get-Random -Minimum 1000 -Maximum 9999)"

Query-DB @"
INSERT INTO "Customer" (
  id, "branchId", "customerCode", "fullName", phone, "addressLine1", city, pincode, "isKycVerified", "createdAt", "updatedAt"
) VALUES (
  '$erdCustId', '$erdBranches', '$erdCustCode', 'ERD Test Subscriber', '$erdCustPhone', '120 Brough Road', 'Erode', '638001', false, NOW(), NOW()
);
INSERT INTO "CustomerDocument" (
  id, "customerId", "docType", "s3Key", "fileName", verified, "uploadedAt"
) VALUES (
  '$erdDocId', '$erdCustId', 'AADHAAR_FRONT', 'documents/$erdCustId/aadhaar.pdf', 'aadhaar.pdf', false, NOW()
);
"@ | Out-Null

Write-Host "  -> Created ERD Customer: ID=$erdCustId, Code=$erdCustCode, Branch=$erdBranches" -ForegroundColor Cyan
Write-Host "  -> Created ERD Document: ID=$erdDocId, Type=AADHAAR_FRONT" -ForegroundColor Cyan

# Also find an existing PRD Customer to test legitimate intra-branch access
$prdCustRow = Query-DB "SELECT id FROM ""Customer"" WHERE ""branchId"" = '$prdBranches' LIMIT 1;"
Write-Host "  -> Selected PRD Customer for Legitimate Access: ID=$prdCustRow" -ForegroundColor Cyan

try {
  # ------------------------------------------------------------------------------
  # PROBE 1: Branch Manager cross-branch document URL access
  # ------------------------------------------------------------------------------
  Write-Host "`n[PROBE 1] Testing BM cross-branch KYC Document URL access (GET)..." -ForegroundColor Yellow
  $probe1Failed = $false
  try {
    Invoke-RestMethod -Uri "$BaseUrl/customers/$erdCustId/documents/$erdDocId/url" `
      -Method Get -Headers $bmHeaders -ContentType 'application/json' -UseBasicParsing
    $probe1Failed = $true
  } catch {
    $err = Get-ErrorDetails $_
    Write-Host "  -> Received HTTP $($err.StatusCode) (Expected: 403 Forbidden)" -ForegroundColor Green
    Write-Host "  -> Response Body: $($err.Body)" -ForegroundColor DarkGray
    if ($err.StatusCode -ne 403 -or -not ($err.Body -like "*BOLA_VIOLATION*")) {
      throw "ASSERTION FAILED: Expected HTTP 403 with BOLA_VIOLATION, got status $($err.StatusCode) with body: $($err.Body)"
    }
    Write-Host "  -> PROBE 1 PASSED: BM successfully blocked from viewing ERD customer KYC doc!" -ForegroundColor Green
  }
  if ($probe1Failed) {
    throw "SECURITY VULNERABILITY (IDOR): Branch Manager was able to obtain presigned URL for cross-branch KYC document!"
  }

  # ------------------------------------------------------------------------------
  # PROBE 2: Branch Manager cross-branch document deletion
  # ------------------------------------------------------------------------------
  Write-Host "`n[PROBE 2] Testing BM cross-branch KYC Document Deletion (DELETE)..." -ForegroundColor Yellow
  $probe2Failed = $false
  try {
    Invoke-RestMethod -Uri "$BaseUrl/customers/$erdCustId/documents/$erdDocId" `
      -Method Delete -Headers $bmHeaders -ContentType 'application/json' -UseBasicParsing
    $probe2Failed = $true
  } catch {
    $err = Get-ErrorDetails $_
    Write-Host "  -> Received HTTP $($err.StatusCode) (Expected: 403 Forbidden)" -ForegroundColor Green
    Write-Host "  -> Response Body: $($err.Body)" -ForegroundColor DarkGray
    if ($err.StatusCode -ne 403 -or -not ($err.Body -like "*BOLA_VIOLATION*")) {
      throw "ASSERTION FAILED: Expected HTTP 403 with BOLA_VIOLATION, got status $($err.StatusCode) with body: $($err.Body)"
    }
    Write-Host "  -> PROBE 2 PASSED: BM successfully blocked from deleting ERD customer KYC doc!" -ForegroundColor Green
  }
  if ($probe2Failed) {
    throw "SECURITY VULNERABILITY (IDOR): Branch Manager was able to delete cross-branch KYC document!"
  }

  # ------------------------------------------------------------------------------
  # PROBE 3: Branch Manager cross-branch KYC status update
  # ------------------------------------------------------------------------------
  Write-Host "`n[PROBE 3] Testing BM cross-branch KYC Status Update (PATCH)..." -ForegroundColor Yellow
  $probe3Failed = $false
  try {
    Invoke-RestMethod -Uri "$BaseUrl/customers/$erdCustId/kyc-status" `
      -Method Patch -Headers $bmHeaders `
      -Body (@{ isKycVerified = $true } | ConvertTo-Json) `
      -ContentType 'application/json' -UseBasicParsing
    $probe3Failed = $true
  } catch {
    $err = Get-ErrorDetails $_
    Write-Host "  -> Received HTTP $($err.StatusCode) (Expected: 403 Forbidden)" -ForegroundColor Green
    Write-Host "  -> Response Body: $($err.Body)" -ForegroundColor DarkGray
    if ($err.StatusCode -ne 403 -or -not ($err.Body -like "*BOLA_VIOLATION*")) {
      throw "ASSERTION FAILED: Expected HTTP 403 with BOLA_VIOLATION, got status $($err.StatusCode) with body: $($err.Body)"
    }
    Write-Host "  -> PROBE 3 PASSED: BM successfully blocked from verifying cross-branch customer KYC!" -ForegroundColor Green
  }
  if ($probe3Failed) {
    throw "SECURITY VULNERABILITY (IDOR): Branch Manager was able to modify cross-branch customer KYC status!"
  }

  # ------------------------------------------------------------------------------
  # PROBE 4: Branch Manager cross-branch customer profile update
  # ------------------------------------------------------------------------------
  Write-Host "`n[PROBE 4] Testing BM cross-branch Customer Profile Update (PATCH)..." -ForegroundColor Yellow
  $probe4Failed = $false
  try {
    Invoke-RestMethod -Uri "$BaseUrl/customers/$erdCustId" `
      -Method Patch -Headers $bmHeaders `
      -Body (@{ addressLine1 = 'Malicious Cross-Branch Edit' } | ConvertTo-Json) `
      -ContentType 'application/json' -UseBasicParsing
    $probe4Failed = $true
  } catch {
    $err = Get-ErrorDetails $_
    Write-Host "  -> Received HTTP $($err.StatusCode) (Expected: 403 Forbidden)" -ForegroundColor Green
    Write-Host "  -> Response Body: $($err.Body)" -ForegroundColor DarkGray
    if ($err.StatusCode -ne 403 -or -not ($err.Body -like "*BOLA_VIOLATION*")) {
      throw "ASSERTION FAILED: Expected HTTP 403 with BOLA_VIOLATION, got status $($err.StatusCode) with body: $($err.Body)"
    }
    Write-Host "  -> PROBE 4 PASSED: BM successfully blocked from mutating cross-branch profile!" -ForegroundColor Green
  }
  if ($probe4Failed) {
    throw "SECURITY VULNERABILITY (IDOR): Branch Manager was able to update cross-branch customer profile!"
  }

  # ------------------------------------------------------------------------------
  # PROBE 5: Branch Manager cross-branch nominee addition
  # ------------------------------------------------------------------------------
  Write-Host "`n[PROBE 5] Testing BM cross-branch Nominee Addition (POST)..." -ForegroundColor Yellow
  $probe5Failed = $false
  try {
    Invoke-RestMethod -Uri "$BaseUrl/customers/$erdCustId/nominees" `
      -Method Post -Headers $bmHeaders `
      -Body (@{
        fullName = 'Fake Nominee'
        relationship = 'SPOUSE'
        phone = '9999900000'
      } | ConvertTo-Json) `
      -ContentType 'application/json' -UseBasicParsing
    $probe5Failed = $true
  } catch {
    $err = Get-ErrorDetails $_
    Write-Host "  -> Received HTTP $($err.StatusCode) (Expected: 403 Forbidden)" -ForegroundColor Green
    Write-Host "  -> Response Body: $($err.Body)" -ForegroundColor DarkGray
    if ($err.StatusCode -ne 403 -or -not ($err.Body -like "*BOLA_VIOLATION*")) {
      throw "ASSERTION FAILED: Expected HTTP 403 with BOLA_VIOLATION, got status $($err.StatusCode) with body: $($err.Body)"
    }
    Write-Host "  -> PROBE 5 PASSED: BM successfully blocked from adding nominee to ERD customer!" -ForegroundColor Green
  }
  if ($probe5Failed) {
    throw "SECURITY VULNERABILITY (IDOR): Branch Manager was able to add nominee to cross-branch customer!"
  }

  # ------------------------------------------------------------------------------
  # PROBE 6: Legitimate intra-branch access for PRD Branch Manager
  # ------------------------------------------------------------------------------
  Write-Host "`n[PROBE 6] Testing Legitimate Intra-Branch Access (PRD BM -> PRD Customer)..." -ForegroundColor Yellow
  $prdCheck = Invoke-RestMethod -Uri "$BaseUrl/customers/$prdCustRow" `
    -Method Get -Headers $bmHeaders -ContentType 'application/json' -UseBasicParsing
  Write-Host "  -> PRD BM retrieved PRD customer successfully: Code=$($prdCheck.data.customerCode), Name=$($prdCheck.data.fullName)" -ForegroundColor Green
  Write-Host "  -> PROBE 6 PASSED: Legitimate branch operations remain 100% operational!" -ForegroundColor Green

  # ------------------------------------------------------------------------------
  # PROBE 7: Super Admin Global Access to ERD Customer & Document
  # ------------------------------------------------------------------------------
  Write-Host "`n[PROBE 7] Testing Super Admin Global Oversight on ERD Customer..." -ForegroundColor Yellow
  $adminDocRes = Invoke-RestMethod -Uri "$BaseUrl/customers/$erdCustId/documents/$erdDocId/url" `
    -Method Get -Headers $adminHeaders -ContentType 'application/json' -UseBasicParsing
  $presignedUrl = $adminDocRes.data.url
  Write-Host "  -> Super Admin generated presigned URL: $presignedUrl" -ForegroundColor Green
  if (-not ($presignedUrl -like "http*")) {
    throw "ASSERTION FAILED: Super Admin did not receive a valid presigned URL!"
  }

  $adminKycRes = Invoke-RestMethod -Uri "$BaseUrl/customers/$erdCustId/kyc-status" `
    -Method Patch -Headers $adminHeaders `
    -Body (@{ isKycVerified = $true } | ConvertTo-Json) `
    -ContentType 'application/json' -UseBasicParsing
  Write-Host "  -> Super Admin verified ERD customer KYC status: isKycVerified=$($adminKycRes.data.isKycVerified)" -ForegroundColor Green
  Write-Host "  -> PROBE 7 PASSED: Super Admin cross-branch management verified!" -ForegroundColor Green

  Write-Host "`n========================================================================" -ForegroundColor Cyan
  Write-Host "  ALL 7 BOLA / IDOR VERIFICATION PROBES PASSED WITH ZERO VULNERABILITIES  " -ForegroundColor Green
  Write-Host "========================================================================" -ForegroundColor Cyan
}
finally {
  # ------------------------------------------------------------------------------
  # CLEANUP: Remove ERD Test Customer & Document
  # ------------------------------------------------------------------------------
  Write-Host "`n[CLEANUP] Removing test artifacts from database..." -ForegroundColor Yellow
  Query-DB "DELETE FROM ""Customer"" WHERE id = '$erdCustId';" | Out-Null
  Write-Host "  -> Test customer $erdCustId cleaned up successfully." -ForegroundColor Green
}
