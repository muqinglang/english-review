param(
  [Parameter(Mandatory = $true)][string]$MarkdownFile,
  [Parameter(Mandatory = $true)][string]$AudioFile,
  [string]$Space = "English Review",
  [string]$ReviewDate,
  [string]$TokenFile = (Join-Path $PSScriptRoot ".worker-token.clixml")
)

$markdownPath = (Resolve-Path -LiteralPath $MarkdownFile).Path
$audioPath = (Resolve-Path -LiteralPath $AudioFile).Path
$markdown = [string]::Concat((Get-Content -Raw -Encoding UTF8 -LiteralPath $markdownPath))
$audio = Get-Content -Raw -Encoding UTF8 -LiteralPath $audioPath | ConvertFrom-Json
Write-Verbose "Loaded review markdown and $(@($audio.cards).Count) audio cards."
if (-not $ReviewDate) {
  $ReviewDate = [IO.Path]::GetFileNameWithoutExtension($markdownPath)
}

$audioCards = @()
foreach ($card in $audio.cards) {
  $audioCards += [pscustomobject]@{
    id = [string]$card.id
    prompt = [string]$card.prompt
    normal = [string]$card.normal
    slow = [string]$card.slow
  }
}
$firstHeading = ($markdown -split "`r?`n" | Where-Object { $_ -match '^#\s+' } | Select-Object -First 1)
$reviewTitle = if ($firstHeading) { $firstHeading -replace '^#\s+', '' } elseif ($audio.title) { [string]$audio.title } else { "Daily English Review" }

$payload = [pscustomobject]@{
  space = $Space
  review = [pscustomobject]@{
    reviewDate = $ReviewDate
    title = $reviewTitle
    durationMinutes = "8–12"
    level = "B1"
    contentMarkdown = $markdown
    audioCards = $audioCards
  }
}

$payloadFile = Join-Path ([IO.Path]::GetTempPath()) "chat-review-$([guid]::NewGuid().ToString('N')).json"
try {
  $payloadJson = $payload | ConvertTo-Json -Depth 4 -Compress
  $roundTrip = $payloadJson | ConvertFrom-Json
  Write-Verbose "Payload field types: markdown=$($roundTrip.review.contentMarkdown.GetType().Name), cards=$(@($roundTrip.review.audioCards).Count)."
  $payloadJson | Set-Content -Encoding UTF8 -LiteralPath $payloadFile
  Write-Verbose "Built the daily review payload."
  & (Join-Path $PSScriptRoot "push-items.ps1") -ItemsFile $payloadFile -TokenFile $TokenFile -Verbose
  if (-not $?) { throw "The Worker push command failed." }
}
finally {
  if (Test-Path -LiteralPath $payloadFile) {
    Remove-Item -LiteralPath $payloadFile -Force
  }
}
