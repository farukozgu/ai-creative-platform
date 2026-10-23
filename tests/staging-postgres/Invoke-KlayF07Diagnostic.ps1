function Invoke-KlayF07Diagnostic {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory=$true)][string] $PsqlPath,
    [Parameter(Mandatory=$true)][string] $SuiteDir,
    [Parameter(Mandatory=$true)][ValidateSet('BeforeRepair','AfterRepair')][string] $Phase
  )
  $preflight = @{ File='preflight.sql'; Marker='KLAY_MIGRATION_PREFLIGHT_PASS' }
  if ($Phase -eq 'AfterRepair') { $preflight = @{ File='f07-preflight-after.sql'; Marker='KLAY_F07_PREFLIGHT_AFTER_PASS' } }
  $steps = @(
    $preflight,
    @{ File='fixture-residue-audit.sql'; Marker='KLAY_FIXTURE_RESIDUE_AUDIT_PASS' },
    @{ File='f07-client.sql'; Marker='KLAY_F07_CLIENT_PASS' },
    @{ File='f07-privileged.sql'; Marker='KLAY_F07_PRIVILEGED_PASS' }
  )
  foreach ($name in @($steps | ForEach-Object { $_.File }) + @('f07-fixture.sql','f07-assertions.sql')) {
    if (-not (Test-Path -LiteralPath (Join-Path $SuiteDir $name) -PathType Leaf)) { throw "F07 SQL file is missing: $name" }
  }
  $failures = [System.Collections.Generic.List[string]]::new()
  for ($index=0; $index -lt $steps.Count; $index++) {
    $step=$steps[$index]
    Write-Host "START F07 $Phase`: $($step.File)"
    $result=Invoke-KlayNativeCommand -FilePath $PsqlPath -ArgumentList @('-X','-v','ON_ERROR_STOP=1','-f',(Join-Path $SuiteDir $step.File))
    Write-KlayNativeOutput -Result $result
    $lines=@($result.Output | ForEach-Object { $_.Trim() })
    if ($result.ExitCode -ne 0 -or @($lines | Where-Object { $_ -ceq $step.Marker }).Count -ne 1 -or
        @($lines | Where-Object { $_ -match 'ASSERTION FAILED|FAIL: F07' }).Count -ne 0) {
      Write-Host "F07 GROUP FAIL: $($step.File) (psql exit $($result.ExitCode))"
      if ($index -lt 2) { throw 'F07 safety preflight/residue audit failed; no integrity fixture may execute.' }
      $failures.Add($step.File) # Independent rollback transactions; collect both role contexts.
    } else { Write-Host "F07 GROUP PASS: $($step.File)" }
  }
  if ($failures.Count -ne 0) { throw "F07 SECURITY FAIL: $($failures -join ', '). Expected pre-repair failures remain security failures." }
  if ($Phase -eq 'BeforeRepair') { throw 'F07 SECURITY NOT VERIFIED: before-repair diagnostics cannot issue a post-repair security PASS.' }
  Write-Host 'F07 DIAGNOSTIC PASS: post-repair client and privileged assertions completed and rolled back.'
}
