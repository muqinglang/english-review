param(
  [string]$TokenFile = (Join-Path $PSScriptRoot ".worker-token.clixml")
)

$secureToken = Read-Host "Paste the Worker token (input is hidden)" -AsSecureString
if ($secureToken.Length -lt 20) {
  throw "The Worker token is too short. Nothing was saved."
}

$targetDirectory = Split-Path -Parent $TokenFile
if (-not (Test-Path -LiteralPath $targetDirectory)) {
  New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
}

$secureToken | Export-Clixml -LiteralPath $TokenFile -Force
Write-Host "Worker token saved with Windows user encryption: $TokenFile"
Write-Host "Only the current Windows user on this computer can decrypt it."
