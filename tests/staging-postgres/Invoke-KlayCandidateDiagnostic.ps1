function Invoke-KlayCandidateDiagnostic {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string] $PsqlPath,
    [Parameter(Mandatory = $true)][string] $SuiteDir
  )

  # Called only after the main runner's complete isolation/history/password gates.
  # This fixed list cannot include any broader group or the concurrency harness.
  $steps = @(
    @{ File = 'preflight.sql'; Marker = 'KLAY_MIGRATION_PREFLIGHT_PASS' },
    @{ File = 'fixture-residue-audit.sql'; Marker = 'KLAY_FIXTURE_RESIDUE_AUDIT_PASS' },
    @{ File = 'candidate-ownership-regression.sql'; Marker = 'KLAY_CANDIDATE_OWNERSHIP_REGRESSION_PASS' }
  )
  foreach ($step in $steps) {
    if (-not (Test-Path -LiteralPath (Join-Path $SuiteDir $step.File) -PathType Leaf)) {
      throw "Diagnostic SQL file is missing: $($step.File)"
    }
  }
  foreach ($step in $steps) {
    Write-Host "START: $($step.File)"
    $result = Invoke-KlayNativeCommand -FilePath $PsqlPath -ArgumentList @(
      '-X', '-v', 'ON_ERROR_STOP=1', '-f', (Join-Path $SuiteDir $step.File)
    )
    Write-KlayNativeOutput -Result $result
    $lines = @($result.Output | ForEach-Object { $_.Trim() })
    if ($result.ExitCode -ne 0 -or
        @($lines | Where-Object { $_ -ceq $step.Marker }).Count -ne 1 -or
        @($lines | Where-Object { $_ -match 'ASSERTION FAILED' }).Count -ne 0) {
      throw "DIAGNOSTIC FAIL: $($step.File) (psql exit $($result.ExitCode)); a successful rollback and assertion completion marker are required."
    }
    Write-Host "GROUP PASS: $($step.File)"
  }
  Write-Host 'CANDIDATE OWNERSHIP DIAGNOSTIC PASS: all three groups completed; regression rolled back.'
}
