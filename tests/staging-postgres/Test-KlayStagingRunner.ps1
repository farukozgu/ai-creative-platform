$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Invoke-KlayNativeCommand.ps1')

# Exercise a copy of the actual runner in local child PowerShell processes.
# Every CLI/psql invocation and every staging metadata read is a mock.
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$testRoot = Join-Path $tempBase ('klay-runner-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $testRoot
$hostExe = Join-Path $PSHOME 'powershell.exe'
if (-not (Test-Path -LiteralPath $hostExe)) { $hostExe = Join-Path $PSHOME 'pwsh.exe' }

try {
  $sqlMarkers = @{
    'preflight.sql' = 'KLAY_MIGRATION_PREFLIGHT_PASS'
    'fixture-residue-audit.sql' = 'KLAY_FIXTURE_RESIDUE_AUDIT_PASS'
    'candidate-ownership-regression.sql' = 'KLAY_CANDIDATE_OWNERSHIP_REGRESSION_PASS'
    'f07-preflight-after.sql' = 'KLAY_F07_PREFLIGHT_AFTER_PASS'
    'f07-client.sql' = 'KLAY_F07_CLIENT_PASS'
    'f07-privileged.sql' = 'KLAY_F07_PRIVILEGED_PASS'
    'f07-cli-compatibility-preflight.sql' = 'KLAY_F07_CLI_COMPATIBILITY_PREFLIGHT_COMPLETE'
  }
  foreach ($name in $sqlMarkers.Keys) {
    $sql = Get-Content -LiteralPath (Join-Path $PSScriptRoot $name) -Raw
    $endPattern = '(?m)^ROLLBACK;\r?\n\\echo ' + [regex]::Escape($sqlMarkers[$name]) + '\s*\z'
    $controlSql = $sql -replace '(?m)^\\ir f07-(assertions|fixture)\.sql\r?\n',''
    if ($sql -notmatch '(?m)^\\set ON_ERROR_STOP on\s*$' -or
        $sql -notmatch '(?m)^BEGIN(?: TRANSACTION (?:ISOLATION LEVEL REPEATABLE READ )?READ ONLY)?;\s*$' -or
        $sql -notmatch "SET LOCAL statement_timeout = '\d+s';" -or
        $sql -notmatch "SET LOCAL lock_timeout = '\d+s';" -or
        $sql -match '(?im)^\s*(?:COMMIT|END\s+TRANSACTION)\b' -or
        $controlSql -match '(?im)^\s*\\(?:connect|!|i|ir)\b' -or $sql -notmatch $endPattern) {
      throw "Diagnostic SQL lost its bounded rollback-only assertion structure: $name"
    }
  }
  foreach ($include in @('f07-fixture.sql','f07-assertions.sql')) {
    $sql=Get-Content -LiteralPath (Join-Path $PSScriptRoot $include) -Raw
    if ($sql -match '(?im)^\s*(?:BEGIN;|COMMIT\b|ROLLBACK\b|\\(?:connect|!|i|ir)\b)') {
      throw "F07 include must not control transactions or include external files: $include"
    }
  }
  Write-Host 'PASS: all diagnostic SQL files enforce ON_ERROR_STOP, timeouts, explicit BEGIN, final ROLLBACK and completion marker.'
  $inspectionSql = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'f07-migration-state.sql') -Raw
  if ($inspectionSql -notmatch 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;' -or
      $inspectionSql -notmatch 'ROLLBACK;\r?\n\\echo KLAY_F07_STATE_INSPECTION_COMPLETE' -or
      $inspectionSql -match '(?im)^\s*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|COMMIT|\\ir)\b') {
    throw 'State inspection lost its read-only transaction structure.'
  }
  foreach ($name in @('Invoke-KlayStagingTests.ps1', 'Parse-KlayMigrationHistory.ps1',
      'Invoke-KlayCandidateDiagnostic.ps1', 'preflight.sql', 'fixture-residue-audit.sql',
      'candidate-ownership-regression.sql','Invoke-KlayF07Diagnostic.ps1',
      'f07-preflight-after.sql','f07-client.sql','f07-privileged.sql','f07-fixture.sql','f07-assertions.sql','f07-migration-state.sql',
      'Invoke-KlayPinnedSupabase.ps1','f07-cli-compatibility-preflight.sql')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $testRoot $name)
  }
  $migrationNames = @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '..\..\database\migrations') -Filter '*.sql' -File | Sort-Object Name | ForEach-Object { $_.Name })
  if ($migrationNames.Count -ne 40) { throw 'Runner mocks require the reviewed 40 migration filenames.' }
  $migrationNames | Set-Content -LiteralPath (Join-Path $testRoot 'migration-names.txt') -Encoding ASCII

  @'
