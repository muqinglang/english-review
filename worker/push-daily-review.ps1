param(
  [Parameter(Mandatory = $true)][string]$MarkdownFile,
  [Parameter(Mandatory = $true)][string]$AudioFile,
  [string]$Space = "English Review",
  [string]$ReviewDate,
  [string]$LedgerFile = (Join-Path $PSScriptRoot "..\ledger.json"),
  [string]$TokenFile = (Join-Path $PSScriptRoot ".worker-token.clixml"),
  [string]$ApiBase = "https://english-review-three.vercel.app",
  [int]$TimeoutSec = 30
)

$markdownPath = (Resolve-Path -LiteralPath $MarkdownFile).Path
$audioPath = (Resolve-Path -LiteralPath $AudioFile).Path
$ledgerPath = (Resolve-Path -LiteralPath $LedgerFile).Path
$markdown = [string]::Concat((Get-Content -Raw -Encoding UTF8 -LiteralPath $markdownPath))
$audio = Get-Content -Raw -Encoding UTF8 -LiteralPath $audioPath | ConvertFrom-Json
$ledger = Get-Content -Raw -Encoding UTF8 -LiteralPath $ledgerPath | ConvertFrom-Json
Write-Verbose "Loaded review markdown and $(@($audio.cards).Count) audio cards."
if ([string]::IsNullOrWhiteSpace($markdown)) {
  throw "The review markdown file is empty: $markdownPath"
}
if (-not $audio.cards -or @($audio.cards).Count -eq 0) {
  throw "The audio file must contain at least one card: $audioPath"
}
if (-not $ledger.items -or @($ledger.items).Count -eq 0) {
  throw "The ledger must contain at least one learning item: $ledgerPath"
}
if (-not $ReviewDate) {
  $ReviewDate = [IO.Path]::GetFileNameWithoutExtension($markdownPath)
}
if ($ReviewDate -notmatch '^\d{4}-\d{2}-\d{2}$') {
  throw "ReviewDate must use YYYY-MM-DD format: $ReviewDate"
}
$markdownDate = [IO.Path]::GetFileNameWithoutExtension($markdownPath)
if ($markdownDate -match '^\d{4}-\d{2}-\d{2}$' -and $markdownDate -ne $ReviewDate) {
  throw "The Markdown filename date '$markdownDate' does not match ReviewDate '$ReviewDate'."
}
$audioDate = ([string]$audio.date).Trim()
if ($audioDate -ne $ReviewDate) {
  throw "The audio JSON date '$audioDate' does not match ReviewDate '$ReviewDate'."
}

# The daily-review save RPC accepts a narrower type enum than the capture
# pipeline (which also allows 'grammar'). Map any out-of-enum type to the closest
# accepted one so a legitimately captured item can still enter a review. This is
# applied only to the pushed review payload; the ledger/cloud keep their own type.
$reviewTypeAllow = @('fact', 'concept', 'decision', 'quote', 'vocabulary', 'expression', 'error', 'pronunciation')
$reviewTypeMap = @{ 'grammar' = 'expression' }
function Resolve-ReviewType([string]$type) {
  $trimmed = ([string]$type).Trim()
  if ($reviewTypeAllow -contains $trimmed) { return $trimmed }
  if ($reviewTypeMap.ContainsKey($trimmed)) { return $reviewTypeMap[$trimmed] }
  return 'expression'
}

