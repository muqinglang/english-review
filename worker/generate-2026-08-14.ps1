Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$reviewDate = '2026-08-14'
$ledgerPath = Join-Path $root 'ledger.json'
$ledger = Get-Content -LiteralPath $ledgerPath -Raw -Encoding UTF8 | ConvertFrom-Json

# Only atomic, independently scoreable items are eligible.  The legacy bundled
# records (for example, nudge+willpower and executor+eulogy) remain in history
# but are deliberately not selected.
$selectedIds = @(
  'v-insist-persist',
  'v-weigh-body-weight',
  'v-nudge',
  'web-282d08af-6850-4850-8ad8-196e69fb6709',
  'web-79094555-c74a-4097-9119-45de33d7a88a',
  'web-fdd92f83-fb07-4eb8-8370-0e957622155a',
  'web-e455f45e-ee28-414f-8da9-92c72be803b7',
  'v-willpower',
  'e-verb-forms',
  'v-resist'
)

$selected = @()
foreach ($id in $selectedIds) {
  $matches = @($ledger.items | Where-Object { $_.id -eq $id })
  if ($matches.Count -ne 1) { throw "Expected exactly one item for id '$id'; found $($matches.Count)." }
  $item = $matches[0]
  if ($item.next_due -gt $reviewDate -or ($item.last_shown -and $item.last_shown -ge $reviewDate)) {
    throw "Item '$($item.normalized_key)' is not eligible for $reviewDate."
  }
  $selected += $item
}
if ($selected.Count -ne 10) { throw 'Expected exactly ten eligible atomic items.' }

function Detail([object]$item) {
  try { $d = $item.example | ConvertFrom-Json -ErrorAction Stop }
  catch { throw "Item '$($item.normalized_key)' has no parseable structured example." }
  if (-not $d.meaning -or -not $d.explanation -or -not $d.usageTip -or @($d.examples).Count -lt 3) { throw "Item '$($item.normalized_key)' lacks required rich detail." }
  return $d
}

$details = @{}
foreach ($item in $selected) { $details[$item.id] = Detail $item }

$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add("# Daily English Review | $reviewDate")
$lines.Add('')
$lines.Add('## Recall first')
$lines.Add('')
$lines.Add('1. Translate: She insisted on testing the feature before release.')
$lines.Add('2. Translate: I am weighing a higher salary against more free time.')
$lines.Add('3. Translate: I am considering quitting my job.')
$lines.Add('4. Translate: I am balancing work and family life.')
$lines.Add('5. Correct: I am balance work and family life.')
$lines.Add('6. Correct: I am considering quitting job.')
$lines.Add('7. Listening: repeat "Please weigh your suitcase before you leave." Distinguish weigh /weI/ (verb) from weight /weIt/ (noun).')
$lines.Add('')
$lines.Add('## Natural phrasing')
$lines.Add('')
$lines.Add('- Say: Do not just guess; give yourself a gentle nudge to check first.')
$lines.Add('- Say: I am trying to resist the urge to check the answer now.')
$lines.Add('')
$lines.Add('## Speaking challenge')
$lines.Add('')
$lines.Add('Speak for 30-60 seconds about a decision you need to make. Use at least two of: **weigh A against B**, **consider + doing**, **willpower**, **resist**.')
$lines.Add('')
$lines.Add('## Answers and notes')
$lines.Add('')
for ($index = 0; $index -lt $selected.Count; $index++) {
  $item = $selected[$index]
  $d = $details[$item.id]
  $lines.Add("### $($index + 1). $($item.normalized_key)")
  $lines.Add('')
  $lines.Add("- Chinese core meaning: $($d.meaning)")
  $lines.Add("- Plain explanation: $($d.explanation)")
  $lines.Add('- Real-life examples:')
  foreach ($ex in $d.examples) { $lines.Add("  - $($ex.scenario): $($ex.english) ($($ex.chinese))") }
  $lines.Add("- Usage tip: $($d.usageTip)")
  $lines.Add('')
}
$lines.Add('## Reference answers')
$lines.Add('')
$lines.Add('1. She insisted on testing the feature before release.')
$lines.Add('2. I am weighing a higher salary against more free time.')
$lines.Add('3. I am considering quitting my job.')
$lines.Add('4. I am balancing work and family life.')
$lines.Add('5. Wrong: am cannot be followed by bare balance. Correct: I am balancing work and family life.')
$lines.Add('6. Wrong: a singular countable job cannot be bare. Correct: I am considering quitting my job.')
$lines.Add('7. weigh is the verb /weI/; weight is the noun /weIt/.')
$lines.Add('')
$lines.Add('## One thing to remember')
$lines.Add('')
$lines.Add('For decisions, **weigh A against B** compares tradeoffs; **consider + doing** puts an action under consideration.')

$cards = foreach ($item in $selected) {
  $d = $details[$item.id]
  [pscustomobject]@{ id=[string]$item.id; prompt=[string]$item.cue; normal=[string]$d.examples[0].english }
}
foreach ($card in $cards) {
  if ([string]::IsNullOrWhiteSpace($card.id) -or [string]::IsNullOrWhiteSpace($card.prompt) -or [string]::IsNullOrWhiteSpace($card.normal)) { throw 'Audio card has an empty required value.' }
}

foreach ($item in $selected) { $item.last_shown = $reviewDate }
$ledger.last_generated_date = $reviewDate
$reviewsPath = Join-Path $root 'reviews'
New-Item -ItemType Directory -Path $reviewsPath -Force | Out-Null
$markdownPath = Join-Path $reviewsPath "$reviewDate.md"
$audioPath = Join-Path $reviewsPath "$reviewDate.audio.json"
[System.IO.File]::WriteAllText($markdownPath, ($lines -join [Environment]::NewLine) + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($audioPath, ([pscustomobject]@{date=$reviewDate;cards=@($cards)} | ConvertTo-Json -Depth 6), [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($ledgerPath, ($ledger | ConvertTo-Json -Depth 12), [System.Text.UTF8Encoding]::new($false))

[pscustomobject]@{ok=$true; reviewDate=$reviewDate; markdownFile=$markdownPath; audioFile=$audioPath; cards=@($cards).Count; selectedIds=$selectedIds}
