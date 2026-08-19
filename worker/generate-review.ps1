param(
  [string]$ReviewDate,
  [int]$MaxItems = 10
)

# Dynamic daily-review generator.
#
# Unlike the deprecated fixed-seed generate-daily-review.ps1, this reads the
# CURRENT ledger (after pull-review-state.ps1 has merged cloud truth) and picks
# the items that are actually due today, following REVIEW_SPEC.md step 4:
#   P1  pending_answer items (shown, not yet self-rated after that show)
#   P2  other due items that already have a self-rating (wrong/unsure first)
#   P3  never-shown but already-due new items  (max 2)
# Only items that carry a natural-English example sentence are eligible, because
# the online push turns each selected item into an audio card whose `normal`
# field must be English-only (REVIEW_SPEC.md audio rules). Selection never uses
# next_due > today, never re-shows an item already shown today, and never
# rewrites next_due — only the website self-rating endpoint advances the schedule.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

if (-not $ReviewDate) {
  $tz = [System.TimeZoneInfo]::FindSystemTimeZoneById('China Standard Time')
  $ReviewDate = [System.TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $tz).ToString('yyyy-MM-dd')
}
if ($ReviewDate -notmatch '^\d{4}-\d{2}-\d{2}$') {
  throw "ReviewDate must use YYYY-MM-DD format: $ReviewDate"
}

$ledgerPath = Join-Path $root 'ledger.json'
$ledger = Get-Content -LiteralPath $ledgerPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not ($ledger.PSObject.Properties.Name -contains 'items')) {
  throw "The ledger does not contain an items array: $ledgerPath"
}

function Get-RichAnswer($item) {
  # Returns $null when the item has no parseable {meaning, examples:[{english}]}
  # rich payload, so it cannot supply an English audio sentence.
  $raw = [string]$item.example
  if ([string]::IsNullOrWhiteSpace($raw) -or -not $raw.Trim().StartsWith('{')) { return $null }
  try { $parsed = $raw | ConvertFrom-Json } catch { return $null }
  if (-not $parsed -or -not ($parsed.PSObject.Properties.Name -contains 'examples')) { return $null }
  $examples = @($parsed.examples | Where-Object { $_ -and -not [string]::IsNullOrWhiteSpace([string]$_.english) })
  if ($examples.Count -eq 0) { return $null }
  return [pscustomobject]@{
    meaning     = [string]$parsed.meaning
    explanation = [string]$parsed.explanation
    usageTip    = [string]$parsed.usageTip
    examples    = $examples
  }
}

$resultRank = @{ 'incorrect' = 0; 'partial' = 1; 'correct' = 3 }
$prioRank   = @{ 'high' = 0; 'medium' = 1; 'low' = 2 }

$candidates = @()
foreach ($item in @($ledger.items)) {
  $nextDue = ([string]$item.next_due).Trim()
  $lastShown = ([string]$item.last_shown).Trim()
  if ($nextDue -notmatch '^\d{4}-\d{2}-\d{2}$') { continue }
  if ($nextDue -gt $ReviewDate) { continue }                       # not due yet
  if ($lastShown -and $lastShown -ge $ReviewDate) { continue }     # already shown today
  $rich = Get-RichAnswer $item
  if (-not $rich) { continue }                                     # no English sentence -> cannot be an audio card

  $lastResult = ([string]$item.last_result).Trim()
  $attempts = [int]$item.attempts
  $pending = [bool]$item.pending_answer
  $tier = if ($pending) { 1 } elseif ($lastResult -or $attempts -gt 0) { 2 } elseif (-not $lastShown) { 3 } else { 4 }
  $rRank = if ($lastResult -and $resultRank.ContainsKey($lastResult)) { $resultRank[$lastResult] } else { 2 }
  $pRank = if ($prioRank.ContainsKey(([string]$item.priority).Trim())) { $prioRank[([string]$item.priority).Trim()] } else { 1 }

  $candidates += [pscustomobject]@{
    Item = $item; Rich = $rich; Tier = $tier; ResultRank = $rRank; PrioRank = $pRank; NextDue = $nextDue
  }
}

# Wrong/unsure surface before correct within a tier; higher priority and older
# due dates break further ties so the longest-overdue items are not starved.
$ordered = $candidates | Sort-Object Tier, ResultRank, PrioRank, NextDue

