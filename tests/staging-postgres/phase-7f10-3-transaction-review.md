# F07 failed migration: state inspection before correction

Verdict: READY for operator read-only inspection; BLOCKED for migration editing/retry
until its application state is confirmed. No remote operation was run during preparation.
The pending migration and the 39 historical files are unchanged.

## Findings

The pending file starts with two SET LOCAL statements, then LOCK TABLE (zero-based
statement index 2). It has no explicit BEGIN/COMMIT. SET LOCAL needs a transaction
block for its intended lifetime; a pipeline does not supply the transaction-block
semantics required by LOCK TABLE. The reported failure occurs before the audit or
any schema-changing statement. Absence of durable changes is likely, not established
by the error message or the absence of a migration history row.

The cached Windows CLI package metadata identifies version 2.122.0. Running its
--version locally failed because the sandbox cannot write its telemetry file; that
does not establish the operator's resolved executable version. The cli-latest file
is an update marker, not installed-version evidence. Obtain the operator version below.

Upstream evidence:

- https://github.com/supabase/cli/pull/6224 describes per-statement extended-protocol
  Parse/Bind/Execute, one Sync per batch, and a history insert in the final batch.
  Thus batching is distinct from individual round trips and from an explicit transaction.
- https://github.com/supabase/cli/issues/6347 reports the exact LOCK TABLE regression
  in 2.115/2.116 and continued reproduction in 2.119. Linked PR
  https://github.com/supabase/cli/pull/6354/files is now closed and titled
  "explain migration transaction requirements"; its commit history includes an
  earlier transaction-wrapper proposal and later diagnostic/documentation changes.
  Do not treat the original wrapper proposal as a shipped fix.
  This is an upstream report, not proof that every later release is affected or fixed.

No verified fixed release or supported transaction flag was established in this
investigation. Do not blindly upgrade, downgrade, use a draft build, or disable locks.

## Exact safe read-only operator sequence

Use an interactive Windows PowerShell session with psql available. No Docker is needed.
Do not enable a transcript while entering credentials or use --debug.

```powershell
Set-Location -LiteralPath 'C:\klay-ai-staging-tests'
$ErrorActionPreference = 'Stop'
$ref = (Get-Content -LiteralPath 'C:\klay-ai-staging-tests\supabase\.temp\project-ref' -Raw).Trim()
if ($ref -cne 'gklpgcyndeghjgemoonk') { throw 'Wrong or missing staging project reference' }
# Local version inspection only. Capture the actual exit status too.
npx --no-install supabase --version
if ($LASTEXITCODE -ne 0) { throw 'CLI version inspection failed' }
powershell.exe -NoProfile -File 'C:\Users\faruk\Desktop\ai-creative-platform\tests\staging-postgres\Invoke-KlayStagingTests.ps1' -F07MigrationStateInspection
if ($LASTEXITCODE -ne 0) { throw 'Read-only inspection failed; STOP' }
```

The runner independently repeats the exact staging ref, project-qualified pooler
username, Dashboard host/port and manual Dashboard confirmation checks. It reads
no application environment file, prompts securely for the staging password, restores
the prior PG environment, and executes explicitly from the staging directory.
The CLI history gate requires either all 40 exact versions or exactly one local-only
pending F07 row plus the exact 39 prior versions. This exception exists only in the
read-only inspection branch; test modes retain their strict before/after baselines.
PostgreSQL independently compares the exact local version manifest in a repeatable-read,
read-only transaction with bounded timeouts and ON_ERROR_STOP. The only SQL file run
is f07-migration-state.sql, ending in ROLLBACK and an inspection completion marker.
Completion is not a security PASS or permission to retry.

Capture only displayed version, exit status, history and catalog evidence. No password,
connection URL, token, --debug output, environment dump or Supabase temp files should
be included in a shared report. The function definitions contain application SQL, not credentials.

## Interpreting state evidence

| Evidence | Interpretation/action |
| --- | --- |
| Exact 39 history entries; no F07 row; private schema/table absent; both function definitions/owners/ACLs and the UPDATE-only profile trigger match historical migrations | Absent/unapplied after full definition comparison; correction of the pending file can then proceed |
| Exact 40 entries; new private schema/table, SECURITY DEFINER guard, INSERT/UPDATE trigger and both definitions match pending F07, with intended ACLs | Recorded and structurally matching; do not edit this applied version; still requires separate F07 regression verification |
| Any F07 object without its history row, mixed old/new definitions, or unexpected ACL/owner/trigger state | Partial or drifted; STOP; preserve evidence and prepare a separately reviewed recovery plan |
| History recorded but definitions absent/old, unknown versions, missing prior versions, or incomplete inspection | Inconsistent/unknown; STOP |

Inspect *complete* definitions, not just object existence or body hashes. Compare with
the last historical CREATE OR REPLACE definitions under database/migrations and pending
20261101030000. Catalog output is evidence for review, not an automatic exact-body verdict.
The inspection intentionally does not invoke the approval RPC or create test records.

## Conditional correction and safest retry plan (not authorized yet)

After confirmed absent state, the required file-level correction is BEGIN before
both SET LOCAL statements and COMMIT after the final function replacement. Every
existing lock, audit, grant restriction and replacement stays inside that same block.
No statement in this file requires execution outside a transaction: schema/table DDL,
REVOKE, RLS enablement, DO, function replacement and trigger replacement are transactional.
An uncaught compatibility exception aborts the transaction, as does lock timeout or
replacement failure. Retrying must use a fresh session after a failed transaction.
There is no exception handler that swallows audit errors. Approval-context rows remain
transaction-scoped through txid_current and statement rollback; the custom GUC is not
an authorization source.

However, a file-level COMMIT can precede the CLI-appended history INSERT. Consequently
BEGIN/COMMIT fixes lock/audit/replacement atomicity but must not be advertised as proven
schema-plus-history atomicity. A history-insert failure after COMMIT can leave schema
applied without a history row. An unmatched BEGIN is unsafe too: upstream review notes
the CLI can report success while the file remains uncommitted. Neither workaround
should be used without checking the actual chosen CLI transaction/history implementation.

Prefer a released, pinned CLI with verified transaction-block and history behavior,
once confirmed supported, over manually applying SQL followed by history repair.
Do not use psql to apply this file and then mark history applied. Do not split the
compatibility audit from replacement, remove locks, add IF NOT EXISTS to conceal a
partial state, or skip compatibility checks. After state evidence and runner semantics
are reviewed: correct only the unrecorded pending file, copy only that reviewed file
to staging with matching hashes, run a staging-only dry-run to confirm only version
40 is pending, then schedule the separately authorized push. No mutation command is
provided while these prerequisites remain unresolved.

After successful application, first inspect exact 40-version history and catalog state,
then use the separate -F07Diagnostic AfterRepair workflow. Broader integration groups
remain outside this phase.
