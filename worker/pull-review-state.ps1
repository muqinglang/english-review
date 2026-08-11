param(
  [string]$Space = "English Review",
  [string]$LedgerFile = (Join-Path $PSScriptRoot "..\ledger.json"),
  [string]$ApiBase = "https://english-review-three.vercel.app",
  [string]$TokenFile = (Join-Path $PSScriptRoot ".worker-token.clixml"),
  [int]$TimeoutSec = 30
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

function Set-LedgerProperty {
  param(
    [Parameter(Mandatory = $true)][object]$Item,
    [Parameter(Mandatory = $true)][string]$Name,
    $Value
  )

  if ($Item.PSObject.Properties.Name -contains $Name) {
    $Item.$Name = $Value
  }
  else {
    $Item | Add-Member -NotePropertyName $Name -NotePropertyValue $Value
  }
}

function New-StableLedgerId {
  param(
    [Parameter(Mandatory = $true)][object]$CloudItem,
    [Parameter(Mandatory = $true)][hashtable]$ReservedIds
  )

  $cloudId = ([string]$CloudItem.id).Trim()
  $parsedId = [guid]::Empty
  if (-not [guid]::TryParse($cloudId, [ref]$parsedId)) {
    throw "Worker context returned an invalid learning-item id: '$cloudId'."
  }

  $candidate = "web-$($parsedId.ToString())"
  if ($ReservedIds.ContainsKey($candidate)) {
    throw "Stable local id collision for cloud learning item '$cloudId': '$candidate'."
  }
  return $candidate
}

if (-not (Test-Path -LiteralPath $TokenFile)) {
  throw "Worker token is not configured. Run worker/configure-token.ps1 first."
}
$secureToken = Import-Clixml -LiteralPath $TokenFile
if ($secureToken -isnot [Security.SecureString]) {
  throw "The Worker token file is invalid. Run worker/configure-token.ps1 again."
}
$token = ConvertFrom-WorkerSecureString -SecureValue $secureToken
$ledgerPath = (Resolve-Path -LiteralPath $LedgerFile).Path
$encodedSpace = [Uri]::EscapeDataString($Space)
$uri = "$ApiBase/api/worker/context?space=$encodedSpace"

try {
  Write-Verbose "Pulling cloud review state for '$Space'."
  $response = Invoke-RestMethod -Method Get -Uri $uri -Headers @{ Authorization = "Bearer $token" } -TimeoutSec $TimeoutSec -ErrorAction Stop
}
catch [Net.WebException] {
  $responseBody = ""
  if ($_.Exception.Response) {
    $reader = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
    try { $responseBody = $reader.ReadToEnd() } finally { $reader.Dispose() }
  }
  throw "Worker context request failed: $responseBody"
}
finally {
  $token = $null
  $secureToken = $null
}

if (-not $response.ok -or -not $response.schedule) {
  throw "Worker context response did not include a schedule."
}
$responseSpaceName = if ($response.knowledgeSpace -is [string]) {
  [string]$response.knowledgeSpace
}
else {
  [string]$response.knowledgeSpace.name
}
if ($responseSpaceName -ne $Space) {
  throw "Worker context returned an unexpected knowledge space: '$responseSpaceName'."
}
$cloudItems = @($response.schedule.due) + @($response.schedule.upcoming) + @($response.schedule.deferred)
$cloudByKey = @{}
foreach ($cloudItem in $cloudItems) {
  $key = ([string]$cloudItem.normalizedKey).Trim()
  if ([string]::IsNullOrWhiteSpace($key)) {
    throw "Worker context returned an item without normalizedKey."
  }
  if ($cloudByKey.ContainsKey($key)) {
    throw "Worker context returned duplicate normalizedKey '$key'."
  }
  $cloudByKey[$key] = $cloudItem
}

$ledger = Get-Content -Raw -Encoding UTF8 -LiteralPath $ledgerPath | ConvertFrom-Json
if (-not ($ledger.PSObject.Properties.Name -contains "items")) {
  throw "The ledger does not contain an items array: $ledgerPath"
}

$merged = 0
$inserted = 0
$shanghaiZone = [TimeZoneInfo]::FindSystemTimeZoneById("China Standard Time")
$localByKey = @{}
$reservedIds = @{}
foreach ($ledgerItem in @($ledger.items)) {
  $key = ([string]$ledgerItem.normalized_key).Trim()
  $localId = ([string]$ledgerItem.id).Trim()
  if ([string]::IsNullOrWhiteSpace($key) -or [string]::IsNullOrWhiteSpace($localId)) {
    throw "Every local ledger item must contain non-empty id and normalized_key fields."
  }
  if ($localByKey.ContainsKey($key)) {
    throw "The local ledger contains duplicate normalized_key '$key'."
  }
  if ($reservedIds.ContainsKey($localId)) {
    throw "The local ledger contains duplicate id '$localId'."
  }
  $localByKey[$key] = $ledgerItem
  $reservedIds[$localId] = $true
}

foreach ($cloudItem in $cloudItems) {
  $key = ([string]$cloudItem.normalizedKey).Trim()
  $cloudLearnedOn = ([string]$cloudItem.learnedOn).Trim()
  $cloudNextDue = ([string]$cloudItem.nextDue).Trim()
  if ($cloudLearnedOn -notmatch '^\d{4}-\d{2}-\d{2}$' -or
      $cloudNextDue -notmatch '^\d{4}-\d{2}-\d{2}$') {
    throw "Worker context returned invalid learnedOn or nextDue for '$key'."
  }
  if ($localByKey.ContainsKey($key)) {
    $ledgerItem = $localByKey[$key]
    $existingCloudId = if ($ledgerItem.PSObject.Properties.Name -contains "cloud_learning_item_id") {
      ([string]$ledgerItem.cloud_learning_item_id).Trim()
    }
    else { "" }
    if (-not $existingCloudId) {
      Set-LedgerProperty -Item $ledgerItem -Name "cloud_learning_item_id" -Value ([string]$cloudItem.id).Trim()
    }
    if (-not ($ledgerItem.PSObject.Properties.Name -contains "learned_on") -or
        [string]::IsNullOrWhiteSpace([string]$ledgerItem.learned_on)) {
      Set-LedgerProperty -Item $ledgerItem -Name "learned_on" -Value ([string]$cloudItem.learnedOn).Trim()
    }
    $localSourceKind = if ($ledgerItem.PSObject.Properties.Name -contains "source_kind") {
      ([string]$ledgerItem.source_kind).Trim()
    }
    else { "" }
    $isWebCapture = $localSourceKind -eq "web_capture" -or ([string]$ledgerItem.id).StartsWith("web-", [StringComparison]::OrdinalIgnoreCase)
    if ($isWebCapture) {
      $cloudType = ([string]$cloudItem.type).Trim()
      $cloudCue = ([string]$cloudItem.cue).Trim()
      $cloudAnswer = ([string]$cloudItem.answer).Trim()
      $cloudPriority = ([string]$cloudItem.priority).Trim()
      $cloudOccurrences = [int]$cloudItem.occurrences
      if ([string]::IsNullOrWhiteSpace($cloudType) -or
          [string]::IsNullOrWhiteSpace($cloudCue) -or
          [string]::IsNullOrWhiteSpace($cloudAnswer) -or
          $cloudPriority -notin @("high", "medium", "low") -or
          $cloudOccurrences -lt 1) {
        throw "Worker context returned incomplete content for web-captured learning item '$key'."
      }
      Set-LedgerProperty -Item $ledgerItem -Name "source_kind" -Value "web_capture"
      Set-LedgerProperty -Item $ledgerItem -Name "type" -Value $cloudType
      Set-LedgerProperty -Item $ledgerItem -Name "cue" -Value $cloudCue
      Set-LedgerProperty -Item $ledgerItem -Name "answer" -Value $cloudAnswer
      Set-LedgerProperty -Item $ledgerItem -Name "example" -Value $(if ($null -eq $cloudItem.example) { $null } else { [string]$cloudItem.example })
      Set-LedgerProperty -Item $ledgerItem -Name "priority" -Value $cloudPriority
      Set-LedgerProperty -Item $ledgerItem -Name "occurrences" -Value $cloudOccurrences
    }
  }
  else {
    $cloudType = ([string]$cloudItem.type).Trim()
    $cloudCue = ([string]$cloudItem.cue).Trim()
    $cloudAnswer = ([string]$cloudItem.answer).Trim()
    $cloudPriority = ([string]$cloudItem.priority).Trim()
    $cloudOccurrences = [int]$cloudItem.occurrences
    if ([string]::IsNullOrWhiteSpace($cloudType) -or
        [string]::IsNullOrWhiteSpace($cloudCue) -or
        [string]::IsNullOrWhiteSpace($cloudAnswer) -or
        $cloudPriority -notin @("high", "medium", "low") -or
        $cloudOccurrences -lt 1) {
      throw "Worker context returned incomplete content for new learning item '$key'."
    }

    $localId = New-StableLedgerId -CloudItem $cloudItem -ReservedIds $reservedIds
    $ledgerItem = [pscustomobject][ordered]@{
      id = $localId
      cloud_learning_item_id = ([string]$cloudItem.id).Trim()
      source_kind = "web_capture"
      type = $cloudType
      normalized_key = $key
      cue = $cloudCue
      answer = $cloudAnswer
      example = $(if ($null -eq $cloudItem.example) { $null } else { [string]$cloudItem.example })
      source_chat = "Web capture"
      learned_on = $cloudLearnedOn
      occurrences = $cloudOccurrences
      priority = $cloudPriority
      status = "learning"
      attempts = 0
      correct = 0
      next_due = $cloudNextDue
      last_shown = $null
    }
    $ledger.items = @($ledger.items) + @($ledgerItem)
    $localByKey[$key] = $ledgerItem
    $reservedIds[$localId] = $true
    $inserted++
  }

  $fieldMap = [ordered]@{
    attempts = "attempts"
    correct = "correct"
    next_due = "nextDue"
    status = "status"
    review_stage = "reviewStage"
    correct_streak = "correctStreak"
    last_result = "lastResult"
    last_answered_at = "lastAnsweredAt"
  }
  foreach ($entry in $fieldMap.GetEnumerator()) {
    if ($cloudItem.PSObject.Properties.Name -contains $entry.Value) {
      Set-LedgerProperty -Item $ledgerItem -Name $entry.Key -Value $cloudItem.($entry.Value)
    }
  }

  # last_shown is monotonic. During the one-time migration from local-only
  # reviews, an older/null cloud value must not erase a newer local exposure.
  $localLastShown = ([string]$ledgerItem.last_shown).Trim()
  $cloudLastShown = if ($cloudItem.PSObject.Properties.Name -contains "lastShown") {
    ([string]$cloudItem.lastShown).Trim()
  }
  else { "" }
  $mergedLastShown = if ($localLastShown -and $cloudLastShown) {
    if ($localLastShown -gt $cloudLastShown) { $localLastShown } else { $cloudLastShown }
  }
  elseif ($localLastShown) { $localLastShown }
  else { $cloudLastShown }
  Set-LedgerProperty -Item $ledgerItem -Name "last_shown" -Value $(if ($mergedLastShown) { $mergedLastShown } else { $null })

  $lastAnsweredAt = ([string]$ledgerItem.last_answered_at).Trim()
  $pendingAnswer = $false
  if ($mergedLastShown) {
    if (-not $lastAnsweredAt) {
      $pendingAnswer = $true
    }
    else {
      try {
        $answeredAt = [DateTimeOffset]::Parse($lastAnsweredAt, [Globalization.CultureInfo]::InvariantCulture)
        $answeredDate = [TimeZoneInfo]::ConvertTime($answeredAt, $shanghaiZone).ToString("yyyy-MM-dd")
        $pendingAnswer = $answeredDate -lt $mergedLastShown
      }
      catch {
        throw "Worker context returned an invalid lastAnsweredAt for '$key'."
      }
    }
  }
  Set-LedgerProperty -Item $ledgerItem -Name "pending_answer" -Value $pendingAnswer
  $merged++
}

$json = $ledger | ConvertTo-Json -Depth 20
$directory = Split-Path -Parent $ledgerPath
$temporaryPath = Join-Path $directory ".ledger-$([guid]::NewGuid().ToString('N')).tmp"
try {
  [IO.File]::WriteAllText($temporaryPath, $json + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
  Get-Content -Raw -Encoding UTF8 -LiteralPath $temporaryPath | ConvertFrom-Json | Out-Null
  Move-Item -LiteralPath $temporaryPath -Destination $ledgerPath -Force
}
finally {
  if (Test-Path -LiteralPath $temporaryPath) {
    Remove-Item -LiteralPath $temporaryPath -Force
  }
}

[pscustomobject]@{
  ok = $true
  knowledgeSpace = $responseSpaceName
  today = $response.today
  cloudItems = $cloudItems.Count
  merged = $merged
  inserted = $inserted
}
