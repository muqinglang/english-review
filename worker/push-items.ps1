param(
  [Parameter(Mandatory = $true)][string]$Token,
  [Parameter(Mandatory = $true)][string]$ItemsFile,
  [string]$ApiBase = "https://english-review-three.vercel.app"
)

$body = Get-Content -Raw -Encoding UTF8 $ItemsFile
Invoke-RestMethod -Method Post -Uri "$ApiBase/api/worker/push" -Headers @{ Authorization = "Bearer $Token" } -ContentType "application/json" -Body $body
