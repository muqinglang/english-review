param(
  [Parameter(Mandatory = $true)][string]$MarkdownFile,
  [Parameter(Mandatory = $true)][string]$AudioFile,
  [string]$Space = "English Review",
  [string]$ReviewDate,
  [string]$TokenFile = (Join-Path $PSScriptRoot ".worker-token.clixml")
)

$markdownPath = (Resolve-Path -LiteralPath $MarkdownFile).Path
$audioPath = (Resolve-Path -LiteralPath $AudioFile).Path
$markdown = Get-Content -Raw -Encoding UTF8 -LiteralPath $markdownPath
$audio = Get-Content -Raw -Encoding UTF8 -LiteralPath $audioPath | ConvertFrom-Json
if (-not $ReviewDate) {
  $ReviewDate = [IO.Path]::GetFileNameWithoutExtension($markdownPath)
}

$payload = [ordered]@{
  space = $Space
  review = [ordered]@{
    reviewDate = $ReviewDate
    title = if ($audio.title) { $audio.title } else { "Daily English Review" }
    durationMinutes = "8–12"
    level = "B1"
    contentMarkdown = $markdown
    audioCards = @($audio.cards)
  }
}

$payloadFile = Join-Path ([IO.Path]::GetTempPath()) "chat-review-$([guid]::NewGuid().ToString('N')).json"
try {
  $payload | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -LiteralPath $payloadFile
  & (Join-Path $PSScriptRoot "push-items.ps1") -ItemsFile $payloadFile -TokenFile $TokenFile
}
finally {
  if (Test-Path -LiteralPath $payloadFile) {
    Remove-Item -LiteralPath $payloadFile -Force
  }
}
