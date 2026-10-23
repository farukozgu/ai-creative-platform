param([Parameter(Mandatory=$true)][string] $PsqlPath)

$ErrorActionPreference = 'Stop'
$stagingRoot = 'C:\klay-ai-staging-tests'
$expectedRef = 'gklpgcyndeghjgemoonk'
$expectedUser = "postgres.$expectedRef"
$expectedHost = 'aws-0-eu-west-1.pooler.supabase.com'
$expectedPort = 5432
$nativeHelper = Join-Path $PSScriptRoot 'Invoke-KlayNativeCommand.ps1'
$null = . $nativeHelper
$linkedRefPath = Join-Path $stagingRoot 'supabase\.temp\project-ref'
$poolerUrlPath = Join-Path $stagingRoot 'supabase\.temp\pooler-url'
$jobs = @()
$fixtureCreated = $false

function Start-SqlJob([string] $Name, [string] $SqlFile, [string] $ApplicationName) {
  Start-Job -Name $Name -ScriptBlock {
    param($DbClient, $File, $AppName, $HelperPath)
    . $HelperPath
    $env:PGAPPNAME = $AppName
    $result = Invoke-KlayNativeCommand -FilePath $DbClient -ArgumentList @('-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', $File)
    [pscustomobject]@{ ExitCode=$result.ExitCode; Output=($result.Output -join "`n") }
  } -ArgumentList $PsqlPath, $SqlFile, $ApplicationName, $nativeHelper
}

