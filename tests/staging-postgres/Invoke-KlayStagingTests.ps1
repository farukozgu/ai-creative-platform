param(
  [ValidateSet('2.114.0')][string] $SupabaseCliVersion,
  [switch] $F07CliCompatibilityReview,
  [switch] $F07MigrationStateInspection,
  [switch] $CandidateOwnershipDiagnostic,
  [ValidateSet('BeforeRepair','AfterRepair')][string] $F07Diagnostic
)

$ErrorActionPreference = 'Stop'
if ($F07CliCompatibilityReview) {
  if ($F07MigrationStateInspection -or $CandidateOwnershipDiagnostic -or $F07Diagnostic -or $SupabaseCliVersion -cne '2.114.0') { throw 'Compatibility review requires pinned 2.114.0 and no other diagnostic mode.' }
  $F07MigrationStateInspection = $true
}
if ($F07MigrationStateInspection -and ($CandidateOwnershipDiagnostic -or $F07Diagnostic)) { throw 'State inspection cannot be combined with test modes.' }
if ($CandidateOwnershipDiagnostic -and $F07Diagnostic) { throw 'Select only one focused diagnostic mode.' }
$expectedMigrationCount = 39
if ($F07Diagnostic -eq 'AfterRepair') { $expectedMigrationCount = 40 }
if ($F07MigrationStateInspection) { $expectedMigrationCount = 40 }
$nativeHelper = Join-Path $PSScriptRoot 'Invoke-KlayNativeCommand.ps1'
if (-not (Test-Path -LiteralPath $nativeHelper -PathType Leaf)) { throw 'Native command helper is missing.' }
. $nativeHelper
$historyParser = Join-Path $PSScriptRoot 'Parse-KlayMigrationHistory.ps1'
if (-not (Test-Path -LiteralPath $historyParser -PathType Leaf)) { throw 'Migration history parser is missing.' }
. $historyParser
if ($SupabaseCliVersion) { . (Join-Path $PSScriptRoot 'Invoke-KlayPinnedSupabase.ps1') }
$diagnosticHelper = Join-Path $PSScriptRoot 'Invoke-KlayCandidateDiagnostic.ps1'
if (-not (Test-Path -LiteralPath $diagnosticHelper -PathType Leaf)) { throw 'Candidate diagnostic helper is missing.' }
. $diagnosticHelper
$f07Helper = Join-Path $PSScriptRoot 'Invoke-KlayF07Diagnostic.ps1'
if (-not (Test-Path -LiteralPath $f07Helper -PathType Leaf)) { throw 'F07 diagnostic helper is missing.' }
. $f07Helper
$failedGroups = [System.Collections.Generic.List[string]]::new()
$stagingRoot = 'C:\klay-ai-staging-tests'
$expectedRef = 'gklpgcyndeghjgemoonk'
$expectedUser = "postgres.$expectedRef"
$expectedHost = 'aws-0-eu-west-1.pooler.supabase.com'
$expectedPort = 5432
$pgEnvironmentNames = @('PGPASSWORD','PGHOST','PGPORT','PGUSER','PGDATABASE','PGSSLMODE','PGCONNECT_TIMEOUT','PGAPPNAME','PGOPTIONS','PGSERVICE','PGSERVICEFILE','PGPASSFILE','PGHOSTADDR','PGTARGETSESSIONATTRS')
$linkedRefPath = Join-Path $stagingRoot 'supabase\.temp\project-ref'
$poolerUrlPath = Join-Path $stagingRoot 'supabase\.temp\pooler-url'
$migrationDir = Join-Path $stagingRoot 'supabase\migrations'