$audioCards = @()
$items = @()
$itemKeys = @()
$seenIds = @{}
$seenKeys = @{}
foreach ($card in $audio.cards) {
  $id = ([string]$card.id).Trim()
  $prompt = ([string]$card.prompt).Trim()
  $normal = ([string]$card.normal).Trim()
  if ([string]::IsNullOrWhiteSpace($id) -or [string]::IsNullOrWhiteSpace($prompt) -or [string]::IsNullOrWhiteSpace($normal)) {
    throw "Each audio card must contain non-empty id, prompt, and normal fields. Invalid card id: '$id'."
  }
  if ($seenIds.ContainsKey($id)) {
    throw "Audio card ids must be unique. Duplicate id: '$id'."
  }
  $seenIds[$id] = $true

  $matches = @($ledger.items | Where-Object { ([string]$_.id).Trim() -eq $id })
  if ($matches.Count -ne 1) {
    throw "Audio card id '$id' must match exactly one ledger item; found $($matches.Count)."
  }
  $ledgerItem = $matches[0]
  $normalizedKey = ([string]$ledgerItem.normalized_key).Trim()
  $cue = ([string]$ledgerItem.cue).Trim()
  $answer = ([string]$ledgerItem.answer).Trim()
  if ([string]::IsNullOrWhiteSpace($normalizedKey) -or [string]::IsNullOrWhiteSpace($cue) -or [string]::IsNullOrWhiteSpace($answer)) {
    throw "Ledger item '$id' must contain non-empty normalized_key, cue, and answer fields."
  }
  if ($seenKeys.ContainsKey($normalizedKey)) {
    throw "Each selected learning item must be unique. Duplicate normalized_key: '$normalizedKey'."
  }
  $seenKeys[$normalizedKey] = $true

  $audioCard = [ordered]@{
    id = $id
    prompt = $prompt
    normal = $normal
  }
  $slow = ([string]$card.slow).Trim()
  if (-not [string]::IsNullOrWhiteSpace($slow)) {
    $audioCard.slow = $slow
  }
  $audioCards += [pscustomobject]$audioCard
  $itemKeys += $normalizedKey
  $items += [pscustomobject]@{
    normalizedKey = $normalizedKey
    type = (Resolve-ReviewType ([string]$ledgerItem.type))
    cue = $cue
    answer = $answer
    example = ([string]$ledgerItem.example).Trim()
    priority = ([string]$ledgerItem.priority).Trim()
    occurrences = [int]$ledgerItem.occurrences
    dueDate = ([string]$ledgerItem.next_due).Trim()
    learnedOn = $(if (([string]$ledgerItem.learned_on).Trim()) { ([string]$ledgerItem.learned_on).Trim() } else { $null })
  }
}
$firstHeading = ($markdown -split "`r?`n" | Where-Object { $_ -match '^#\s+' } | Select-Object -First 1)
$reviewTitle = if ($firstHeading) { $firstHeading -replace '^#\s+', '' } elseif ($audio.title) { [string]$audio.title } else { "Daily English Review" }

$payload = [pscustomobject]@{
  space = $Space
  items = $items
  review = [pscustomobject]@{
    reviewDate = $ReviewDate
    title = $reviewTitle
    durationMinutes = "8-12"
    level = "B1"
    contentMarkdown = $markdown
    audioCards = $audioCards
    itemKeys = $itemKeys
  }
}

$payloadFile = Join-Path ([IO.Path]::GetTempPath()) "chat-review-$([guid]::NewGuid().ToString('N')).json"
try {
  $payloadJson = $payload | ConvertTo-Json -Depth 6 -Compress
  $roundTrip = $payloadJson | ConvertFrom-Json
  Write-Verbose "Payload field types: markdown=$($roundTrip.review.contentMarkdown.GetType().Name), cards=$(@($roundTrip.review.audioCards).Count)."
  $payloadJson | Set-Content -Encoding UTF8 -LiteralPath $payloadFile
  Write-Verbose "Built the daily review payload."
  $response = & (Join-Path $PSScriptRoot "push-items.ps1") -ItemsFile $payloadFile -TokenFile $TokenFile -ApiBase $ApiBase -TimeoutSec $TimeoutSec -Verbose
  if (-not $?) { throw "The Worker push command failed." }
  if (-not $response.ok -or -not $response.reviewSaved) {
    throw "The Worker API did not confirm the review was saved."
  }
  if ([int]$response.accepted -ne $items.Count) {
    throw "The Worker API accepted $($response.accepted) of $($items.Count) selected learning items."
  }
  if ($response.knowledgeSpace -ne $Space) {
    throw "The Worker API saved the review to an unexpected knowledge space: '$($response.knowledgeSpace)'."
  }
  if ($response.reviewDate -ne $ReviewDate -or [string]::IsNullOrWhiteSpace([string]$response.reviewId)) {
    throw "The Worker API did not confirm the expected review date and id. Expected date: '$ReviewDate'."
  }
  $response
}
finally {
  if (Test-Path -LiteralPath $payloadFile) {
    Remove-Item -LiteralPath $payloadFile -Force
  }
}
