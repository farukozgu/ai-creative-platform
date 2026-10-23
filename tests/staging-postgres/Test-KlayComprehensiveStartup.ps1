$ErrorActionPreference = 'Stop'
$suiteDir = $PSScriptRoot
$runner = Join-Path $suiteDir 'Invoke-KlayComprehensiveStaging.ps1'
$windowsPowerShell = Join-Path $PSHOME 'powershell.exe'
if (-not (Test-Path -LiteralPath $windowsPowerShell -PathType Leaf)) { throw "Windows PowerShell 5.1 executable not found: $windowsPowerShell" }
if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) { throw "Comprehensive runner missing: $runner" }

$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('klay-comprehensive-startup-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $tempRoot
$successDir = Join-Path $tempRoot 'explicit-report-dir'
$blocker = Join-Path $tempRoot 'report-path-is-a-file'
$fallbackRoot = Join-Path ([IO.Path]::GetTempPath()) 'klay-ai-phase7f16-reports'
$beforeReports = @()
if (Test-Path -LiteralPath $fallbackRoot -PathType Container) { $beforeReports = @(Get-ChildItem -LiteralPath $fallbackRoot -Filter 'phase-7f16-*.json' -File | Select-Object -ExpandProperty FullName) }

try {
  # A genuine child powershell.exe process proves parameter binding and body startup work in PS 5.1.
  $successOutput = @(& $windowsPowerShell -NoProfile -ExecutionPolicy Bypass -File $runner -LocalStartupSmoke -ReportDirectory $successDir 2>&1 | ForEach-Object { [string]$_ })
  $successCode = $LASTEXITCODE
  if ($successCode -ne 0) { throw "Child-process startup smoke failed (exit $successCode): $($successOutput -join ' | ')" }
  if (@($successOutput | Where-Object { $_ -ceq 'KLAY_COMPREHENSIVE_STARTUP_PASS' }).Count -ne 1) { throw "Startup success marker missing or duplicated: $($successOutput -join ' | ')" }
  if (-not (Test-Path -LiteralPath $successDir -PathType Container)) { throw 'Explicit report directory was not created.' }
  if (@(Get-ChildItem -LiteralPath $successDir -Force).Count -ne 0) { throw 'Startup smoke unexpectedly wrote report artifacts.' }

  # Exercise default ReportDirectory in a fresh process, with no database credentials or staging prerequisites.
  $defaultDir = Join-Path $suiteDir 'reports'
  $hadDefaultDir = Test-Path -LiteralPath $defaultDir
  $defaultOutput = @(& $windowsPowerShell -NoProfile -ExecutionPolicy Bypass -File $runner -LocalStartupSmoke 2>&1 | ForEach-Object { [string]$_ })
  $defaultCode = $LASTEXITCODE
  if ($defaultCode -ne 0 -or @($defaultOutput | Where-Object { $_ -ceq 'KLAY_COMPREHENSIVE_STARTUP_PASS' }).Count -ne 1) { throw "Default-path child startup failed (exit $defaultCode): $($defaultOutput -join ' | ')" }
  if (-not (Test-Path -LiteralPath $defaultDir -PathType Container)) { throw 'Default report directory was not created from the actual script location.' }
  if (-not $hadDefaultDir) { Remove-Item -LiteralPath $defaultDir -Force }

  # A file at the requested report path deterministically simulates an unwritable destination.
  Set-Content -LiteralPath $blocker -Value 'file blocks directory creation' -Encoding ASCII
  $failureOutput = @(& $windowsPowerShell -NoProfile -ExecutionPolicy Bypass -File $runner -ReportDirectory $blocker 2>&1 | ForEach-Object { [string]$_ })
  $failureCode = $LASTEXITCODE
  if ($failureCode -eq 0) { throw 'Unwritable report destination did not fail closed.' }
  if (-not (Test-Path -LiteralPath $fallbackRoot -PathType Container)) { throw 'Fallback report directory was not initialized for startup failure reporting.' }
  $newReports = @(Get-ChildItem -LiteralPath $fallbackRoot -Filter 'phase-7f16-*.json' -File | Where-Object { $beforeReports -notcontains $_.FullName } | Sort-Object LastWriteTimeUtc -Descending)
  if ($newReports.Count -ne 1) { throw "Expected one failure report after unwritable destination; found $($newReports.Count). Output: $($failureOutput -join ' | ')" }
  $failureReport = Get-Content -LiteralPath $newReports[0].FullName -Raw | ConvertFrom-Json
  if ($failureReport.overall -cne 'BLOCKED' -or $failureReport.remote_tests_executed -ne $false) { throw 'Startup failure report was not BLOCKED or claimed remote database execution.' }
  if (-not $failureReport.startup_failure -or $failureReport.report_directory_requested -cne $blocker) { throw 'Failure report omitted the requested directory startup error.' }
  if ($failureReport.groups.Count -lt 1 -or @($failureReport.groups | Where-Object { $_.name -eq 'storage_authenticated_api' -and $_.status -eq 'BLOCKED' }).Count -ne 1) { throw 'Failure report did not include blocked required groups.' }
  if ($failureOutput -match '(?i)password|credential prompt|database password') { throw 'Startup failure requested credentials before reporting its local startup error.' }

  Write-Host 'PASS: PowerShell 5.1 process startup, explicit/default report directory creation, unwritable destination failure report, and pre-credential fail-closed behavior.'
}
finally {
  # Remove only this test's uniquely named temporary tree after verifying containment.
  $resolvedTempRoot = [IO.Path]::GetFullPath($tempRoot).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  $systemTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  if ($resolvedTempRoot.StartsWith($systemTemp, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $tempRoot -PathType Container)) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
}
