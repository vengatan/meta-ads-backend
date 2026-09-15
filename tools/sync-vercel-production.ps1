param(
    [string]$EnvFile = ".env.local",
    [string]$CredentialFile = "$env:LOCALAPPDATA\Vensure\meta-ads-backend\vercel-token.dpapi",
    [switch]$Deploy
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Security
$projectName = "meta-ads-backend"
$teamSlug = "venga-s-projects"

if (-not (Test-Path -LiteralPath $EnvFile)) {
    throw "Configuration file not found: $EnvFile"
}

$config = @{}
foreach ($rawLine in Get-Content -LiteralPath $EnvFile) {
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith("#")) { continue }
    $separator = $line.IndexOf("=")
    if ($separator -lt 1) { continue }
    $config[$line.Substring(0, $separator).Trim()] = $line.Substring($separator + 1).Trim()
}

$required = @(
    "ZOHO_ORGANIZATION_IDS",
    "ZOHO_PAID_ORDER_WEBHOOK_SECRET",
    "PAID_CONVERSION_DELIVERY_ENABLED",
    "GA4_MEASUREMENT_IDS_BY_ORG",
    "GA4_API_SECRETS_BY_ORG",
    "META_CAPI_TRANSPORT",
    "META_PIXEL_IDS_BY_ORG",
    "META_ACCESS_TOKEN",
    "PAID_ORDER_EVENT_SOURCE_URLS_BY_ORG"
)

if (Test-Path -LiteralPath $CredentialFile) {
    $encryptedBytes = [Convert]::FromBase64String((Get-Content -Raw -LiteralPath $CredentialFile).Trim())
    $plainBytes = [Security.Cryptography.ProtectedData]::Unprotect(
        $encryptedBytes,
        $null,
        [Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    try {
        # The encrypted Windows credential is authoritative. This prevents a
        # stale plaintext VERCEL_TOKEN in .env.local from overriding it.
        $config["VERCEL_TOKEN"] = [Text.Encoding]::UTF8.GetString($plainBytes)
    }
    finally {
        [Array]::Clear($plainBytes, 0, $plainBytes.Length)
    }
}

if (-not $config.ContainsKey("VERCEL_TOKEN") -or -not $config["VERCEL_TOKEN"]) {
    throw "No Vercel credential is available. Run tools/set-vercel-credential.ps1 once; future syncs will reuse the encrypted Windows credential."
}

$missing = @($required | Where-Object { -not $config.ContainsKey($_) -or -not $config[$_] })
if ($missing.Count -gt 0) {
    throw "Refusing to change Production. Missing required keys: $($missing -join ', ')"
}

$previousToken = $env:VERCEL_TOKEN
try {
    $env:VERCEL_TOKEN = $config["VERCEL_TOKEN"]

    & npx vercel whoami --scope $teamSlug --no-color | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "VERCEL_TOKEN is invalid or cannot access team $teamSlug. No Production variables were changed."
    }

    & npx vercel link --yes --project $projectName --scope $teamSlug --no-color | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not link canonical Vercel project $projectName." }

    $listed = (& npx vercel env list production --scope $teamSlug --no-color 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) { throw "Could not list Production environment variables." }

    foreach ($key in $required) {
        $verb = if ($listed -match "(?m)^\s*$([regex]::Escape($key))\s") { "update" } else { "add" }
        $config[$key] | & npx vercel env $verb $key production --scope $teamSlug --no-color | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Failed to $verb Production variable $key." }
        Write-Output "$verb ${key}: OK"
    }

    if ($Deploy) {
        & npx vercel deploy --prod --yes --scope $teamSlug --no-color
        if ($LASTEXITCODE -ne 0) { throw "Production deployment failed." }
    } else {
        Write-Output "Variables synchronized. Run again with -Deploy to create the required Production deployment."
    }
}
finally {
    $env:VERCEL_TOKEN = $previousToken
}
