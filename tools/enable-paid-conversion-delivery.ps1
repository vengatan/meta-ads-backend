param(
    [string]$CredentialFile = "$env:LOCALAPPDATA\Vensure\meta-ads-backend\vercel-token.dpapi"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Security
$teamSlug = "venga-s-projects"
$projectName = "meta-ads-backend"

if (-not (Test-Path -LiteralPath $CredentialFile)) {
    throw "Encrypted Vercel credential not found. Run tools/set-vercel-credential.ps1 first."
}

function Convert-SecureStringToPlainText([Security.SecureString]$Value) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

$encryptedBytes = [Convert]::FromBase64String((Get-Content -Raw -LiteralPath $CredentialFile).Trim())
$tokenBytes = [Security.Cryptography.ProtectedData]::Unprotect(
    $encryptedBytes,
    $null,
    [Security.Cryptography.DataProtectionScope]::CurrentUser
)

$previousToken = $env:VERCEL_TOKEN
$taiwanSecret = $null
$singaporeSecret = $null
try {
    $env:VERCEL_TOKEN = [Text.Encoding]::UTF8.GetString($tokenBytes)
    & npx vercel whoami --scope $teamSlug --no-color | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Stored Vercel credential cannot access team $teamSlug." }

    & npx vercel link --yes --project $projectName --scope $teamSlug --no-color | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not link canonical project $projectName." }

    $taiwanSecure = Read-Host "Paste Taiwan GA4 Measurement Protocol API secret (G-L5NWYL0S9V)" -AsSecureString
    $singaporeSecure = Read-Host "Paste Singapore GA4 Measurement Protocol API secret (G-L3QF8L60CP)" -AsSecureString
    $taiwanSecret = Convert-SecureStringToPlainText $taiwanSecure
    $singaporeSecret = Convert-SecureStringToPlainText $singaporeSecure
    if (-not $taiwanSecret -or -not $singaporeSecret) { throw "Both GA4 API secrets are required; Production was not changed." }

    $secretMap = @{ "747696142" = $taiwanSecret; "806878109" = $singaporeSecret } | ConvertTo-Json -Compress
    $listed = (& npx vercel env list production --scope $teamSlug --no-color 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) { throw "Could not list Production environment variables." }

    $gaVerb = if ($listed -match "(?m)^\s*GA4_API_SECRETS_BY_ORG\s") { "update" } else { "add" }
    $secretMap | & npx vercel env $gaVerb GA4_API_SECRETS_BY_ORG production --sensitive --yes --scope $teamSlug --no-color | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to store GA4_API_SECRETS_BY_ORG; delivery remains disabled." }

    $deliveryVerb = if ($listed -match "(?m)^\s*PAID_CONVERSION_DELIVERY_ENABLED\s") { "update" } else { "add" }
    "true" | & npx vercel env $deliveryVerb PAID_CONVERSION_DELIVERY_ENABLED production --yes --scope $teamSlug --no-color | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "GA4 secrets were stored, but delivery was not enabled." }

    & npx vercel deploy --prod --yes --scope $teamSlug --no-color
    if ($LASTEXITCODE -ne 0) { throw "Variables were updated, but the Production deployment failed." }
    Write-Output "Both GA4 secrets are stored as sensitive values, paid conversion delivery is enabled, and Production is deployed."
}
finally {
    $taiwanSecret = $null
    $singaporeSecret = $null
    [Array]::Clear($tokenBytes, 0, $tokenBytes.Length)
    $env:VERCEL_TOKEN = $previousToken
}
