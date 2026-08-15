Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$reviewDate = '2026-08-13'
$ledgerPath = Join-Path $root 'ledger.json'
$ledger = Get-Content -LiteralPath $ledgerPath -Raw -Encoding UTF8 | ConvertFrom-Json

# This captured record teaches only valid; its old key also named a separate
# carve-out phrase. Keep the independently scheduled knowledge point atomic.
$validItem = @($ledger.items | Where-Object { $_.id -eq 'web-bc84c42e-e6c2-4038-ba0c-2b8f2caacecc' })
if ($validItem.Count -eq 1 -and $validItem[0].normalized_key -eq 'carve out a path valid') {
  $validItem[0].normalized_key = 'valid for feelings and concerns'
}

# The first seven IDs are the explicitly scheduled, independently scoreable items.
$selectedKeys = @(
  'weigh A against B',
  'balance A and B',
  'be plus balancing',
  'consider both A and B',
  'consider plus gerund',
  'quit possessive job',
  'weigh body weight',
  'valid for feelings and concerns',
  'insist on doing',
  'to plus base verb'
)
$selected = @()
foreach ($key in $selectedKeys) {
  $matches = @($ledger.items | Where-Object { $_.normalized_key -eq $key })
  if ($matches.Count -ne 1) { throw "Expected exactly one ledger item for '$key'; found $($matches.Count)." }
  $item = $matches[0]
  # A complete same-day archive may be regenerated after validation; it is not
  # a new selection and does not advance SRS fields.
  if ($item.next_due -gt $reviewDate -or ($item.last_shown -and $item.last_shown -gt $reviewDate)) {
    throw "Item '$key' is not eligible for $reviewDate."
  }
  $selected += $item
}

if ($selected.Count -ne 10) { throw 'Expected ten selected items.' }
foreach ($item in $selected) { $item.last_shown = $reviewDate }
$ledger.last_generated_date = $reviewDate

function Detail([object]$item) {
  try { return ($item.example | ConvertFrom-Json -ErrorAction Stop) }
  catch { throw "Item '$($item.normalized_key)' has no structured example." }
}
function FirstEnglish([object]$item) { return (Detail $item).examples[0].english }

$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add("# Daily English Review | $reviewDate")
$lines.Add('')
$lines.Add('## Recall first')
$lines.Add('')
$lines.Add('1. Translate: I am weighing a higher salary against more free time.')
$lines.Add('2. Translate: I am trying to balance work and family life.')
$lines.Add('3. Translate: I am considering changing jobs after the project ends.')
$lines.Add('4. Translate: Please weigh the package before you mail it.')
$lines.Add('5. Correct: I am balance work and family life.')
$lines.Add('6. Correct: I am considering quitting job.')
$lines.Add('7. Listening: repeat My suitcase weighs eighteen kilos. Distinguish weigh /weI/ from weight /weIt/.')
$lines.Add('')
$lines.Add('## Natural phrasing')
$lines.Add('')
$lines.Add('- Say that you need to balance speed and quality, rather than choose just one.')
$lines.Add('- Say that you are considering both the rent and the location.')
$lines.Add('')
$lines.Add('## Speaking challenge')
$lines.Add('')
$lines.Add('Speak for 30-60 seconds about a work or life decision. Use at least two of: **weigh A against B**, **balance A and B**, **consider + doing**, **insist on doing**.')
$lines.Add('')
$lines.Add('## Answers and notes')
$lines.Add('')
for ($index = 0; $index -lt $selected.Count; $index++) {
  $item = $selected[$index]
  $d = Detail $item
  $lines.Add("### $($index + 1). $($item.normalized_key)")
  $lines.Add('')
  $lines.Add("- Core meaning: $($d.meaning)")
  $lines.Add("- Plain explanation: $($d.explanation)")
  $lines.Add('- Real-life examples:')
  foreach ($ex in $d.examples) {
    $lines.Add("  - $($ex.scenario): $($ex.english) ($($ex.chinese))")
  }
  $lines.Add("- Usage tip: $($d.usageTip)")
  $lines.Add('')
}
$lines.Add('## Reference answers')
$lines.Add('')
$lines.Add('1. I am weighing a higher salary against more free time.')
$lines.Add('2. I am trying to balance work and family life.')
$lines.Add('3. I am considering changing jobs after the project ends.')
$lines.Add('4. Please weigh the package before you mail it.')
$lines.Add('5. Wrong: I am balance ... Correct: I am balancing work and family life.')
$lines.Add('6. Wrong: quitting job. Correct: I am considering quitting my job.')
$lines.Add('7. weigh is /weI/; weighs ends in /z/. weight is the noun /weIt/.')
$lines.Add('')
$lines.Add('## One thing to remember')
$lines.Add('')
$lines.Add('**weigh A against B** compares tradeoffs before choosing; **balance A and B** keeps both sides in a workable state.')

$cards = foreach ($item in $selected) {
  [pscustomobject]@{
    id = [string]$item.id
    prompt = [string]$item.cue
    normal = [string](FirstEnglish $item)
  }
}
$reviewsPath = Join-Path $root 'reviews'
New-Item -ItemType Directory -Path $reviewsPath -Force | Out-Null
$markdownPath = Join-Path $reviewsPath "$reviewDate.md"
$audioPath = Join-Path $reviewsPath "$reviewDate.audio.json"
[System.IO.File]::WriteAllText($markdownPath, ($lines -join [Environment]::NewLine) + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($audioPath, ([pscustomobject]@{ date=$reviewDate; cards=@($cards) } | ConvertTo-Json -Depth 6), [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($ledgerPath, ($ledger | ConvertTo-Json -Depth 12), [System.Text.UTF8Encoding]::new($false))

[pscustomobject]@{ ok=$true; reviewDate=$reviewDate; markdownFile=$markdownPath; audioFile=$audioPath; cards=@($cards).Count; selectedKeys=$selectedKeys }
