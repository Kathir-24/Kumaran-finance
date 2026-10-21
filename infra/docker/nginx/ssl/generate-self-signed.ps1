# ==============================================================================
# Kumaran Chits — Generate Self-Signed SSL/TLS Certificates for Local/Staging
# Product: Kumaran Chits (Kumaran Finance, Perundurai, Tamil Nadu)
# ==============================================================================

$ErrorActionPreference = "Stop"

$sslDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$liveDir = Join-Path $sslDir "live"

if (-not (Test-Path $liveDir)) {
    New-Item -ItemType Directory -Path $liveDir -Force | Out-Null
}

$certFile = Join-Path $liveDir "fullchain.pem"
$keyFile = Join-Path $liveDir "privkey.pem"

Write-Host "[INFO] Generating 2048-bit RSA Private Key and Self-Signed Certificate..." -ForegroundColor Cyan

# Check for OpenSSL
$opensslCmd = Get-Command openssl -ErrorAction SilentlyContinue
if (-not $opensslCmd -and (Test-Path "C:\Program Files\Git\usr\bin\openssl.exe")) {
    $opensslCmd = "C:\Program Files\Git\usr\bin\openssl.exe"
}

if ($opensslCmd) {
    & $opensslCmd req -x509 -nodes -days 365 -newkey rsa:2048 `
        -keyout $keyFile `
        -out $certFile `
        -subj "/C=IN/ST=Tamil Nadu/L=Perundurai/O=Kumaran Finance/OU=IT Operations/CN=localhost" `
        -addext "subjectAltName=DNS:localhost,DNS:kumaranfinance.com,IP:127.0.0.1"
    
    Write-Host "[SUCCESS] Self-signed certificates generated successfully via OpenSSL:" -ForegroundColor Green
    Write-Host "  - Certificate: $certFile"
    Write-Host "  - Private Key: $keyFile"
} else {
    Write-Host "[INFO] OpenSSL not found on path, generating certificate via PowerShell New-SelfSignedCertificate..." -ForegroundColor Yellow
    $cert = New-SelfSignedCertificate `
        -DnsName "localhost", "kumaranfinance.com" `
        -CertStoreLocation "Cert:\CurrentUser\My" `
        -NotAfter (Get-Date).AddYears(1) `
        -KeyAlgorithm RSA `
        -KeyLength 2048

    $pwd = ConvertTo-SecureString -String "chitflow123" -Force -AsPlainText
    $pfxPath = Join-Path $liveDir "cert.pfx"
    Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $pwd | Out-Null
    
    # Export PEM certificate
    $certPem = [System.Convert]::ToBase64String($cert.RawData, "InsertLineBreaks")
    $pemContent = "-----BEGIN CERTIFICATE-----`n" + $certPem + "`n-----END CERTIFICATE-----`n"
    [System.IO.File]::WriteAllText($certFile, $pemContent)

    Write-Host "[SUCCESS] Certificate created at: $certFile (PFX at $pfxPath)" -ForegroundColor Green
}
