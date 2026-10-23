# F07 read-only inspection: pending migration support

READY for operator read-only execution. No remote SQL or CLI database commands were
executed during this preparation. Neither pending nor historical migrations changed.
This document supersedes the manual-only state interpretation in phase-7f10-3.

## Root cause and correction

The runner previously tried to identify/remove the pending row using a raw-line
regular expression, then invoked the strict parser. Any formatting variation that
missed that regex sent the empty Remote cell to the equality parser, which correctly
rejected it. The operator's complete raw output was not supplied, so its exact
unmatched formatting character is not established. An empty code-quoted Remote cell
reproduces the old filtering failure locally. An unbordered empty Time cell also
exposed a separate closing-pipe stripping bug, now corrected.

There is now one cell parser. Its explicit F07MigrationStateInspection switch
requires 40 unique local versions with 20261101030000 last. It permits an empty
Remote cell only for that version, requires the other 39 rows to match by value,
and compares the complete Local/Remote sets against the filenames. It also accepts
all 40 recorded versions for inspection. It never removes or ignores migration rows.
The result records PendingVersions and InstallationComplete=false for pending F07.
All normal and post-repair test calls omit the exception and reject any empty Remote.

## Read-only state classification

The runner executes only f07-migration-state.sql in this mode, then returns before
any fixture or test branch. SQL independently checks the exact history manifest in
a bounded REPEATABLE READ READ ONLY transaction, then rolls back. Definitions and
catalog metadata are displayed for review. Full function bodies are compared using
SHA256 with CR normalization only, against the actual latest historical and pending
repository definitions; Test-KlayF07StateContracts.ps1 checks those fingerprints.

| Result | Required evidence | Process result |
| --- | --- | --- |
| ABSENT | Exact 39 history entries, both complete historical function-body fingerprints, invoker guard, original UPDATE-only trigger, intact immutable-version guard, expected owners/grants/RLS, no private F07 schema/table | Exit 0: inspection completed; no security PASS |
| APPLIED | Exact 40 history entries, both corrected fingerprints, definer guard, INSERT/UPDATE trigger, intact immutable-version guard, expected owners/grants/RLS, protected empty context table with expected columns/PK, no policies or nonowner ACLs | Exit 0: structurally installed; no security PASS |
| PARTIAL/DRIFTED | History/schema disagree, mixed/unknown function bodies, wrong trigger, ownership/privilege drift, unexpected context contents or shape | Exit nonzero; STOP |
| INCONCLUSIVE | History parsing fails, insufficient visibility, SQL error, unsupported catalog state, missing completion/classification output or ambiguous classification | Exit nonzero; STOP |

The trusted owner baseline is postgres. Unexpected owners are drift; no inference
is made from history alone. The classification checks this migration's installation
contracts, not every possible database authorization path. It does not establish
that runtime F07 security regressions pass. Catalog failure never means ABSENT.
The state is emitted on stdout, avoiding psql NOTICE prefixes and verbosity settings.
The transaction-local inspection GUC carries output only; no approval authorization
depends on it. No approval RPC is invoked and no fixtures are created.

## Exact operator retry (read only)

Run in an interactive Windows PowerShell 5.1 session with psql on PATH. Keep existing
CLI links. The runner requests Dashboard confirmation and a secure staging password.
Do not supply a password in command arguments, enable --debug, or share temp metadata.

```powershell
Set-Location -LiteralPath 'C:\klay-ai-staging-tests'
$ErrorActionPreference = 'Stop'
$ref = (Get-Content -LiteralPath 'C:\klay-ai-staging-tests\supabase\.temp\project-ref' -Raw).Trim()
if ($ref -cne 'gklpgcyndeghjgemoonk') { throw 'Staging reference missing or mismatched' }
powershell.exe -NoProfile -File 'C:\Users\faruk\Desktop\ai-creative-platform\tests\staging-postgres\Invoke-KlayStagingTests.ps1' -F07MigrationStateInspection
if ($LASTEXITCODE -ne 0) { throw 'Inspection incomplete or drifted; STOP' }
```

Keep the displayed state and redacted catalog evidence. ABSENT permits the next
review of the pending transaction correction; it does not automatically apply it.
APPLIED means do not edit that recorded migration. No migration retry is performed
or authorized by this inspection. PARTIAL/DRIFTED and INCONCLUSIVE require review.

## Local checks

```powershell
# Local-only scripts: no database credentials or connection required.
powershell.exe -NoProfile -File 'C:\Users\faruk\Desktop\ai-creative-platform\tests\staging-postgres\Test-KlayMigrationHistory.ps1'
powershell.exe -NoProfile -File 'C:\Users\faruk\Desktop\ai-creative-platform\tests\staging-postgres\Test-KlayStagingRunner.ps1'
powershell.exe -NoProfile -File 'C:\Users\faruk\Desktop\ai-creative-platform\tests\staging-postgres\Test-KlayF07StateContracts.ps1'
```

Parser regressions cover unbordered CLI and Markdown tables, whitespace/backticks,
empty Remote/Time cells, exact 39+pending and exact 40 histories, strict-mode denial,
duplicates, missing/extra/unmatched versions, truncation, malformed columns/separators,
nonzero CLI status, and unexpected rows before the header. Runner mocks verify only
the inspection SQL runs, all isolation gates remain, all four classifications are
handled, and missing/duplicate markers or psql failure cannot produce success.
These are PowerShell/static checks; PostgreSQL classification SQL has not been
compiled or executed in this preparation phase.
