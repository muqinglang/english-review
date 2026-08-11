param(
  [string]$InboxDirectory = (Join-Path $PSScriptRoot "..\inbox"),
  [string]$DefaultSpace = "English Review",
  [string]$TokenFile = (Join-Path $PSScriptRoot ".worker-token.clixml"),
  [string]$ApiBase = "https://english-review-three.vercel.app",
  [int]$TimeoutSec = 30
)

$allowedTypes = @("fact", "concept", "decision", "quote", "vocabulary", "expression", "error", "pronunciation")
$allowedPriorities = @("high", "medium", "low")

function Get-StableCaptureKey {
  param(
    [Parameter(Mandatory = $true)][string]$Type,
    [Parameter(Mandatory = $true)][string]$Cue
  )

  $normalizedCue = (($Cue.Trim().ToLowerInvariant() -replace '\s+', ' ') -replace '[\u0000-\u001f]', '')
  $bytes = [Text.Encoding]::UTF8.GetBytes("$Type`n$normalizedCue")
  $hash = [Security.Cryptography.SHA256]::Create()
  try {
    $digest = $hash.ComputeHash($bytes)
  }
  finally {
    $hash.Dispose()
  }
  $hex = -join ($digest | ForEach-Object { $_.ToString("x2") })
  return "capture:${Type}:$($hex.Substring(0, 24))"
}

function Read-IsoDate {
  param(
    [Parameter(Mandatory = $true)][string]$Value,
    [Parameter(Mandatory = $true)][string]$FieldName
  )

  try {
    return [DateTime]::ParseExact(
      $Value,
      "yyyy-MM-dd",
      [Globalization.CultureInfo]::InvariantCulture,
      [Globalization.DateTimeStyles]::None
    )
  }
  catch {
    throw "$FieldName must be a real date in YYYY-MM-DD format: '$Value'."
  }
}

