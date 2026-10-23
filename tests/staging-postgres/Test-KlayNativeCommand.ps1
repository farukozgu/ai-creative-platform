$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Invoke-KlayNativeCommand.ps1')

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("klay-native-test-" + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $tempRoot
try {
  $progressCommand = Join-Path $tempRoot 'stderr-progress.cmd'
  @'
@echo off
echo Initialising login role... 1>&2
exit /b 0
'@ | Set-Content -LiteralPath $progressCommand -Encoding ASCII

  $failureCommand = Join-Path $tempRoot 'stderr-failure.cmd'
  @'
@echo off
echo simulated CLI failure 1>&2
exit /b 17
'@ | Set-Content -LiteralPath $failureCommand -Encoding ASCII

  $originalPreference = $ErrorActionPreference
  $progress = Invoke-KlayNativeCommand -FilePath $progressCommand -ArgumentList @()
  if ($progress.ExitCode -ne 0) { throw "Expected stderr-only progress to exit 0; got $($progress.ExitCode)." }
  if (-not (@($progress.Output | ForEach-Object { $_.Trim() }) -contains 'Initialising login role...')) { throw 'stderr-only progress text was not retained.' }
  if ($ErrorActionPreference -ne $originalPreference) { throw 'ErrorActionPreference was not restored after success.' }
  Write-Host 'PASS: stderr-only progress is retained and exit code 0 succeeds under ErrorActionPreference=Stop.'

  $failure = Invoke-KlayNativeCommand -FilePath $failureCommand -ArgumentList @()
  if ($failure.ExitCode -ne 17) { throw "Expected simulated CLI failure exit 17; got $($failure.ExitCode)." }
  if (-not (@($failure.Output | ForEach-Object { $_.Trim() }) -contains 'simulated CLI failure')) { throw 'failure stderr text was not retained.' }
  if ($ErrorActionPreference -ne $originalPreference) { throw 'ErrorActionPreference was not restored after failure.' }
  Write-Host 'PASS: nonzero native exit 17 remains a failure and stderr is retained.'
}
finally {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
