# F07: atomic CLI application plan

READY for local preparation and operator read-only compatibility review.
BLOCKED for application until the gates below succeed with the pinned executable.
No remote command, SQL or migration was executed during preparation.

## Evidence and selected method

The operator confirmed ABSENT: exact 39-version history, only pending version
20261101030000, historical definitions intact, no private approval schema/table,
and a rollback-only completed inspection. That establishes the inspected state at
that time, not a permanent guarantee; this workflow repeats the inspection.

The locally cached Windows CLI package is 2.122.0. This is package metadata, not a
successful runtime version probe. The operator's resolved executable and the pinned
2.114.0 artifact must identify themselves at execution time; there is no cloud
compatibility PASS from this preparation.

Selected candidate: **unchanged F07 SQL, official npm CLI pinned to 2.114.0**.
The tagged apply source begins a transaction, executes compatible statements and
the version/name/statements history INSERT, then commits; statement failures request
rollback. Its batch-splitting classifier has no match in this F07 file. The driver
uses one physical pooled connection with idle reaping disabled. This supports one
transaction for locks, audit, replacements and history, subject to runtime gates.

Sources reviewed (tagged, not a draft patch):

- [Regression report](https://github.com/supabase/cli/issues/6347).
- [2.114.0 migration executor, lines 552-600](https://github.com/supabase/cli/blob/v2.114.0/apps/cli/src/legacy/shared/legacy-migration-apply.ts#L552).
- [Connection implementation](https://github.com/supabase/cli/blob/v2.114.0/apps/cli/src/legacy/shared/legacy-db-connection.sql-pg.layer.ts#L412).
- [History SQL contract](https://github.com/supabase/cli/blob/v2.114.0/apps/cli/src/legacy/shared/legacy-migration-history.ts#L20).
- [Push behavior, flags, side effects](https://github.com/supabase/cli/blob/v2.114.0/apps/cli/src/legacy/commands/db/push/SIDE_EFFECTS.md).
- [Post-apply cache gate](https://github.com/supabase/cli/blob/v2.114.0/apps/cli/src/legacy/shared/legacy-db-push-core.ts#L304).

This corrects the earlier uncertainty: a suitable tagged implementation is now
identified. A blanket BEGIN/COMMIT edit is unnecessary for this selected executor.

| Approach | Audit/lock/replacement atomicity | History relationship | Decision |
| --- | --- | --- | --- |
| Unchanged migration, verified pinned 2.114.0 | One CLI-owned transaction for this file | INSERT precedes the same COMMIT | Preferred, conditional on runtime preflight |
| File-level BEGIN/COMMIT on pipelined CLI | Can make SQL objects atomic | File COMMIT can precede CLI history INSERT | Reject for this task |
| Custom transactional executor with history INSERT in its transaction | Possible in principle | Requires implementing/testing CLI-compatible history ownership | No custom history writer or repair prepared |
| Apply with psql, then register/repair history | Schema commits first | Separate action leaves a history gap | Reject |

On the selected path, an audit/lock/DDL/history-INSERT failure should roll back both
F07 objects and its history row. History-table initialization is a separate CLI
setup transaction; the read-only preflight requires its existing expected shape,
so no history-table upgrade is expected. Temporary login roles and local CLI
caches are outside migration atomicity. A network loss during COMMIT is ambiguous
to the client: both schema and history may have committed. Stop and inspect; never
blindly retry, repair history, or edit a newly recorded migration.

## Compatibility validation and prerequisites

- Windows PowerShell 5.1, Node/npm/npx, psql on PATH; no Docker required for this plan.
- Existing Supabase CLI account authentication with staging access. No link changes.
- The pinned artifact must report exactly 2.114.0 and expose required flags. Package
  resolution/download may require network access. Failure is blocking.
- Config loading and migration history reconciliation must succeed under that version.
- Read-only PostgreSQL checks must confirm PG14+, postgres role, the existing
  version/text, name/text, statements/text[] history format and normal version PK,
  owner/INSERT privileges, no history triggers/rules/RLS. Prior exact history/state
  inspection checks all 39 version values and the old definitions.
- A dry-run proves connection/config/history planning, not SQL runtime correctness.
  The compatibility audit is still executed under locks during actual application.

## 1. Local staging config preparation and file verification

The staging config currently explicitly enables pg-delta. In ONLY
`C:\klay-ai-staging-tests\supabase\config.toml`, manually change the existing section
to the following before the pinned workflow. Preserve all other settings and links:

```toml
[experimental.pgdelta]
enabled = false
```

This disables the optional post-apply catalog-export path that can invoke local
container tooling. An environment false alone cannot negate a config true because
the tagged cache gate uses OR. The guard rejects an absent/nonliteral false value,
dotenv overrides and remote config overrides rather than guessing. Do not change
the application repository's configuration or .env.local. No config was edited by
the preparation agent.

Start an interactive PowerShell session; do not enable a transcript or --debug.

```powershell
Set-Location -LiteralPath 'C:\klay-ai-staging-tests'
$ErrorActionPreference = 'Stop'
$stageRef = (Get-Content -LiteralPath 'C:\klay-ai-staging-tests\supabase\.temp\project-ref' -Raw).Trim()
if ($stageRef -cne 'gklpgcyndeghjgemoonk') { throw 'Wrong or missing staging reference' }
$sourceMigrations = 'C:\Users\faruk\Desktop\ai-creative-platform\database\migrations'
$stageMigrations = 'C:\klay-ai-staging-tests\supabase\migrations'
$sourceFiles = @(Get-ChildItem -LiteralPath $sourceMigrations -Filter '*.sql' -File)
$stageFiles = @(Get-ChildItem -LiteralPath $stageMigrations -Filter '*.sql' -File)
if ($sourceFiles.Count -ne 40 -or $stageFiles.Count -ne 40) { throw 'Expected 40 local files in each directory' }
if (@(Compare-Object ($sourceFiles.Name | Sort-Object) ($stageFiles.Name | Sort-Object)).Count) { throw 'Filename sets differ' }
foreach ($file in $sourceFiles) {
    $stageFile = Join-Path $stageMigrations $file.Name
    if ((Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash -cne (Get-FileHash -LiteralPath $stageFile -Algorithm SHA256).Hash) {
        throw "Migration copy mismatch: $($file.Name)"
    }
}
$pendingFile = Join-Path $stageMigrations '20261101030000_harden_approved_model_profile_integrity.sql'
if ((Get-FileHash -LiteralPath $pendingFile -Algorithm SHA256).Hash -cne '67D4243937FA111BB017BE50E148E544C5247BEF1EEFE40507AB7DCC45A4CFCB') {
    throw 'Pending migration differs from reviewed file; STOP'
}
Get-FileHash -LiteralPath $pendingFile -Algorithm SHA256
```

No migration copy or edit is required. Any mismatch stops this plan; never overwrite
an applied historical migration to make a comparison pass.

## 2. Pinned read-only preflight and sole-migration dry-run

```powershell
Set-Location -LiteralPath 'C:\klay-ai-staging-tests'
powershell.exe -NoProfile -File 'C:\Users\faruk\Desktop\ai-creative-platform\tests\staging-postgres\Invoke-KlayStagingTests.ps1' -SupabaseCliVersion '2.114.0' -F07CliCompatibilityReview
if ($LASTEXITCODE -ne 0) { throw 'Pinned compatibility review failed; STOP' }
```

The runner verifies staging ref and project-qualified pooler metadata, exact pinned
runtime version/help, 39+pending filename/history equality, manual Dashboard host
confirmation and secure staging password handling. It then runs only the existing
read-only state SQL, the new read-only CLI compatibility SQL, and the pinned dry-run.
All CLI calls explicitly use the staging workdir and project ref. Inherited database
credentials/target overrides are removed for CLI calls and restored afterwards.
No application dotenv file is loaded. The password is neither an argument nor a file.

Require ABSENT, both SQL completion markers, and precisely this dry-run plan:

```text
Would push these migrations:
 • 20261101030000_harden_approved_model_profile_integrity.sql
```

The helper runs the equivalent of:
`npx --yes --package=supabase@2.114.0 supabase --workdir C:\klay-ai-staging-tests db push --linked --project-ref gklpgcyndeghjgemoonk --skip-vault --dry-run`.
The npm --yes permits package acquisition; it is not a Supabase --yes confirmation.

**STOP HERE BEFORE ACTUAL APPLICATION.** The runner contains no apply operation.
Review runtime version, redacted evidence, file hashes and sole pending plan. Do not
continue on any unknown config, privileges, data compatibility or state result.

## 3. Separate operator application step, only after reviewed gates

This block is an application command for a later operator action; it was not run
by the preparation agent. Keep exclusive control of migration files/config and
avoid concurrent migrations. Rerun sections 1 and 2 immediately before this block;
if any file, config or state changes, stop and repeat review.

```powershell
Set-Location -LiteralPath 'C:\klay-ai-staging-tests'
$ErrorActionPreference = 'Stop'
if ((Get-Content -LiteralPath '.\supabase\.temp\project-ref' -Raw).Trim() -cne 'gklpgcyndeghjgemoonk') { throw 'Staging ref mismatch' }
. 'C:\Users\faruk\Desktop\ai-creative-platform\tests\staging-postgres\Invoke-KlayNativeCommand.ps1'
. 'C:\Users\faruk\Desktop\ai-creative-platform\tests\staging-postgres\Invoke-KlayPinnedSupabase.ps1'
$npxPath = (Get-Command npx -ErrorAction Stop).Source
$checkedVersion = Invoke-KlayPinnedSupabase -NpxPath $npxPath -Operation Version
Write-KlayNativeOutput -Result $checkedVersion
if ((Read-Host 'After reviewing the completed pinned preflight, type APPLY-F07-STAGING') -cne 'APPLY-F07-STAGING') { throw 'Stopped before application' }
$isolatedNames = @('SUPABASE_DB_PASSWORD','SUPABASE_DB_URL','SUPABASE_PROJECT_ID','SUPABASE_YES','SUPABASE_EXPERIMENTAL_PG_DELTA','SUPABASE_DEBUG','SUPABASE_OUTPUT_FORMAT',
    'PGPASSWORD','PGHOST','PGHOSTADDR','PGPORT','PGUSER','PGDATABASE','PGSERVICE','PGSERVICEFILE','PGPASSFILE','PGOPTIONS')
$savedF07Environment = @{}
try {
    foreach ($name in $isolatedNames) {
        $entry = Get-Item "Env:$name" -ErrorAction SilentlyContinue
        if ($entry) { $savedF07Environment[$name] = $entry.Value }
        Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    }
    $env:SUPABASE_PROJECT_ID = 'gklpgcyndeghjgemoonk'
    $env:SUPABASE_EXPERIMENTAL_PG_DELTA = 'false'
    $npxPath = (Get-Command npx -ErrorAction Stop).Source
    $applyResult = Invoke-KlayNativeCommand -FilePath $npxPath -ArgumentList @('--yes','--package=supabase@2.114.0','supabase',
        '--workdir','C:\klay-ai-staging-tests','db','push','--linked','--project-ref','gklpgcyndeghjgemoonk','--skip-vault')
    Write-KlayNativeOutput -Result $applyResult
    if ($applyResult.ExitCode -ne 0) { throw 'Application failed or commit outcome is uncertain; inspect state before any retry' }
} finally {
    foreach ($name in $isolatedNames) {
        if ($savedF07Environment.ContainsKey($name)) { Set-Item "Env:$name" $savedF07Environment[$name] }
        else { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
    }
}
```

No --include-all, --include-seed, --include-roles, --db-url, --password or history repair.
No workers, Vault sync, providers, billing or deployments are enabled. Runtime audit
errors are stop conditions; do not weaken assertions or rewrite approved data.

## 4. Post-application verification, in this order

Only after an operator application attempt, start with read-only reconciliation:

```powershell
Set-Location -LiteralPath 'C:\klay-ai-staging-tests'
powershell.exe -NoProfile -File 'C:\Users\faruk\Desktop\ai-creative-platform\tests\staging-postgres\Invoke-KlayStagingTests.ps1' -SupabaseCliVersion '2.114.0' -F07MigrationStateInspection
if ($LASTEXITCODE -ne 0) { throw 'Post-application state unknown or drifted; STOP' }
# Require displayed 40 recorded, 0 pending, and KLAY_F07_STATE=APPLIED.
# Do not continue if ABSENT or any other result is displayed.
```

After confirmed APPLIED with exact 40/40 history, separately run the focused,
rollback-only security regression. Its history parser requires all 40 versions:

```powershell
Set-Location -LiteralPath 'C:\klay-ai-staging-tests'
powershell.exe -NoProfile -File 'C:\Users\faruk\Desktop\ai-creative-platform\tests\staging-postgres\Invoke-KlayStagingTests.ps1' -SupabaseCliVersion '2.114.0' -F07Diagnostic AfterRepair
if ($LASTEXITCODE -ne 0) { throw 'F07 verification failed; STOP' }
```

APPLIED is installation evidence, not a security PASS. Only an actual completed
AfterRepair diagnostic can establish its covered PostgreSQL assertions. Broader
integration groups remain pending. On any failure or uncertain commit, use read-only
state inspection first; do not use reset, repair, relink, or automatic retry.

## Local evidence and limits

Run Test-KlayMigrationHistory.ps1, Test-KlayStagingRunner.ps1,
Test-KlayF07StateContracts.ps1, Test-KlayPinnedSupabase.ps1 and
Test-KlayNativeCommand.ps1 locally. These exercise pins, allowlists, credential
restoration, strict/pending histories, state handling, stop-before-apply behavior,
dry-run rejection cases and source-bound SQL fingerprints. They are mocks/static
checks, not PostgreSQL or actual pinned-binary execution. Runtime config parsing,
Management API compatibility, artifact availability, catalog visibility and actual
application remain operator gates. Preserve redacted output only; never share
passwords, access tokens, connection strings, environment dumps or debug traces.