if (-not (Test-Path -LiteralPath $InboxDirectory)) {
  New-Item -ItemType Directory -Path $InboxDirectory | Out-Null
}
$inboxPath = (Resolve-Path -LiteralPath $InboxDirectory).Path
$processedPath = Join-Path $inboxPath "processed"
if (-not (Test-Path -LiteralPath $processedPath)) {
  New-Item -ItemType Directory -Path $processedPath | Out-Null
}
$processedPath = (Resolve-Path -LiteralPath $processedPath).Path
if (-not $processedPath.StartsWith($inboxPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "The processed directory must stay inside the inbox directory."
}

$files = @(Get-ChildItem -LiteralPath $inboxPath -File -Filter "*.json" | Sort-Object Name)
if ($files.Count -eq 0) {
  [pscustomobject]@{
    ok = $true
    receivedCount = 0
    processedFiles = 0
    knowledgeSpaces = @()
  }
  return
}

$acceptedTotal = 0
$processedFiles = 0
$spaces = @{}
foreach ($file in $files) {
  Write-Verbose "Validating inbox file '$($file.Name)'."
  try {
    $document = Get-Content -Raw -Encoding UTF8 -LiteralPath $file.FullName | ConvertFrom-Json
  }
  catch {
    throw "Inbox file '$($file.Name)' is not valid UTF-8 JSON: $($_.Exception.Message)"
  }

  if ([int]$document.version -ne 1) {
    throw "Inbox file '$($file.Name)' must use version 1."
  }
  $space = ([string]$document.space).Trim()
  if ([string]::IsNullOrWhiteSpace($space)) { $space = $DefaultSpace }
  if ($space.Length -gt 80) {
    throw "Inbox file '$($file.Name)' has a knowledge-space name longer than 80 characters."
  }
  $capturedOn = ([string]$document.capturedOn).Trim()
  $capturedDate = Read-IsoDate -Value $capturedOn -FieldName "capturedOn"
  $shanghaiZone = [TimeZoneInfo]::FindSystemTimeZoneById("China Standard Time")
  $todayInShanghai = [TimeZoneInfo]::ConvertTime([DateTimeOffset]::UtcNow, $shanghaiZone).Date
  if ($capturedDate.Date -gt $todayInShanghai) {
    throw "Inbox file '$($file.Name)' has a future capturedOn date '$capturedOn'."
  }
  $dueDate = $capturedDate.AddDays(1).ToString("yyyy-MM-dd")
  $sourceItems = @($document.items)
  if ($sourceItems.Count -eq 0 -or $sourceItems.Count -gt 100) {
    throw "Inbox file '$($file.Name)' must contain between 1 and 100 items."
  }

  $seenKeys = @{}
  $items = @()
  foreach ($sourceItem in $sourceItems) {
    $type = ([string]$sourceItem.type).Trim()
    $cue = ([string]$sourceItem.cue).Trim()
    $answer = ([string]$sourceItem.answer).Trim()
    $example = ([string]$sourceItem.example).Trim()
    $priority = ([string]$sourceItem.priority).Trim()
    if (-not $priority) { $priority = "medium" }
    if ($allowedTypes -notcontains $type) {
      throw "Inbox file '$($file.Name)' contains unsupported type '$type'."
    }
    if ($allowedPriorities -notcontains $priority) {
      throw "Inbox file '$($file.Name)' contains unsupported priority '$priority'."
    }
    if ([string]::IsNullOrWhiteSpace($cue) -or [string]::IsNullOrWhiteSpace($answer)) {
      throw "Every item in '$($file.Name)' must contain non-empty cue and answer fields."
    }
    if ($cue.Length -gt 20000 -or $answer.Length -gt 50000 -or $example.Length -gt 20000) {
      throw "An item in '$($file.Name)' exceeds the supported text length."
    }
    $normalizedKey = ([string]$sourceItem.normalizedKey).Trim()
    if ([string]::IsNullOrWhiteSpace($normalizedKey)) {
      $normalizedKey = Get-StableCaptureKey -Type $type -Cue $cue
    }
    if ($normalizedKey.Length -lt 2 -or $normalizedKey.Length -gt 160 -or $normalizedKey -match '[\u0000-\u001f\u007f]') {
      throw "An item in '$($file.Name)' has an invalid normalizedKey; use 2-160 characters without control characters."
    }
    if ($seenKeys.ContainsKey($normalizedKey)) {
      throw "Inbox file '$($file.Name)' contains duplicate normalizedKey '$normalizedKey'."
    }
    $seenKeys[$normalizedKey] = $true

    $occurrences = 1
    if ($null -ne $sourceItem.occurrences) {
      try { $occurrences = [int]$sourceItem.occurrences } catch { $occurrences = 0 }
    }
    if ($occurrences -lt 1 -or $occurrences -gt 1000000) {
      throw "An item in '$($file.Name)' has an invalid occurrences value."
    }
    $items += [pscustomobject]@{
      normalizedKey = $normalizedKey
      type = $type
      cue = $cue
      answer = $answer
      example = $(if ($example) { $example } else { $null })
      priority = $priority
      occurrences = $occurrences
      dueDate = $dueDate
      learnedOn = $capturedOn
    }
  }

  $payload = [pscustomobject]@{
    space = $space
    items = $items
  }
  $payloadPath = Join-Path ([IO.Path]::GetTempPath()) "chat-review-inbox-$([guid]::NewGuid().ToString('N')).json"
  try {
    $payload | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 -LiteralPath $payloadPath
    $response = & (Join-Path $PSScriptRoot "push-items.ps1") `
      -ItemsFile $payloadPath `
      -TokenFile $TokenFile `
      -ApiBase $ApiBase `
      -TimeoutSec $TimeoutSec `
      -Verbose:($VerbosePreference -ne "SilentlyContinue")
    if (-not $response.ok -or [int]$response.accepted -ne $items.Count) {
      throw "The Worker API accepted $($response.accepted) of $($items.Count) inbox items."
    }
    if ([string]$response.knowledgeSpace -ne $space) {
      throw "The Worker API returned an unexpected knowledge space '$($response.knowledgeSpace)'."
    }
  }
  finally {
    if (Test-Path -LiteralPath $payloadPath) {
      Remove-Item -LiteralPath $payloadPath -Force
    }
  }

  $destination = Join-Path $processedPath $file.Name
  if (Test-Path -LiteralPath $destination) {
    $destination = Join-Path $processedPath ("{0}-{1}{2}" -f $file.BaseName, [DateTime]::UtcNow.ToString("yyyyMMddHHmmssfff"), $file.Extension)
  }
  Move-Item -LiteralPath $file.FullName -Destination $destination
  Write-Verbose "Imported $($items.Count) item(s) from '$($file.Name)' and archived the file."
  $acceptedTotal += $items.Count
  $processedFiles++
  $spaces[$space] = $true
}

[pscustomobject]@{
  ok = $true
  receivedCount = $acceptedTotal
  processedFiles = $processedFiles
  knowledgeSpaces = @($spaces.Keys | Sort-Object)
}
