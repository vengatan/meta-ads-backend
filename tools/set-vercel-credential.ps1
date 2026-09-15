param(
    [string]$CredentialFile = "$env:LOCALAPPDATA\Vensure\meta-ads-backend\vercel-token.dpapi"
)

$ErrorActionPreference = "Stop"
$credentialDirectory = Split-Path -Parent $CredentialFile
New-Item -ItemType Directory -Force -Path $credentialDirectory | Out-Null

$token = Read-Host "Paste the Vercel team token (stored encrypted for this Windows user)" -AsSecureString
$token | ConvertFrom-SecureString | Set-Content -LiteralPath $CredentialFile -Encoding utf8

Write-Output "Encrypted Vercel credential saved for the current Windows user. The plaintext token was not written to the repository."