function Wait-Activity([string] $Sql, [int] $Minimum, [int] $TimeoutSeconds, [string] $Label) {
  $until = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while ([DateTime]::UtcNow -lt $until) {
    $result = Invoke-KlayNativeCommand -FilePath $PsqlPath -ArgumentList @('-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', $Sql)
    if ($result.ExitCode -ne 0) { throw "Could not observe PostgreSQL test activity (psql exit $($result.ExitCode)): $Label`n$($result.Output -join "`n")" }
    $count = 0
    if ($result.Output.Count -gt 0) { [void][int]::TryParse(($result.Output[-1].Trim()), [ref]$count) }
    if ($count -ge $Minimum) { return }
    Start-Sleep -Milliseconds 150
  }
  throw "Timed out waiting for PostgreSQL sessions: $Label"
}

function Receive-SqlJob($Job) {
  $null = Wait-Job -Job $Job -Timeout 30
  if ($Job.State -ne 'Completed') {
    Stop-Job -Job $Job -ErrorAction SilentlyContinue
    throw "Concurrent PostgreSQL session timed out: $($Job.Name)"
  }
  $items = @(Receive-Job -Job $Job)
  if ($items.Count -ne 1 -or $items[0].ExitCode -ne 0) {
    $detail = if ($items.Count) { $items[0].Output } else { 'no process result' }
    throw "Concurrent PostgreSQL session failed: $($Job.Name). $detail"
  }
  return $items[0].Output.Trim()
}

Push-Location -LiteralPath $stagingRoot
try {
  if ((Get-Location).Path -ne $stagingRoot) { throw 'Concurrency harness must run from the staging CLI directory.' }
  if ((Get-Content -LiteralPath $linkedRefPath -Raw).Trim() -ne $expectedRef) { throw 'Staging ref mismatch; refusing concurrency harness.' }
  $poolerUri = [uri](Get-Content -LiteralPath $poolerUrlPath -Raw).Trim()
  $metadataUser = [uri]::UnescapeDataString(($poolerUri.UserInfo -split ':', 2)[0])
  if ($poolerUri.Host -ne $expectedHost -or $poolerUri.Port -ne $expectedPort -or
      $metadataUser -ne $expectedUser -or $env:PGUSER -ne $expectedUser -or $env:PGHOST -ne $expectedHost) {
    throw 'Staging pooler host/user preflight mismatch; refusing concurrency harness.'
  }
  if (-not $env:PGPASSWORD) { throw 'Staging password is not present in the parent runner environment.' }
  if (-not (Test-Path -LiteralPath $PsqlPath -PathType Leaf)) { throw 'psql path is unavailable.' }

  $setupResult = Invoke-KlayNativeCommand -FilePath $PsqlPath -ArgumentList @('-X', '-v', 'ON_ERROR_STOP=1', '-f', (Join-Path $PSScriptRoot 'concurrency-setup.sql'))
  Write-KlayNativeOutput -Result $setupResult
  if ($setupResult.ExitCode -ne 0) { throw "Concurrency fixture setup failed (psql exit $($setupResult.ExitCode))." }
  $fixtureCreated = $true

  $lockHolder = Start-SqlJob 'klay-edit-lock' (Join-Path $PSScriptRoot 'concurrency-edit-lock-holder.sql') 'klay-7f5-edit-lock'
  $jobs += $lockHolder
  Wait-Activity "SELECT count(*) FROM pg_stat_activity WHERE application_name='klay-7f5-edit-lock' AND state='active' AND wait_event='PgSleep'" 1 10 'image-edit advisory-lock holder'

  $editSpecs = @(
    @{ Name='klay-edit-1'; File='concurrency-edit-1.sql'; App='klay-7f5-edit-1' },
    @{ Name='klay-edit-2'; File='concurrency-edit-2.sql'; App='klay-7f5-edit-2' },
    @{ Name='klay-edit-3'; File='concurrency-edit-3.sql'; App='klay-7f5-edit-3' }
  )
  $editJobs = @()
  foreach ($spec in $editSpecs) {
    $job = Start-SqlJob $spec.Name (Join-Path $PSScriptRoot $spec.File) $spec.App
    $editJobs += $job
    $jobs += $job
  }
  Wait-Activity "SELECT count(*) FROM pg_stat_activity WHERE application_name LIKE 'klay-7f5-edit-%' AND wait_event_type='Lock' AND wait_event='advisory'" 3 10 'three concurrent image-edit RPC sessions waiting on the per-owner lock'
  $editOutcomes = @($editJobs | ForEach-Object { Receive-SqlJob $_ })
  $null = Receive-SqlJob $lockHolder
  if (@($editOutcomes | Where-Object { $_ -eq 'admitted' }).Count -ne 2 -or @($editOutcomes | Where-Object { $_ -eq 'capacity' }).Count -ne 1) {
    throw "ASSERTION FAILED: concurrent image edit outcomes were unexpected: $($editOutcomes -join ',')"
  }
  Write-Host 'PASS: three concurrent service_role image-edit RPCs yielded exactly two admitted and one capacity.'

  $candidateHolder = Start-SqlJob 'klay-candidate-holder' (Join-Path $PSScriptRoot 'concurrency-candidate-holder.sql') 'klay-7f5-candidate-holder'
  $jobs += $candidateHolder
  Wait-Activity "SELECT count(*) FROM pg_stat_activity WHERE application_name='klay-7f5-candidate-holder' AND state='active' AND wait_event='PgSleep'" 1 10 'candidate row-lock holder'
  $candidateContender = Start-SqlJob 'klay-candidate-contender' (Join-Path $PSScriptRoot 'concurrency-candidate-contender.sql') 'klay-7f5-candidate-contender'
  $jobs += $candidateContender
  $contenderId = Receive-SqlJob $candidateContender
  $holderId = Receive-SqlJob $candidateHolder
  if ($contenderId -ne 'f7f50000-0000-4000-8000-000000000907' -or $holderId -ne 'f7f50000-0000-4000-8000-000000000906') {
    throw "ASSERTION FAILED: SKIP LOCKED did not assign distinct expected candidate jobs (holder=$holderId, contender=$contenderId)."
  }
  Write-Host 'PASS: concurrent candidate claim skipped a held row and assigned distinct jobs.'
}
finally {
  try {
    if ($jobs) {
      $null = Wait-Job -Job $jobs -Timeout 30
      $jobs | Where-Object State -eq 'Running' | Stop-Job -ErrorAction SilentlyContinue
      $jobs | Remove-Job -Force -ErrorAction SilentlyContinue
    }
    if ($fixtureCreated) {
      $cleanupResult = Invoke-KlayNativeCommand -FilePath $PsqlPath -ArgumentList @('-X', '-v', 'ON_ERROR_STOP=1', '-f', (Join-Path $PSScriptRoot 'concurrency-cleanup.sql'))
      Write-KlayNativeOutput -Result $cleanupResult
      if ($cleanupResult.ExitCode -ne 0) { throw 'Exact synthetic concurrency fixture cleanup failed; manually inspect the exact marked fixture before cleanup.' }
    }
  }
  finally { Pop-Location }
}
