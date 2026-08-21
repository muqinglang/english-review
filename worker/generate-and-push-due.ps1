param(
  [string]$Space = "English Review",
  [int]$Count = 12,
  [string]$ReviewDate,
  [switch]$Push,
  [string]$ApiBase = "https://english-review-three.vercel.app",
  [string]$TokenFile = (Join-Path $PSScriptRoot ".worker-token.clixml"),
  [int]$TimeoutSec = 30
)

# Dynamic daily review: pulls the items that are actually DUE from the app's SRS
# schedule and pushes a review built from them. Replaces the old static generator
# that always re-selected the same (already-learned) items, which the server now
# rejects because they are no longer due. Dry-run by default; pass -Push to send.
# NOTE: keep this source ASCII-only (Windows PowerShell 5.1 misreads UTF-8 w/o BOM).

$ErrorActionPreference = 'Stop'
$cjk = "[$([char]0x4e00)-$([char]0x9fff)]"

if (-not $ReviewDate) {
  $tz = [System.TimeZoneInfo]::FindSystemTimeZoneById('China Standard Time')
  $ReviewDate = [System.TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $tz).ToString('yyyy-MM-dd')
}

if (-not (Test-Path -LiteralPath $TokenFile)) { throw "Worker token not configured. Run worker/configure-token.ps1 first." }
$sec = Import-Clixml -LiteralPath $TokenFile
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
$token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

$typeAllow = @('fact','concept','decision','quote','vocabulary','expression','error','pronunciation')
function Resolve-Type([string]$t) {
  $t = ([string]$t).Trim()
  if ($typeAllow -contains $t) { return $t }
  return 'expression'
}
function Resolve-Priority([string]$p) {
  $p = ([string]$p).Trim().ToLower()
  if ($p -in @('high','medium','low')) { return $p }
  return 'medium'
}
# A clean English sentence for the listening card: prefer a rich example's first
# english line, else a plain-English example, else an English answer.
function Get-EnglishSentence($item) {
  $ex = [string]$item.example
  if ($ex) {
    $trimmed = $ex.Trim()
    if ($trimmed.StartsWith('{')) {
      try {
        $obj = $trimmed | ConvertFrom-Json
        foreach ($e in @($obj.examples)) {
          $eng = ([string]$e.english).Trim()
          if ($eng -and ($eng -match '[A-Za-z]')) { return $eng }
        }
      } catch {}
    }
    elseif ($trimmed -match '[A-Za-z]' -and -not ($trimmed -match $cjk)) {
      return $trimmed
    }
  }
  $ans = ([string]$item.answer).Trim()
  if ($ans -and ($ans -match '[A-Za-z]') -and -not ($ans -match $cjk)) { return $ans }
  return $null
}

$encodedSpace = [Uri]::EscapeDataString($Space)
# Read the response bytes and decode as UTF-8 explicitly. Invoke-RestMethod on
# Windows PowerShell 5.1 decodes as Latin-1 when no charset is on the response,
# which corrupts Chinese (and any bytes we then re-push).
Add-Type -AssemblyName System.Net.Http
$httpClient = [Net.Http.HttpClient]::new()
$httpClient.Timeout = [TimeSpan]::FromSeconds($TimeoutSec)
$httpClient.DefaultRequestHeaders.Authorization = [Net.Http.Headers.AuthenticationHeaderValue]::new("Bearer", $token)
$httpResp = $httpClient.GetAsync("$ApiBase/api/worker/context?space=$encodedSpace").GetAwaiter().GetResult()
$ctxJson = [Text.Encoding]::UTF8.GetString($httpResp.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult())
$httpClient.Dispose()
if (-not $httpResp.IsSuccessStatusCode) { throw "Worker context HTTP $([int]$httpResp.StatusCode): $ctxJson" }
$context = $ctxJson | ConvertFrom-Json
if (-not $context.ok -or -not $context.schedule) { throw "Worker context did not return a schedule." }

# Only items the server considers selectable for a fresh review that also give us
# a usable English sentence. Most-overdue first, then higher priority.
$prioRank = @{ high = 0; medium = 1; low = 2 }
$candidates = @($context.schedule.due) |
  Where-Object { $_.selectable -eq $true } |
  ForEach-Object {
    $sentence = Get-EnglishSentence $_
    if ($sentence) { $_ | Add-Member -NotePropertyName _sentence -NotePropertyValue $sentence -Force; $_ } }
$candidates = @($candidates) | Sort-Object @{ Expression = { [string]$_.nextDue } }, @{ Expression = { $prioRank[[string]$_.priority] } }
$selected = @($candidates | Select-Object -First $Count)

if ($selected.Count -eq 0) { throw "No selectable due items with a usable English sentence were found for $ReviewDate." }

$seenKey = @{}
$items = @()
$audioCards = @()
$itemKeys = @()
$mdLines = @("# Daily Review | $ReviewDate", "", "Listen, recall, and check. $($selected.Count) items due today.", "")
$n = 0
foreach ($it in $selected) {
  $key = ([string]$it.normalizedKey).Trim()
  if (-not $key -or $seenKey.ContainsKey($key)) { continue }
  $seenKey[$key] = $true
  $n++
  $items += [pscustomobject]@{
    normalizedKey = $key
    type = (Resolve-Type $it.type)
    cue = ([string]$it.cue).Trim()
    answer = ([string]$it.answer).Trim()
    example = ([string]$it.example).Trim()
    priority = (Resolve-Priority $it.priority)
    occurrences = [Math]::Max(1, [int]$it.occurrences)
    dueDate = ([string]$it.nextDue).Trim()
    learnedOn = $(if (([string]$it.learnedOn).Trim()) { ([string]$it.learnedOn).Trim() } else { $null })
  }
  $audioCards += [pscustomobject]@{ id = ([string]$it.id).Trim(); prompt = "Listen, then write what you hear."; normal = $it._sentence }
  $itemKeys += $key
  $mdLines += "$n. $($it.cue) => $($it.answer)"
}

$payload = [pscustomobject]@{
  space = $Space
  items = $items
  review = [pscustomobject]@{
    reviewDate = $ReviewDate
    title = "Daily Review | $ReviewDate"
    durationMinutes = "8-12"
    level = "B1"
    contentMarkdown = ($mdLines -join [Environment]::NewLine)
    audioCards = $audioCards
    itemKeys = $itemKeys
  }
}

Write-Host "Selected $($items.Count) due items for $ReviewDate :" -ForegroundColor Cyan
foreach ($c in $audioCards) { Write-Host ("  - " + $c.normal) }

if (-not $Push) {
  Write-Host "`nDry run only. Re-run with -Push to send to production." -ForegroundColor Yellow
  return
}

$json = $payload | ConvertTo-Json -Depth 8 -Compress
$bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
$resp = Invoke-RestMethod -Uri "$ApiBase/api/worker/push" -Method Post -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json; charset=utf-8" -Body $bytes -TimeoutSec $TimeoutSec
$resp | ConvertTo-Json -Compress