function Invoke-KlayNativeCommand {
  param([string] $FilePath, [string[]] $ArgumentList)
  if (-not $global:MockInStaging) { throw 'Native call was not explicitly scoped to staging.' }
  if ($FilePath -eq 'mock-npx') {
    if (($ArgumentList[0..4] -join ' ') -cne '--yes --package=supabase@2.114.0 supabase --workdir C:\klay-ai-staging-tests' -or $env:PGPASSWORD -or $env:SUPABASE_DB_PASSWORD -or $env:SUPABASE_DEBUG) { throw 'Pinned CLI lost pin/workdir/credential isolation.' }
    if ($ArgumentList[-1] -eq '--version') {
      Write-Host 'MOCK_CALL:VERSION'
      $v='2.114.0'; if($global:MockScenario -eq 'review-wrong-version') { $v='2.122.0' }
      $code=0; if($global:MockScenario -eq 'review-cli-fail') { $code=17 }
      return [pscustomobject]@{ExitCode=$code;Output=@($v)}
    }
    if ($ArgumentList[-1] -eq '--help') {
      Write-Host 'MOCK_CALL:HELP'
      $help='--linked --project-ref --dry-run --skip-vault'
      if($global:MockScenario -eq 'review-missing-flag') { $help='--linked --project-ref --dry-run' }
      return [pscustomobject]@{ExitCode=0;Output=@($help)}
    }
    if ($ArgumentList -notcontains '--project-ref' -or $ArgumentList -notcontains 'gklpgcyndeghjgemoonk') { throw 'Pinned command lacks explicit staging project.' }
    if ($ArgumentList -contains '--dry-run') {
      if ($ArgumentList -notcontains '--skip-vault') { throw 'Dry-run lacks skip-vault.' }
      Write-Host 'MOCK_CALL:DRYRUN'
      $lines=@('DRY RUN: migrations will *not* be pushed to the database.','Would push these migrations:',' * 20261101030000_harden_approved_model_profile_integrity.sql','Finished supabase db push.')
      if ($global:MockScenario -eq 'review-extra-plan') { $lines+=' * 20261101040000_unexpected.sql' }
      return [pscustomobject]@{ExitCode=0;Output=$lines}
    }
    $FilePath='mock-supabase'; $ArgumentList=@('migration','list','--linked')
  }
  if ($FilePath -eq 'mock-supabase') {
    if (($ArgumentList -join ' ') -ne 'migration list --linked') { throw 'Unexpected CLI operation.' }
    Write-Host 'MOCK_CALL:CLI'
    $lines = @('Initialising login role...', '| Local | Remote | Time (UTC) |', '| --- | --- | --- |')
    $files = @($global:MockMigrationFiles)
    if ($global:MockScenario -eq 'history-truncated') { $files = @($files | Select-Object -First 38) }
    if ($global:MockScenario -eq 'f07-after-history-truncated') { $files = @($files | Select-Object -First 39) }
    foreach ($file in $files) {
      $v = $file.BaseName.Substring(0,14)
      if ($v -eq '20261101030000' -and ($global:MockScenario -like 'inspection-pending*' -or $global:MockScenario -like 'review-*' -or $global:MockScenario -eq 'f07-after-remote-pending')) {
        $lines += '  20261101030000 | `` |'
        continue
      }
      $lines += ('| `{0}` | `{0}` | ignored timestamp |' -f $v)
    }
    $code = 0
    if ($global:MockScenario -eq 'inspection-pending-duplicate') { $lines += '| `20261101030000` | | ignored timestamp |' }
    if ($global:MockScenario -eq 'history-fail') { $code = 9 }
    return [pscustomobject]@{ ExitCode = $code; Output = $lines }
  }
  if ($FilePath -ne 'mock-psql') { throw 'Unexpected native executable.' }
  if (($global:MockScenario -like 'inspection-*' -or $global:MockScenario -like 'review-*') -and $ArgumentList.Count -eq 7) {
    if ($ArgumentList.Count -ne 7 -or ($ArgumentList[0..3] -join ' ') -ne '-X -v ON_ERROR_STOP=1 -v' -or
      $ArgumentList[4] -notlike 'expected_versions=*' -or $ArgumentList[5] -ne '-f') { throw 'Unsafe inspection arguments.' }
    $ArgumentList = @('-X','-v','ON_ERROR_STOP=1','-f',$ArgumentList[6])
  }
  if ($ArgumentList.Count -ne 5 -or ($ArgumentList[0..3] -join ' ') -ne '-X -v ON_ERROR_STOP=1 -f') {
    throw 'psql invocation lost ON_ERROR_STOP or expected argument structure.'
  }
  if ($env:PGHOST -ne 'aws-0-eu-west-1.pooler.supabase.com' -or
      $env:PGUSER -ne 'postgres.gklpgcyndeghjgemoonk' -or $env:PGDATABASE -ne 'postgres' -or
      $env:PGPASSWORD -ne 'mock-staging-only' -or $env:PGSERVICE -or
      $env:PGOPTIONS -notmatch 'statement_timeout=60000' -or $env:PGOPTIONS -notmatch 'lock_timeout=20000') {
    throw 'Staging connection/credential/timeout environment was not correctly isolated.'
  }
  $name = [IO.Path]::GetFileName($ArgumentList[4])
  Write-Host "MOCK_CALL:$name"
  $marker = switch ($name) {
    'f07-migration-state.sql' { 'KLAY_F07_STATE_INSPECTION_COMPLETE' }
    'f07-cli-compatibility-preflight.sql' { 'KLAY_F07_CLI_COMPATIBILITY_PREFLIGHT_COMPLETE' }
    'preflight.sql' { 'KLAY_MIGRATION_PREFLIGHT_PASS' }
    'fixture-residue-audit.sql' { 'KLAY_FIXTURE_RESIDUE_AUDIT_PASS' }
    'candidate-ownership-regression.sql' { 'KLAY_CANDIDATE_OWNERSHIP_REGRESSION_PASS' }
    'f07-preflight-after.sql' { 'KLAY_F07_PREFLIGHT_AFTER_PASS' }
    'f07-client.sql' { 'KLAY_F07_CLIENT_PASS' }
    'f07-privileged.sql' { 'KLAY_F07_PRIVILEGED_PASS' }
    default { throw "Broader test group was invoked: $name" }
  }
  $code = 0
  if (($name -eq 'preflight.sql' -and $global:MockScenario -eq 'preflight-fail') -or
      ($name -eq 'fixture-residue-audit.sql' -and $global:MockScenario -eq 'audit-fail') -or
      ($name -eq 'candidate-ownership-regression.sql' -and $global:MockScenario -eq 'regression-fail')) {
    $code = 3
  }
  $lines = @('ROLLBACK', $marker)
  if ($name -eq 'f07-cli-compatibility-preflight.sql' -and $global:MockScenario -eq 'review-catalog-fail') { $code=3 }
  if ($name -eq 'f07-migration-state.sql') {
    $state='ABSENT'
    if ($global:MockScenario -eq 'inspection-recorded') { $state='APPLIED' }
    if ($global:MockScenario -eq 'inspection-partial') { $state='PARTIAL/DRIFTED' }
    if ($global:MockScenario -eq 'review-partial') { $state='PARTIAL/DRIFTED' }
    if ($global:MockScenario -eq 'inspection-inconclusive') { $state='INCONCLUSIVE' }
    $lines=@("KLAY_F07_STATE=$state",'ROLLBACK',$marker)
    if ($global:MockScenario -eq 'inspection-no-classification') { $lines=@('ROLLBACK',$marker) }
    if ($global:MockScenario -eq 'inspection-duplicate-classification') { $lines+= 'NOTICE:  KLAY_F07_STATE=APPLIED' }
  }
  if ($global:MockScenario -eq 'inspection-pending-fail') { $code=3 }
  if ($global:MockScenario -eq 'inspection-pending-no-marker') { $lines=@('ROLLBACK') }
  if ($global:MockScenario -eq 'regression-missing-marker' -and $name -eq 'candidate-ownership-regression.sql') {
    $lines = @('ROLLBACK')
  }
  if ($global:MockScenario -eq 'regression-assertion-exit0' -and $name -eq 'candidate-ownership-regression.sql') {
    $lines += 'ASSERTION FAILED: simulated failure with an incorrect zero exit'
  }
  if (($global:MockScenario -eq 'f07-before-vulnerable' -and $name -in @('f07-client.sql','f07-privileged.sql')) -or
      ($global:MockScenario -eq 'f07-after-client-fail' -and $name -eq 'f07-client.sql') -or
      ($global:MockScenario -eq 'f07-after-privileged-fail' -and $name -eq 'f07-privileged.sql')) {
    $code=3; $lines=@('ASSERTION FAILED: F07 accepted forbidden operations')
  }
  if ($global:MockScenario -eq 'f07-after-missing-marker' -and $name -eq 'f07-client.sql') { $lines=@('ROLLBACK') }
  if ($global:MockScenario -eq 'f07-after-assertion-exit0' -and $name -eq 'f07-client.sql') { $lines+='FAIL: F07 accepted forbidden operation' }
  [pscustomobject]@{ ExitCode = $code; Output = $lines }
}
function Write-KlayNativeOutput { param($Result) foreach ($line in $Result.Output) { Write-Host $line } }
'@ | Set-Content -LiteralPath (Join-Path $testRoot 'Invoke-KlayNativeCommand.ps1') -Encoding UTF8

  @'
