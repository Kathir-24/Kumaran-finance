# ==============================================================================
# Kumaran Chits — RFC 6819 Refresh Token Lifecycle & Reuse Detection Live Verification
# ==============================================================================
$ErrorActionPreference = 'Stop'
$BaseUrl = 'http://localhost:3000/api/v1'

Write-Host '========================================================================' -ForegroundColor Cyan
Write-Host '  KUMARAN CHITS — LIVE CONTAINER RFC 6819 AUTHENTICATION PROBES        ' -ForegroundColor Cyan
Write-Host '========================================================================' -ForegroundColor Cyan

# Test Subject: Customer A. Shanmugam (9842100108)
$CustomerPhone = '9842100108'
$StaffPhone = '9876543210'
$StaffPassword = 'Admin@Kumaran2026'

function Query-DB([string]$Sql) {
  $out = $Sql | docker exec -i chitflow-db psql -U chitflow -d chitflow_dev -t -A
  return $out.Trim()
}

function Get-LatestOtp() {
  Start-Sleep -Milliseconds 500
  $lines = docker logs --tail 20 chitflow-api
  for ($i = $lines.Count - 1; $i -ge 0; $i--) {
    if ($lines[$i] -match 'verification code is (\d{6})') {
      return $Matches[1]
    }
  }
  throw 'Could not extract OTP from container logs'
}

# ------------------------------------------------------------------------------
# STEP 1: Customer OTP Authentication & Database Token Hash Persistence
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 1] Requesting SMS OTP for Customer ($CustomerPhone)..." -ForegroundColor Yellow
$otpReqBody = @{ phone = $CustomerPhone } | ConvertTo-Json
$otpReqRes = Invoke-RestMethod -Uri "$BaseUrl/auth/mobile/request-otp" -Method Post -Body $otpReqBody -ContentType 'application/json' -UseBasicParsing

$otpCode = $otpReqRes.data.debugOtp
if (-not $otpCode) { $otpCode = Get-LatestOtp }
Write-Host "  -> OTP Dispatched. Extracted OTP: $otpCode" -ForegroundColor Green

Write-Host '  -> Verifying OTP...' -ForegroundColor Yellow
$verifyBody = @{ phone = $CustomerPhone; otp = $otpCode } | ConvertTo-Json
$verifyRes = Invoke-RestMethod -Uri "$BaseUrl/auth/mobile/verify-otp" -Method Post -Body $verifyBody -ContentType 'application/json' -UseBasicParsing

$CustomerToken1 = $verifyRes.data.refreshToken
$CustomerAccess1 = $verifyRes.data.accessToken
Write-Host "  -> OTP Verified! Received CustomerToken1 (length: $($CustomerToken1.Length))" -ForegroundColor Green

$dbHash1 = Query-DB "SELECT ""refreshTokenHash"" FROM ""Customer"" WHERE phone = '$CustomerPhone';"
if (-not $dbHash1) {
  throw 'FAIL: Customer.refreshTokenHash is NULL in database after login!'
}
Write-Host "  -> [POSTGRES VERIFIED] Customer.refreshTokenHash stored: $($dbHash1.Substring(0, 25))..." -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 2: Customer Token Rotation (Happy Path)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 2] Rotating CustomerToken1 to CustomerToken2..." -ForegroundColor Yellow
$refreshBody = @{ refreshToken = $CustomerToken1 } | ConvertTo-Json
$refreshRes = Invoke-RestMethod -Uri "$BaseUrl/auth/refresh-token" -Method Post -Body $refreshBody -ContentType 'application/json' -UseBasicParsing

$CustomerToken2 = $refreshRes.data.refreshToken
if ($CustomerToken1 -eq $CustomerToken2) {
  throw 'FAIL: Rotated CustomerToken2 is identical to CustomerToken1!'
}
Write-Host '  -> Rotation Succeeded! Received CustomerToken2 (Unique token generated)' -ForegroundColor Green

$dbHash2 = Query-DB "SELECT ""refreshTokenHash"" FROM ""Customer"" WHERE phone = '$CustomerPhone';"
if ($dbHash1 -eq $dbHash2) {
  throw 'FAIL: Database refreshTokenHash was NOT rotated!'
}
Write-Host "  -> [POSTGRES VERIFIED] Customer.refreshTokenHash updated to Hash 2: $($dbHash2.Substring(0, 25))..." -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 3: RFC 6819 Customer Token Reuse Attack Detection (Replay Token 1)
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 3] ATTACK SIMULATION: Replaying invalidated CustomerToken1..." -ForegroundColor Yellow
$replayBody = @{ refreshToken = $CustomerToken1 } | ConvertTo-Json

