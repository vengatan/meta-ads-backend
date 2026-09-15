param(
    [string]$CredentialFile = "$env:LOCALAPPDATA\Vensure\meta-ads-backend\vercel-token.dpapi"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Security
$credentialDirectory = Split-Path -Parent $CredentialFile
New-Item -ItemType Directory -Force -Path $credentialDirectory | Out-Null

$token = Read-Host "Paste the Vercel team token (stored encrypted for this Windows user)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($token)
try {
    $plainText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    $plainBytes = [Text.Encoding]::UTF8.GetBytes($plainText)
    try {
        $encryptedBytes = [Security.Cryptography.ProtectedData]::Protect(
            $plainBytes,
            $null,
            [Security.Cryptography.DataProtectionScope]::CurrentUser
        )
        [Convert]::ToBase64String($encryptedBytes) | Set-Content -LiteralPath $CredentialFile -Encoding ascii
    }
    finally {
        [Array]::Clear($plainBytes, 0, $plainBytes.Length)
        $plainText = $null
    }
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

Write-Output "Encrypted Vercel credential saved for the current Windows user. The plaintext token was not written to the repository."