if (-not (Test-Path -LiteralPath $stagingRoot -PathType Container)) {
  throw "Staging CLI directory is missing: $stagingRoot"
}
Push-Location -LiteralPath $stagingRoot
try {
  if ((Get-Location).Path -ne $stagingRoot) { throw 'Could not enter the staging CLI directory.' }
  if (-not (Test-Path -LiteralPath $linkedRefPath -PathType Leaf)) { throw 'Staging linked project ref is missing.' }
  $linkedRef = (Get-Content -LiteralPath $linkedRefPath -Raw).Trim()
  if ($linkedRef -ne $expectedRef) { throw 'Staging project ref mismatch; refusing to continue.' }

  if (-not (Test-Path -LiteralPath $poolerUrlPath -PathType Leaf)) { throw 'Staging pooler metadata is missing.' }
  $poolerUri = [uri](Get-Content -LiteralPath $poolerUrlPath -Raw).Trim()
  $poolerUser = [uri]::UnescapeDataString(($poolerUri.UserInfo -split ':', 2)[0])
  if ($poolerUser -ne $expectedUser) { throw 'Pooler username project suffix mismatch; refusing to continue.' }
  if ($poolerUri.Host -ne $expectedHost -or $poolerUri.Port -ne $expectedPort) {
    throw 'Pooler host differs from the Dashboard-verified staging host; refusing to continue.'
  }

  $localMigrations = @(Get-ChildItem -LiteralPath $migrationDir -Filter '*.sql' -File)
  if ($localMigrations.Count -ne $expectedMigrationCount) { throw "Expected $expectedMigrationCount staging migration files; found $($localMigrations.Count)." }
  $localVersions = @()
  foreach ($migration in $localMigrations) {
    if ($migration.BaseName -cnotmatch '^(\d{14})(?:_|$)') {
      throw "Malformed local migration filename; refusing history comparison: $($migration.Name)"
    }
    $localVersions += $Matches[1]
  }
  if ($localVersions -notcontains '20261101020000') { throw 'Applied candidate ownership repair version is missing from local migration filenames.' }
  if ((($F07Diagnostic -eq 'AfterRepair') -or $F07MigrationStateInspection) -ne ($localVersions -contains '20261101030000')) {
    throw 'F07 migration presence does not match the selected explicit before/after baseline.'
  }
  $psql = Get-Command psql -ErrorAction SilentlyContinue
  if (-not $psql) { throw 'psql is required. Install the PostgreSQL client before running this opt-in suite.' }

  $supabase = Get-Command supabase -ErrorAction SilentlyContinue
  if ($SupabaseCliVersion) {
    $npx = Get-Command npx -ErrorAction SilentlyContinue
    if (-not $npx) { throw 'npx is required for the explicitly pinned CLI.' }
    $versionResult=Invoke-KlayPinnedSupabase -NpxPath $npx.Source -Operation Version
    Write-KlayNativeOutput -Result $versionResult
    if ($F07CliCompatibilityReview) {
      $helpResult=Invoke-KlayPinnedSupabase -NpxPath $npx.Source -Operation PushHelp
      Write-Host 'Pinned CLI required flags verified.'
    }
    $historyResult=Invoke-KlayPinnedSupabase -NpxPath $npx.Source -Operation History
  } elseif ($supabase) {
    $historyResult = Invoke-KlayNativeCommand -FilePath $supabase.Source -ArgumentList @('migration', 'list', '--linked')
  } else {
    $npx = Get-Command npx -ErrorAction SilentlyContinue
    if (-not $npx) { throw 'Supabase CLI or npx is required to verify linked migration history.' }
    $historyResult = Invoke-KlayNativeCommand -FilePath $npx.Source -ArgumentList @('supabase', 'migration', 'list', '--linked')
  }
  Write-KlayNativeOutput -Result $historyResult
  if ($F07MigrationStateInspection) {
    # Parse cells once; never remove rows with a second formatting-dependent regex.
    $inspectionHistory = ConvertFrom-KlayMigrationHistory -OutputLines $historyResult.Output -LocalVersions $localVersions -ExitCode $historyResult.ExitCode -ExpectedCount 40 -F07MigrationStateInspection
    Write-Host "Read-only history evidence: $($inspectionHistory.RemoteVersions.Count) recorded; $($inspectionHistory.PendingVersions.Count) pending. This is not a migration installation PASS."
  } else {
    $parsedHistory = ConvertFrom-KlayMigrationHistory -OutputLines $historyResult.Output `
    -LocalVersions $localVersions -ExitCode $historyResult.ExitCode -ExpectedCount $expectedMigrationCount
  if ($parsedHistory.Count -ne $expectedMigrationCount) { throw 'Migration history row count changed unexpectedly; refusing database execution.' }
  }

  Write-Host "Isolation verified: ref=$linkedRef; pooler host=$($poolerUri.Host); pooler user suffix verified; history validated for selected mode."
  Write-Host 'Confirm the displayed pooler host matches the Supabase Dashboard staging connection panel before continuing.'
  $confirmation = Read-Host 'Type STAGING-VERIFIED to continue'
  if ($confirmation -cne 'STAGING-VERIFIED') { throw 'Operator did not confirm the Dashboard host.' }

  $securePassword = Read-Host 'Staging database password' -AsSecureString
  $passwordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  $previousPgEnvironment = @{}
  try {
    foreach ($name in $pgEnvironmentNames) {
      $entry = Get-Item "Env:$name" -ErrorAction SilentlyContinue
      if ($entry) { $previousPgEnvironment[$name] = $entry.Value }
    }
    $plainStagingPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPtr)
    if ([string]::IsNullOrEmpty($plainStagingPassword)) { throw 'A non-empty staging database password is required.' }
    $env:PGPASSWORD = $plainStagingPassword
    $plainStagingPassword = $null
    $env:PGHOST = $poolerUri.Host
    $env:PGPORT = [string]$poolerUri.Port
    $env:PGUSER = $poolerUser
    $env:PGDATABASE = 'postgres'
    $env:PGSSLMODE = 'require'
    $env:PGCONNECT_TIMEOUT = '10'
    $env:PGAPPNAME = 'klay-staging-phase7f5'
    $env:PGOPTIONS = '-c statement_timeout=60000 -c lock_timeout=20000'
    Remove-Item Env:PGSERVICE, Env:PGSERVICEFILE, Env:PGPASSFILE, Env:PGHOSTADDR, Env:PGTARGETSESSIONATTRS -ErrorAction SilentlyContinue

    $suiteDir = $PSScriptRoot
    if ($F07MigrationStateInspection) {
      $result = Invoke-KlayNativeCommand -FilePath $psql.Source -ArgumentList @('-X', '-v', 'ON_ERROR_STOP=1', '-v', ('expected_versions=' + (($localVersions | Sort-Object) -join ',')), '-f', (Join-Path $suiteDir 'f07-migration-state.sql'))
      Write-KlayNativeOutput -Result $result
      if ($result.ExitCode -ne 0 -or @($result.Output | Where-Object { $_ -ceq 'KLAY_F07_STATE_INSPECTION_COMPLETE' }).Count -ne 1) { throw 'F07 state INCONCLUSIVE: read-only inspection failed or was incomplete.' }
      $states = @($result.Output | Where-Object { $_ -cmatch '^(?:NOTICE:\s*)?KLAY_F07_STATE=(ABSENT|APPLIED|PARTIAL/DRIFTED|INCONCLUSIVE)$' } | ForEach-Object { ($_ -split '=')[-1] })
      if ($states.Count -ne 1) { throw 'F07 state INCONCLUSIVE: expected one catalog classification.' }
      if ($states[0] -notin @('ABSENT','APPLIED')) { throw "F07 state $($states[0]): STOP; no retry is authorized." }
      Write-Host "Inspection state: $($states[0]). No application or security PASS verdict; review evidence before retry."
      if ($F07CliCompatibilityReview) {
        if ($states[0] -cne 'ABSENT' -or $inspectionHistory.InstallationComplete -or $inspectionHistory.PendingVersions.Count -ne 1) { throw 'Compatibility review requires ABSENT and the sole pending F07 migration.' }
        $compat=Invoke-KlayNativeCommand -FilePath $psql.Source -ArgumentList @('-X','-v','ON_ERROR_STOP=1','-f',(Join-Path $suiteDir 'f07-cli-compatibility-preflight.sql'))
        Write-KlayNativeOutput -Result $compat
        if ($compat.ExitCode -ne 0 -or @($compat.Output | Where-Object { $_ -ceq 'KLAY_F07_CLI_COMPATIBILITY_PREFLIGHT_COMPLETE' }).Count -ne 1) { throw 'CLI compatibility catalog preflight failed or was incomplete.' }
        $dryRun=Invoke-KlayPinnedSupabase -NpxPath $npx.Source -Operation DryRun
        Write-KlayNativeOutput -Result $dryRun
        Assert-KlayF07DryRun -Result $dryRun
        Write-Host 'STOP BEFORE APPLICATION: pinned CLI preflight and sole-F07 dry-run complete. No migration was applied.'
      }
      return
    }
    if ($F07Diagnostic) {
      Invoke-KlayF07Diagnostic -PsqlPath $psql.Source -SuiteDir $suiteDir -Phase $F07Diagnostic
      return
    }
    if ($CandidateOwnershipDiagnostic) {
      Invoke-KlayCandidateDiagnostic -PsqlPath $psql.Source -SuiteDir $suiteDir
      return # Finally blocks still restore credentials and the original directory.
    }

    $preflightResult = Invoke-KlayNativeCommand -FilePath $psql.Source -ArgumentList @('-X', '-v', 'ON_ERROR_STOP=1', '-f', (Join-Path $suiteDir 'preflight.sql'))
    Write-KlayNativeOutput -Result $preflightResult
    if ($preflightResult.ExitCode -ne 0) { throw "Read-only PostgreSQL preflight failed with psql exit code $($preflightResult.ExitCode)." }

    $groups = @(
      'authenticated-rls.sql',
      'transactional-smoke.sql',
      'model-client-status.sql',
      'model-client-pointer.sql',
      'model-client-privileges.sql',
      'candidate-leases.sql',
      'image-leases.sql',
      'admissions.sql',
      'credit-lifecycle.sql',
      'storage-metadata.sql'
    )
    foreach ($group in $groups) {
      Write-Host "START: $group"
      $groupResult = Invoke-KlayNativeCommand -FilePath $psql.Source -ArgumentList @('-X', '-v', 'ON_ERROR_STOP=1', '-f', (Join-Path $suiteDir $group))
      Write-KlayNativeOutput -Result $groupResult
      $groupExitCode = $groupResult.ExitCode
      if ($groupExitCode -eq 0) {
        Write-Host "GROUP PASS: $group"
      } else {
        Write-Host "GROUP FAIL: $group (psql exit $groupExitCode)"
        $failedGroups.Add($group)
      }
    }

    Write-Host 'START: concurrent admission and candidate-claim sessions'
    try {
      & (Join-Path $suiteDir 'Invoke-AdmissionConcurrency.ps1') -PsqlPath $psql.Source
      Write-Host 'GROUP PASS: multi-session concurrency harness'
    } catch {
      Write-Host "GROUP FAIL: multi-session concurrency harness ($($_.Exception.Message))"
      $failedGroups.Add('multi-session concurrency harness')
    }

    if ($failedGroups.Count -gt 0) {
      throw "Staging integration assertions failed in $($failedGroups.Count) group(s): $($failedGroups -join ', '). No PASS verdict is available."
    }
    Write-Host 'ALL LOCAL TEST GROUPS PASS. This is an operator-run staging result, not a result from this preparation phase.'
  }
  finally {
    foreach ($name in $pgEnvironmentNames) {
      if ($previousPgEnvironment.ContainsKey($name)) { Set-Item "Env:$name" $previousPgEnvironment[$name] }
      else { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
    }
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPtr)
    $securePassword.Dispose()
  }
}
catch {
  if ($F07MigrationStateInspection -and $_.Exception.Message -notmatch '^F07 state (?:PARTIAL/DRIFTED|INCONCLUSIVE)') {
    Write-Host 'F07 state INCONCLUSIVE: inspection did not complete; STOP.'
  }
  throw
}
finally {
  Pop-Location
}