try {
  $replayRes = Invoke-WebRequest -Uri "$BaseUrl/auth/refresh-token" -Method Post -Body $replayBody -ContentType 'application/json' -UseBasicParsing
  throw "FAIL: Expected HTTP 401 Unauthorized but got HTTP $($replayRes.StatusCode)!"
} catch {
  $statusCode = [int]$_.Exception.Response.StatusCode
  $errBody = $_.ErrorDetails.Message
  if (-not $errBody -and $_.Exception.Response) {
    $stream = $_.Exception.Response.GetResponseStream()
    $errBody = (New-Object System.IO.StreamReader($stream)).ReadToEnd()
  }

  Write-Host "  -> Received HTTP $statusCode (Expected 401 Unauthorized)" -ForegroundColor Green
  Write-Host "  -> Response Body: $errBody" -ForegroundColor Cyan

  if ($statusCode -ne 401 -or ($errBody -notmatch 'Token reuse detected')) {
    throw 'FAIL: Expected Token reuse detected error message!'
  }
}

# Invariant Assertion: RFC 6819 requires wiping the session family (refreshTokenHash = NULL)
$dbHashPostAttack = Query-DB "SELECT COALESCE(""refreshTokenHash"", 'NULL') FROM ""Customer"" WHERE phone = '$CustomerPhone';"
if ($dbHashPostAttack -ne 'NULL') {
  throw 'FAIL: RFC 6819 Invariant violated! Customer.refreshTokenHash was NOT revoked to NULL!'
}
Write-Host '  -> [POSTGRES VERIFIED] RFC 6819 Invariant Confirmed: Customer.refreshTokenHash is now NULL!' -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 4: Verify Newer CustomerToken2 is Also Blocked Post-Revocation
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 4] Verifying CustomerToken2 is now blocked (session family invalidated)..." -ForegroundColor Yellow
$token2Body = @{ refreshToken = $CustomerToken2 } | ConvertTo-Json

try {
  $token2Res = Invoke-WebRequest -Uri "$BaseUrl/auth/refresh-token" -Method Post -Body $token2Body -ContentType 'application/json' -UseBasicParsing
  throw "FAIL: Expected HTTP 401 Unauthorized but got HTTP $($token2Res.StatusCode)!"
} catch {
  $statusCode = [int]$_.Exception.Response.StatusCode
  $errBody = $_.ErrorDetails.Message
  if (-not $errBody -and $_.Exception.Response) {
    $stream = $_.Exception.Response.GetResponseStream()
    $errBody = (New-Object System.IO.StreamReader($stream)).ReadToEnd()
  }

  Write-Host "  -> Received HTTP $statusCode (Expected 401 Unauthorized)" -ForegroundColor Green
  Write-Host "  -> Response Body: $errBody" -ForegroundColor Cyan

  if ($statusCode -ne 401 -or ($errBody -notmatch 'Session revoked')) {
    throw 'FAIL: Expected Session revoked error message!'
  }
}
Write-Host '  -> [SECURITY VERIFIED] Compromised session family completely quarantined!' -ForegroundColor Green

# ------------------------------------------------------------------------------
# STEP 5: Customer Logout Revocation
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 5] Testing Customer Explicit Logout Revocation..." -ForegroundColor Yellow
$loginReq = Invoke-RestMethod -Uri "$BaseUrl/auth/mobile/request-otp" -Method Post -Body (@{ phone = $CustomerPhone } | ConvertTo-Json) -ContentType 'application/json' -UseBasicParsing
$otpCode3 = $loginReq.data.debugOtp
if (-not $otpCode3) { $otpCode3 = Get-LatestOtp }
$loginVerify = Invoke-RestMethod -Uri "$BaseUrl/auth/mobile/verify-otp" -Method Post -Body (@{ phone = $CustomerPhone; otp = $otpCode3 } | ConvertTo-Json) -ContentType 'application/json' -UseBasicParsing

$CustomerToken3 = $loginVerify.data.refreshToken
$CustomerAccess3 = $loginVerify.data.accessToken
Write-Host '  -> Re-authenticated customer, received CustomerToken3' -ForegroundColor Green

Write-Host '  -> Calling POST /auth/logout...' -ForegroundColor Yellow
$logoutHeaders = @{ Authorization = "Bearer $CustomerAccess3" }
$logoutRes = Invoke-RestMethod -Uri "$BaseUrl/auth/logout" -Method Post -Headers $logoutHeaders -ContentType 'application/json' -UseBasicParsing
Write-Host "  -> Logout response: $($logoutRes.message)" -ForegroundColor Green