$selected = @()
$newCount = 0
foreach ($candidate in $ordered) {
  if ($selected.Count -ge $MaxItems) { break }
  if ($candidate.Tier -eq 3) {
    if ($newCount -ge 2) { continue }   # REVIEW_SPEC: at most 2 brand-new items per day
    $newCount++
  }
  $selected += $candidate
}

if ($selected.Count -eq 0) {
  throw "No due items with an English example are available for $ReviewDate."
}

# Mark the selected items as shown today and pending a self-rating. next_due is
# intentionally left untouched — only the website advances the schedule.
foreach ($candidate in $selected) {
  $item = $candidate.Item
  $item.last_shown = $ReviewDate
  if ($item.PSObject.Properties.Name -contains 'pending_answer') { $item.pending_answer = $true }
  else { $item | Add-Member -NotePropertyName pending_answer -NotePropertyValue $true }
}
if ($ledger.PSObject.Properties.Name -contains 'last_generated_date') { $ledger.last_generated_date = $ReviewDate }
else { $ledger | Add-Member -NotePropertyName last_generated_date -NotePropertyValue $ReviewDate }

# --- Build the Markdown review (title line is the source of the online title) ---
$recallLines = @()
$answerBlocks = @()
$index = 0
foreach ($candidate in $selected) {
  $index++
  $item = $candidate.Item
  $rich = $candidate.Rich
  $recallLines += "$index. $([string]$item.cue)"

  $exampleParts = @()
  foreach ($example in ($rich.examples | Select-Object -First 3)) {
    $scenario = ([string]$example.scenario).Trim()
    $english = ([string]$example.english).Trim()
    $chinese = ([string]$example.chinese).Trim()
    $line = if ($scenario) { "$scenario：$english" } else { $english }
    if ($chinese) { $line = "$line（$chinese）" }
    $exampleParts += $line
  }
  $block = @()
  $block += "### $index. $([string]$item.normalized_key)"
  $block += ""
  if ($rich.meaning) { $block += "- Core meaning: $($rich.meaning)" }
  if ($rich.explanation) { $block += "- How to think of it: $($rich.explanation)" }
  if ($exampleParts.Count) { $block += "- In real life: $([string]::Join('  ', $exampleParts))" }
  if ($rich.usageTip) { $block += "- Usage tip: $($rich.usageTip)" }
  $answerBlocks += ($block -join [Environment]::NewLine)
}

$nl = [Environment]::NewLine
$md = @()
$md += "# ☀️ Daily Speaking Review | $ReviewDate"
$md += ""
$md += "## Recall first (don't peek)"
$md += ""
$md += $recallLines
$md += ""
$md += "## Answers & tips"
$md += ""
$md += ($answerBlocks -join ($nl + $nl))
$markdown = ($md -join $nl)

# --- Build the audio cards (one per selected item, English `normal`) ---
$audioCards = @()
foreach ($candidate in $selected) {
  $item = $candidate.Item
  $normal = ([string]$candidate.Rich.examples[0].english).Trim()
  $card = [ordered]@{
    id = ([string]$item.id).Trim()
    prompt = ([string]$item.cue).Trim()
    normal = $normal
  }
  $audioCards += [pscustomobject]$card
}

$reviews = Join-Path $root 'reviews'
New-Item -ItemType Directory -Force -Path $reviews | Out-Null
$mdPath = Join-Path $reviews "$ReviewDate.md"
$audioPath = Join-Path $reviews "$ReviewDate.audio.json"

$utf8 = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($mdPath, $markdown.Trim() + $nl, $utf8)
[System.IO.File]::WriteAllText($audioPath, ([pscustomobject]@{ date = $ReviewDate; cards = $audioCards } | ConvertTo-Json -Depth 4), $utf8)
[System.IO.File]::WriteAllText($ledgerPath, ($ledger | ConvertTo-Json -Depth 20) + $nl, $utf8)

[pscustomobject]@{
  ok = $true
  reviewDate = $ReviewDate
  markdownFile = $mdPath
  audioFile = $audioPath
  cards = $audioCards.Count
  selectedIds = @($selected | ForEach-Object { [string]$_.Item.id })
  tiers = @($selected | ForEach-Object { $_.Tier })
}
