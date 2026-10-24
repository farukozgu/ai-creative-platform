# Offline-safe HTTP smoke: never activate a worker or reach Supabase/provider.
$ErrorActionPreference = 'Stop'
$smokeRoot = Split-Path -Parent $PSScriptRoot
$smokeFlag = $env:IMAGE_GENERATION_WORKER_ENABLED
$smokeSecret = $env:IMAGE_GENERATION_WORKER_SECRET
$smokeProcess = $null
$smokeOut = Join-Path ([IO.Path]::GetTempPath()) ('klay-smoke-' + [Guid]::NewGuid().ToString('N') + '.out')
$smokeErr = $smokeOut + '.err'
try {
  if ($PSVersionTable.PSVersion.Major -ne 5) { throw 'Run using Windows PowerShell 5.1.' }
  if (netstat.exe -ano -p tcp | Select-String '127\.0\.0\.1:3108\s+.*LISTENING') { throw 'Smoke port already occupied.' }
  $env:IMAGE_GENERATION_WORKER_ENABLED = 'false'
  $env:IMAGE_GENERATION_WORKER_SECRET = [Guid]::NewGuid().ToString('N')
  $smokeProcess = Start-Process -FilePath 'node.exe' -ArgumentList @(
    'node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3108'
  ) -WorkingDirectory $smokeRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $smokeOut -RedirectStandardError $smokeErr
  function Get-SmokeStatus([string]$Path, [string]$Token) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Method Post -Uri ('http://127.0.0.1:3108' + $Path) `
        -Headers @{Authorization = "Bearer $Token"} -ContentType 'application/json' -Body '{}' -TimeoutSec 5
      return [int]$response.StatusCode
    } catch {
      if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
      return 0
    }
  }
  $smokeStatus = 0
  for ($smokeTry = 0; $smokeTry -lt 45; $smokeTry++) {
    $smokeStatus = Get-SmokeStatus '/api/internal/local-image-generation-worker' 'invalid'
    if ($smokeStatus -eq 403) { break }
    Start-Sleep -Seconds 1
  }
  if ($smokeStatus -ne 403) { throw 'Local endpoint did not reject unauthorized request.' }
  if ((Get-SmokeStatus '/api/internal/local-image-generation-worker' $env:IMAGE_GENERATION_WORKER_SECRET) -ne 503) {
    throw 'Local endpoint did not preserve disabled worker gate.'
  }
  if ((Get-SmokeStatus '/api/internal/image-generation-worker' $env:IMAGE_GENERATION_WORKER_SECRET) -ne 409) {
    throw 'Local batch worker was not blocked.'
  }
  Write-Output 'PASS: PowerShell 5.1 startup; unauthorized 403; disabled 503; batch 409. No worker activation.'
} finally {
  if ($smokeProcess) {
    # Next dev forks a server. Stop only our fresh node listener and launcher;
    # Stop-Process also works where taskkill tree enumeration is restricted.
    $smokeListener = netstat.exe -ano -p tcp | Select-String '127\.0\.0\.1:3108\s+.*LISTENING'
    foreach ($smokeLine in $smokeListener) {
      $smokeListenerId = [int](($smokeLine.ToString().Trim() -split '\s+')[-1])
      $smokeChild = Get-Process -Id $smokeListenerId -ErrorAction SilentlyContinue
      if ($smokeChild -and $smokeChild.ProcessName -eq 'node' -and $smokeChild.StartTime -ge $smokeProcess.StartTime) {
        Stop-Process -Id $smokeListenerId -ErrorAction SilentlyContinue
      }
    }
    if (-not $smokeProcess.HasExited) { Stop-Process -Id $smokeProcess.Id -ErrorAction SilentlyContinue }
  }
  $env:IMAGE_GENERATION_WORKER_ENABLED = $smokeFlag
  $env:IMAGE_GENERATION_WORKER_SECRET = $smokeSecret
  Remove-Item -LiteralPath $smokeOut,$smokeErr -ErrorAction SilentlyContinue
}