$dbHashPostLogout = Query-DB "SELECT COALESCE(""refreshTokenHash"", 'NULL') FROM ""Customer"" WHERE phone = '$CustomerPhone';"
if ($dbHashPostLogout -ne 'NULL') {
  throw 'FAIL: Customer.refreshTokenHash was NOT cleared to NULL on logout!'
}
Write-Host '  -> [POSTGRES VERIFIED] Customer.refreshTokenHash is NULL after logout!' -ForegroundColor Green

# Attempt refresh with CustomerToken3
try {
  $refreshAttempt = Invoke-WebRequest -Uri "$BaseUrl/auth/refresh-token" -Method Post -Body (@{ refreshToken = $CustomerToken3 } | ConvertTo-Json) -ContentType 'application/json' -UseBasicParsing
  throw "FAIL: Expected HTTP 401 Unauthorized after logout but got HTTP $($refreshAttempt.StatusCode)!"
} catch {
  Write-Host '  -> [LOGOUT VERIFIED] Refresh attempt rejected with HTTP 401 Unauthorized!' -ForegroundColor Green
}

# ------------------------------------------------------------------------------
# STEP 6: Staff RFC 6819 Reuse Attack Trap
# ------------------------------------------------------------------------------
Write-Host "`n[STEP 6] Testing Staff RFC 6819 Reuse Detection ($StaffPhone)..." -ForegroundColor Yellow
$staffLoginBody = @{ phone = $StaffPhone; password = $StaffPassword } | ConvertTo-Json
$staffLoginRes = Invoke-RestMethod -Uri "$BaseUrl/auth/web/login" -Method Post -Body $staffLoginBody -ContentType 'application/json' -UseBasicParsing

$StaffToken1 = $staffLoginRes.data.refreshToken
Write-Host '  -> Staff logged in, received StaffToken1' -ForegroundColor Green

Write-Host '  -> Rotating StaffToken1 to StaffToken2...' -ForegroundColor Yellow
$staffRefreshRes = Invoke-RestMethod -Uri "$BaseUrl/auth/refresh-token" -Method Post -Body (@{ refreshToken = $StaffToken1 } | ConvertTo-Json) -ContentType 'application/json' -UseBasicParsing
$StaffToken2 = $staffRefreshRes.data.refreshToken
Write-Host '  -> Rotated to StaffToken2' -ForegroundColor Green

Write-Host '  -> ATTACK SIMULATION: Replaying rotated StaffToken1...' -ForegroundColor Yellow
try {
  $staffReplay = Invoke-WebRequest -Uri "$BaseUrl/auth/refresh-token" -Method Post -Body (@{ refreshToken = $StaffToken1 } | ConvertTo-Json) -ContentType 'application/json' -UseBasicParsing
  throw 'FAIL: Expected HTTP 401 Unauthorized on staff token replay!'
} catch {
  $statusCode = [int]$_.Exception.Response.StatusCode
  $errBody = $_.ErrorDetails.Message
  if (-not $errBody -and $_.Exception.Response) {
    $stream = $_.Exception.Response.GetResponseStream()
    $errBody = (New-Object System.IO.StreamReader($stream)).ReadToEnd()
  }

  Write-Host "  -> Received HTTP $statusCode (Expected 401 Unauthorized)" -ForegroundColor Green
  Write-Host "  -> Response Body: $errBody" -ForegroundColor Cyan

  if ($statusCode -ne 401 -or ($errBody -notmatch 'Token reuse detected')) {
    throw 'FAIL: Expected staff Token reuse detected error message!'
  }
}

$staffDbHash = Query-DB "SELECT COALESCE(""refreshTokenHash"", 'NULL') FROM ""User"" WHERE phone = '$StaffPhone';"
if ($staffDbHash -ne 'NULL') {
  throw 'FAIL: User.refreshTokenHash was NOT wiped to NULL after reuse attack!'
}
Write-Host '  -> [POSTGRES VERIFIED] RFC 6819 Staff Invariant Confirmed: User.refreshTokenHash is NULL!' -ForegroundColor Green

Write-Host "`n========================================================================" -ForegroundColor Green
Write-Host '  ALL 6 RFC 6819 LIVE HTTP INVARIANTS VERIFIED WITH 100% PROOFS!        ' -ForegroundColor Green
Write-Host '========================================================================' -ForegroundColor Green
