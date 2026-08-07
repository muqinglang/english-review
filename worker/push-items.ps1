param(
  [string]$Token,
  [Parameter(Mandatory = $true)][string]$ItemsFile,
  [string]$ApiBase = "https://english-review-three.vercel.app",
  [string]$TokenFile = (Join-Path $PSScriptRoot ".worker-token.clixml")
)

function ConvertFrom-WorkerSecureString {
  param([Parameter(Mandatory = $true)][Security.SecureString]$SecureValue)

  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

if ([string]::IsNullOrWhiteSpace($Token)) {
  if (-not (Test-Path -LiteralPath $TokenFile)) {
    throw "Worker token is not configured. Run worker/configure-token.ps1 first."
  }

  $secureToken = Import-Clixml -LiteralPath $TokenFile
  if ($secureToken -isnot [Security.SecureString]) {
    throw "The Worker token file is invalid. Run worker/configure-token.ps1 again."
  }

  $Token = ConvertFrom-WorkerSecureString -SecureValue $secureToken
}

$body = Get-Content -Raw -Encoding UTF8 $ItemsFile
try {
  Invoke-RestMethod -Method Post -Uri "$ApiBase/api/worker/push" -Headers @{ Authorization = "Bearer $Token" } -ContentType "application/json" -Body $body
}
finally {
  $Token = $null
  $secureToken = $null
}