param([string] $Scenario,[string] $Mode='Candidate')
$ErrorActionPreference = 'Stop'
$global:MockScenario = $Scenario
$global:MockInStaging = $false
$global:MockMigrationFiles = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'migration-names.txt') | ForEach-Object {
  [pscustomobject]@{ Name = $_; BaseName = [IO.Path]::GetFileNameWithoutExtension($_) }
})
if ($Scenario -eq 'f07-after-migration-notinstalled') {
  $global:MockMigrationFiles = @($global:MockMigrationFiles | Where-Object { $_.BaseName -notlike '20261101030000_*' })
}
$env:PGPASSWORD = 'prior-mock-only'
$env:PGSERVICE = 'prior-mock-service'
$env:SUPABASE_DB_PASSWORD = 'prior-mock-supabase-db'
$env:SUPABASE_DEBUG = 'prior-mock-debug'

function Test-Path {
  [CmdletBinding()] param([string] $LiteralPath, [string] $PathType)
  if ($LiteralPath -eq 'C:\klay-ai-staging-tests' -or $LiteralPath -like 'C:\klay-ai-staging-tests\supabase\.temp\*') { return $true }
  if ($LiteralPath -like 'C:\klay-ai-staging-tests\.env*' -or $LiteralPath -like 'C:\klay-ai-staging-tests\supabase\.env*') { return ($global:MockScenario -eq 'review-dotenv-present') }
  Microsoft.PowerShell.Management\Test-Path -LiteralPath $LiteralPath -PathType $PathType
}
function Push-Location {
  param([string] $LiteralPath)
  if ($LiteralPath -ne 'C:\klay-ai-staging-tests') { throw 'Wrong CLI working directory.' }
  $global:MockInStaging = $true
}
function Pop-Location { $global:MockInStaging = $false }
function Get-Location { [pscustomobject]@{ Path = 'C:\klay-ai-staging-tests' } }
function Get-FileHash {
  param([string] $LiteralPath,[string] $Algorithm)
  if ($LiteralPath -ne 'C:\klay-ai-staging-tests\supabase\migrations\20261101030000_harden_approved_model_profile_integrity.sql' -or $Algorithm -ne 'SHA256') { throw 'Unexpected fingerprint read.' }
  if ($global:MockScenario -eq 'review-file-drift') { return [pscustomobject]@{Hash='wrong'} }
  [pscustomobject]@{Hash='67D4243937FA111BB017BE50E148E544C5247BEF1EEFE40507AB7DCC45A4CFCB'}
}
function Get-Content {
  [CmdletBinding()] param([string] $LiteralPath, [switch] $Raw)
  if ($LiteralPath -eq 'C:\klay-ai-staging-tests\supabase\config.toml') {
    if($global:MockScenario -eq 'review-pgdelta-enabled') { return "[experimental.pgdelta]`nenabled = true`n" }
    return "[experimental.pgdelta]`nenabled = false`n"
  }
  if ($LiteralPath -eq 'C:\klay-ai-staging-tests\supabase\.temp\project-ref') {
    if ($global:MockScenario -eq 'ref-mismatch') { return 'fnzrnlvpkzwztccqzyzf' }
    return 'gklpgcyndeghjgemoonk'
  }
  if ($LiteralPath -eq 'C:\klay-ai-staging-tests\supabase\.temp\pooler-url') {
    $user = 'postgres.gklpgcyndeghjgemoonk'
    $poolerHost = 'aws-0-eu-west-1.pooler.supabase.com'
    if ($global:MockScenario -eq 'user-mismatch') { $user = 'postgres.fnzrnlvpkzwztccqzyzf' }
    if ($global:MockScenario -eq 'host-mismatch') { $poolerHost = 'wrong.invalid' }
    return "postgresql://${user}@${poolerHost}:5432/postgres"
  }
  throw 'Unexpected file read; application credentials must never be read.'
}
function Get-ChildItem {
  [CmdletBinding()] param([string] $LiteralPath, [string] $Filter, [switch] $File)
  if ($LiteralPath -ne 'C:\klay-ai-staging-tests\supabase\migrations') { throw 'Wrong local migration directory.' }
  if ($global:MockScenario -eq 'old-local38') { return @($global:MockMigrationFiles | Select-Object -First 38) }
  $global:MockMigrationFiles
}
function Get-Command {
  [CmdletBinding()] param([string] $Name)
  if ($Name -eq 'psql') {
    if ($global:MockScenario -eq 'missing-psql') { return $null }
    return [pscustomobject]@{ Source = 'mock-psql' }
  }
  if ($Name -eq 'supabase') { return [pscustomobject]@{ Source = 'mock-supabase' } }
  if ($Name -eq 'npx') { return [pscustomobject]@{ Source = 'mock-npx' } }
  throw 'Unexpected command discovery.'
}
function Read-Host {
  param([string] $Prompt, [switch] $AsSecureString)
  if ($AsSecureString) { return (ConvertTo-SecureString 'mock-staging-only' -AsPlainText -Force) }
  if ($global:MockScenario -eq 'dashboard-denied') { return 'NO' }
  'STAGING-VERIFIED'
}

