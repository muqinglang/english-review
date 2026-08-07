$ErrorActionPreference = 'Stop'
$reviewRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8765
$today = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId((Get-Date), 'China Standard Time').ToString('yyyy-MM-dd')

try {
  Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$port/listen.html" -TimeoutSec 1 | Out-Null
} catch {
  Start-Process -FilePath python -ArgumentList '-m', 'http.server', $port, '--directory', $reviewRoot -WindowStyle Hidden
  Start-Sleep -Milliseconds 700
}
Start-Process "http://127.0.0.1:$port/listen.html?date=$today"