$code = 0
try {
  if ($Scenario -eq 'diagnostic-mode-conflict') {
    & (Join-Path $PSScriptRoot 'Invoke-KlayStagingTests.ps1') -CandidateOwnershipDiagnostic -F07Diagnostic BeforeRepair
  } elseif ($Mode -eq 'PinnedAfter') {
    & (Join-Path $PSScriptRoot 'Invoke-KlayStagingTests.ps1') -F07Diagnostic AfterRepair -SupabaseCliVersion '2.114.0'
  } elseif ($Mode -eq 'Review') {
    & (Join-Path $PSScriptRoot 'Invoke-KlayStagingTests.ps1') -F07CliCompatibilityReview -SupabaseCliVersion '2.114.0'
  } elseif ($Mode -eq 'Inspection') {
    & (Join-Path $PSScriptRoot 'Invoke-KlayStagingTests.ps1') -F07MigrationStateInspection
  } elseif ($Mode -eq 'Candidate') {
    & (Join-Path $PSScriptRoot 'Invoke-KlayStagingTests.ps1') -CandidateOwnershipDiagnostic
  } else {
    & (Join-Path $PSScriptRoot 'Invoke-KlayStagingTests.ps1') -F07Diagnostic $Mode
  }
}
catch { $code = 1; Write-Host "MOCK_RUNNER_ERROR:$($_.Exception.Message)" }
if ($global:MockInStaging -or $env:PGPASSWORD -ne 'prior-mock-only' -or $env:PGSERVICE -ne 'prior-mock-service' -or
    $env:SUPABASE_DB_PASSWORD -ne 'prior-mock-supabase-db' -or $env:SUPABASE_DEBUG -ne 'prior-mock-debug') {
  Write-Host 'MOCK_RUNNER_ERROR:directory or credential environment was not restored'
  $code = 2
}
exit $code
'@ | Set-Content -LiteralPath (Join-Path $testRoot 'mock-runner.ps1') -Encoding UTF8

  $allSteps = 'CLI,preflight.sql,fixture-residue-audit.sql,candidate-ownership-regression.sql'
  $beforeSteps = 'CLI,preflight.sql,fixture-residue-audit.sql,f07-client.sql,f07-privileged.sql'
  $afterSteps = 'CLI,f07-preflight-after.sql,fixture-residue-audit.sql,f07-client.sql,f07-privileged.sql'
  $cases = @(
    @{ Name='review-dotenv-present'; Mode='Review'; Code=1; Calls='' },
    @{ Name='review-cli-fail'; Mode='Review'; Code=1; Calls='VERSION' },
    @{ Name='review-missing-flag'; Mode='Review'; Code=1; Calls='VERSION,HELP' },
    @{ Name='review-file-drift'; Mode='Review'; Code=1; Calls='' },
    @{ Name='pinned-after-success'; Mode='PinnedAfter'; Code=0; Calls='VERSION,CLI,f07-preflight-after.sql,fixture-residue-audit.sql,f07-client.sql,f07-privileged.sql' },
    @{ Name='review-pgdelta-enabled'; Mode='Review'; Code=1; Calls='' },
    @{ Name='review-success'; Mode='Review'; Code=0; Calls='VERSION,HELP,CLI,f07-migration-state.sql,f07-cli-compatibility-preflight.sql,DRYRUN' },
    @{ Name='review-wrong-version'; Mode='Review'; Code=1; Calls='VERSION' },
    @{ Name='review-partial'; Mode='Review'; Code=1; Calls='VERSION,HELP,CLI,f07-migration-state.sql' },
    @{ Name='review-catalog-fail'; Mode='Review'; Code=1; Calls='VERSION,HELP,CLI,f07-migration-state.sql,f07-cli-compatibility-preflight.sql' },
    @{ Name='review-extra-plan'; Mode='Review'; Code=1; Calls='VERSION,HELP,CLI,f07-migration-state.sql,f07-cli-compatibility-preflight.sql,DRYRUN' },
    @{ Name='inspection-pending'; Mode='Inspection'; Code=0; Calls='CLI,f07-migration-state.sql' },
    @{ Name='inspection-recorded'; Mode='Inspection'; Code=0; Calls='CLI,f07-migration-state.sql' },
    @{ Name='inspection-pending-fail'; Mode='Inspection'; Code=1; Calls='CLI,f07-migration-state.sql' },
    @{ Name='inspection-pending-no-marker'; Mode='Inspection'; Code=1; Calls='CLI,f07-migration-state.sql' },
    @{ Name='inspection-partial'; Mode='Inspection'; Code=1; Calls='CLI,f07-migration-state.sql' },
    @{ Name='inspection-inconclusive'; Mode='Inspection'; Code=1; Calls='CLI,f07-migration-state.sql' },
    @{ Name='inspection-no-classification'; Mode='Inspection'; Code=1; Calls='CLI,f07-migration-state.sql' },
    @{ Name='inspection-duplicate-classification'; Mode='Inspection'; Code=1; Calls='CLI,f07-migration-state.sql' },
    @{ Name='inspection-pending-duplicate'; Mode='Inspection'; Code=1; Calls='CLI' },
    @{ Name='history-fail'; Mode='Inspection'; Code=1; Calls='CLI' },
    @{ Name='history-truncated'; Mode='Inspection'; Code=1; Calls='CLI' },
    @{ Name='ref-mismatch'; Mode='Inspection'; Code=1; Calls='' },
    @{ Name='user-mismatch'; Mode='Inspection'; Code=1; Calls='' },
    @{ Name='host-mismatch'; Mode='Inspection'; Code=1; Calls='' },
    @{ Name='dashboard-denied'; Mode='Inspection'; Code=1; Calls='CLI' },
    @{ Name = 'success'; Code = 0; Calls = $allSteps },
    @{ Name = 'preflight-fail'; Code = 1; Calls = 'CLI,preflight.sql' },
    @{ Name = 'audit-fail'; Code = 1; Calls = 'CLI,preflight.sql,fixture-residue-audit.sql' },
    @{ Name = 'regression-fail'; Code = 1; Calls = $allSteps },
    @{ Name = 'regression-missing-marker'; Code = 1; Calls = $allSteps },
    @{ Name = 'regression-assertion-exit0'; Code = 1; Calls = $allSteps },
    @{ Name = 'history-fail'; Code = 1; Calls = 'CLI' },
    @{ Name = 'history-truncated'; Code = 1; Calls = 'CLI' },
    @{ Name = 'dashboard-denied'; Code = 1; Calls = 'CLI' },
    @{ Name = 'ref-mismatch'; Code = 1; Calls = '' },
    @{ Name = 'user-mismatch'; Code = 1; Calls = '' },
    @{ Name = 'host-mismatch'; Code = 1; Calls = '' },
    @{ Name = 'missing-psql'; Code = 1; Calls = '' },
    @{ Name = 'old-local38'; Code = 1; Calls = '' },
    @{ Name = 'f07-before-vulnerable'; Mode='BeforeRepair'; Code=1; Calls=$beforeSteps },
    @{ Name = 'f07-before-unexpected-clean'; Mode='BeforeRepair'; Code=1; Calls=$beforeSteps },
    @{ Name = 'f07-after-success'; Mode='AfterRepair'; Code=0; Calls=$afterSteps },
    @{ Name = 'f07-after-client-fail'; Mode='AfterRepair'; Code=1; Calls=$afterSteps },
    @{ Name = 'f07-after-privileged-fail'; Mode='AfterRepair'; Code=1; Calls=$afterSteps },
    @{ Name = 'f07-after-missing-marker'; Mode='AfterRepair'; Code=1; Calls=$afterSteps },
    @{ Name = 'f07-after-assertion-exit0'; Mode='AfterRepair'; Code=1; Calls=$afterSteps },
    @{ Name = 'f07-after-migration-notinstalled'; Mode='AfterRepair'; Code=1; Calls='' },
    @{ Name = 'f07-after-history-truncated'; Mode='AfterRepair'; Code=1; Calls='CLI' },
    @{ Name = 'f07-after-remote-pending'; Mode='AfterRepair'; Code=1; Calls='CLI' },
    @{ Name = 'diagnostic-mode-conflict'; Mode='BeforeRepair'; Code=1; Calls='' }
  )
  foreach ($case in $cases) {
    $mode='Candidate'
    if ($case.Mode) { $mode=$case.Mode }
    $result = Invoke-KlayNativeCommand -FilePath $hostExe -ArgumentList @(
      '-NoProfile', '-NonInteractive', '-File', (Join-Path $testRoot 'mock-runner.ps1'), '-Scenario', $case.Name, '-Mode', $mode
    )
    $calls = @($result.Output | Where-Object { $_ -match '^MOCK_CALL:' } | ForEach-Object { $_.Substring(10) }) -join ','
    $successCount = @($result.Output | Where-Object { $_ -like 'CANDIDATE OWNERSHIP DIAGNOSTIC PASS:*' -or $_ -like 'F07 DIAGNOSTIC PASS:*' }).Count
    $expectedSuccessCount = 1
    if ($case.Code -ne 0 -or $mode -in @('Inspection','Review')) { $expectedSuccessCount = 0 }
    if ($result.ExitCode -ne $case.Code -or $calls -cne $case.Calls -or
        $successCount -ne $expectedSuccessCount) {
      throw "Runner mock failed: $($case.Name); exit=$($result.ExitCode); calls=$calls; output=$($result.Output -join ' / ')"
    }
    Write-Host "PASS: diagnostic runner $($case.Name) (exit $($case.Code), exact group sequence, no broader groups)."
  }
}
finally {
  $resolved = (Get-Item -LiteralPath $testRoot).FullName
  if ([IO.Path]::GetDirectoryName($resolved).TrimEnd('\') -ne $tempBase.TrimEnd('\') -or
      -not ([IO.Path]::GetFileName($resolved).StartsWith('klay-runner-'))) {
    throw 'Refusing cleanup outside the generated runner mock directory.'
  }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
