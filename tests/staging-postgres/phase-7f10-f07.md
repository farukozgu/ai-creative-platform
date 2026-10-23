# Phase 7F.10: approved Model Studio integrity

Prepared only. The operator reports candidate ownership diagnostic PASS and
39 matching migrations. This phase has not run remote commands, applied a
migration, or executed PostgreSQL assertions. The pending migration is only
in the source repository; all 39 staging migration copies remain unchanged.

## Audit and authorized workflows

The Model Studio foundation, candidate foundation, approval, orchestration,
hardening and applied candidate repair migrations were inspected. The owner
UPDATE policy permits a resulting draft/archived status. The old profile
trigger does not forbid leaving approved or validate identity pointer ownership.
Its missing-GUC comparison evaluates to NULL and does not reject that context.
Authenticated direct approval is separately blocked by RLS; the GUC alone is
not an authenticated approval exploit. The approval RPC is service-role-only.

`src/lib/models/model-profiles.ts` creates drafts, edits only draft rows, and
archives only drafts. Model actions use those functions. Composer/reference
resolution requires approved profiles and owned current versions. No TypeScript
caller of the approval RPC was found; candidate execution remains gated off in
`candidate-orchestration.ts`. This change does not activate that functionality.

Allowed transitions: draft edits, draft to archived, validated RPC approval,
and same-candidate replay. Archived profiles remain terminal. Approved to
draft/archive, owner/ID reassignment, and approved identity changes have no
current authorized workflow and are rejected.

## Additive migration and trust boundary

`database/migrations/20261101030000_harden_approved_model_profile_integrity.sql`
is unique and follows `20261101020000`. It acquires bounded table locks and
audits existing data/trigger/function ownership and access before changing
schema. Legacy approved rows lacking candidate/version evidence, non-approved
rows carrying pointers, mismatched versions, unsupported pending statuses, or
drifted guards cause an exception. No existing profile is rewritten, archived,
deleted, or silently backfilled. Production datasets may need a separate data
compatibility review; staging emptiness is not assumed to prove compatibility.

The migration creates schema `klay_model_security` and an RLS-protected context
table. PUBLIC, anon, authenticated and service_role receive no schema/table
access. Context binds backend PID, transaction ID, model, owner, candidate and
the new version. Only the existing function owner can write it. The existing
approval RPC validates and locks its inputs, creates context, performs approval
and version/reference insertion, installs the pointer, then removes context.
Errors roll back the statement and its context. Its signature, UUID return,
SECURITY DEFINER owner and existing EXECUTE restrictions are retained.

The profile guard becomes SECURITY DEFINER solely to read protected context;
its owner/ACL are retained and verified by migration prerequisites. It uses an
empty search_path, qualified relations and strict trigger-context validation.
It now guards INSERT as well as UPDATE. Caller statements still face their
existing RLS/table grants. New rows must be drafts without pointers; profile
ID/owner cannot change; candidate/version pointers must match the model/owner;
approved status, appearance and identity pointers are immutable, except for the
RPC's first version installation with matching reference evidence.

No GUC authorizes approval. Missing context becomes false and is tested with
IS DISTINCT FROM true; nullable context fields are checked explicitly. The
temporary approved profile without a pointer exists only inside the authorized
RPC statement. Existing identity-version UPDATE/DELETE immutability, RLS,
table grants, and candidate ownership triggers remain intact. Database owners
can still alter triggers/private tables; this does not claim protection from
administrators. Privileged probes verify that a forged GUC alone gives no path.
See PostgreSQL's [SECURITY DEFINER guidance](https://www.postgresql.org/docs/current/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY)
and [RLS rules](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

The old `proposals/f07_harden_model_profile_transition.sql` is now a comment-only
supersession pointer. Its nullable role-plus-GUC proposal must not be applied.
Potential regressions: privileged maintenance that archives approved profiles,
reassigns owners, mutates approved appearance, restores archived rows or bypasses
the RPC will fail. No current UI caller uses these paths. Locks may require a
quiet staging window and retry; audit failures require review, not weakened gates.

## Focused tests

Both modes run ONLY migration preflight, read-only residue audit, `f07-client.sql`
and `f07-privileged.sql`. BeforeRepair requires exact matching 39-version history;
AfterRepair requires exact matching 40-version history and the new migration.
The normal staging ref, pooler host/user, Dashboard confirmation, secure password,
ON_ERROR_STOP and timeout checks remain. A preflight/audit failure stops fixtures.

| SQL | Assertions |
| --- | --- |
| `f07-client.sql` | authenticated approved-to-draft/archive; foreign-owner and same-owner/wrong-model version substitution; nonexistent version; forged-GUC approval; denied RPC execution; candidate manipulation and INSERT pointer injection; immutable-version grants; legitimate owner draft creation/editing/archiving |
| `f07-privileged.sql` | absent protected context with initial/NULL-reset/empty/forged GUC; approved pointer clearing; immutable version UPDATE/DELETE trigger; service-role approval/replay and owned version pointers; protected context ACL, injection denial and no residue |
| `f07-preflight-after.sql` | 40 registered versions including both repairs, approval/guard access and context prerequisites |
| `f07-fixture.sql` | synthetic `f7100000-...` identities/models/jobs/references/candidates, three actual approval RPC calls; no provider or Storage API calls |
| `f07-assertions.sql` | exact SQLSTATE/message checks; successful forbidden writes are rolled back in a subtransaction and recorded as failures; aggregate failure exception before final rollback |

Each top-level SQL group starts BEGIN, sets bounded timeouts, ends ROLLBACK and
prints a completion marker afterward. psql errors close the connection and
roll back unfinished work. Only exact expected denials count; explicitly listed
legacy FK/RLS/GUC-off rejections are also valid existing protections. Missing
objects, undefined fields and unrelated errors never count as PASS.
Client and privileged groups use independent transactions and their failures
are collected before a nonzero runner exit. BeforeRepair can NEVER emit an
overall security PASS, including if its SQL unexpectedly returns zero.
AfterRepair requires exit 0, one marker per group and no failure output.
The privileged group records whether the initial GUC is actually NULL, but
does not assume a pooled server backend has never encountered that setting.
It explicitly supplies NULL to set_config as well as testing empty/on values;
the protected context is absent in every unauthorized case.

## Operator commands and application plan

Before copying the pending migration into the staging CLI folder:

```powershell
Set-Location -LiteralPath 'C:\klay-ai-staging-tests'
powershell.exe -NoProfile -File 'C:\Users\faruk\Desktop\ai-creative-platform\tests\staging-postgres\Invoke-KlayStagingTests.ps1' -F07Diagnostic BeforeRepair
```

Expected: security failures and nonzero `$LASTEXITCODE`. Reproducing an expected
failure is not security acceptance.

In a separately authorized phase, reverify staging ref `gklpgcyndeghjgemoonk`,
Dashboard pooler metadata and `postgres.gklpgcyndeghjgemoonk`. Review/copy only
the new migration into the staging CLI folder and apply it transactionally
through the staging migration flow. Read back function owners/ACLs, the guard's
new timing/events, private schema/table privileges and data audit outcome.
Confirm all 40 versions match; do not reset or repair history. Only then:

```powershell
Set-Location -LiteralPath 'C:\klay-ai-staging-tests'
powershell.exe -NoProfile -File 'C:\Users\faruk\Desktop\ai-creative-platform\tests\staging-postgres\Invoke-KlayStagingTests.ps1' -F07Diagnostic AfterRepair
```

Expected: `F07 DIAGNOSTIC PASS` and exit 0. Any assertion, missing marker or
history mismatch blocks acceptance. These commands do not run the broader
suite. Candidate/default full modes retain 39; review their 40-version
activation only after focused acceptance.

## Local evidence and verdict

Local PowerShell/parser/mock-runner checks exercise exact 39/40 histories,
mode conflicts, isolation gates, fixed group order, failures and markers.
Application tests, lint and TypeScript are independent code checks. No SQL
migration/assertion was executed, even against a local server, because this
phase authorizes preparation only. Build is omitted because it can load
application environment configuration. No dependency was added.

Local results: nine PowerShell scripts parsed; all 25 mocked runner cases
passed, including pre-repair expected-failure and unexpected-clean results
both remaining nonzero. Parser fixtures passed for the applied 39 versions
and explicit prepared 40 versions, with malformed/missing/duplicate/mismatched
negative histories rejected. `npm test` passed its pretest and 656 discovered
tests; lint and TypeScript passed. SHA-256 checks confirm all 39 applied source
copies are unchanged and the pending version is unique and absent from the
staging CLI directory. These are local results, not PostgreSQL acceptance.

READY for review and a separately authorized controlled staging application.
Security signoff is BLOCKED until AfterRepair passes real PostgreSQL assertions.
Remaining work: broader authenticated RLS; candidate approval concurrency and
leases; durable image fencing/reconciliation; edit/reanalysis admission;
financial reservation/settlement/refund/expiry; private Storage API access;
and full multi-session integration. The prior candidate ownership PASS is
evidence only for its specific operator-executed diagnostic.

## Files prepared or updated in this phase

New migration: `database/migrations/20261101030000_harden_approved_model_profile_integrity.sql`.

Under `tests/staging-postgres/`:

- New: `Invoke-KlayF07Diagnostic.ps1`, `f07-preflight-after.sql`,
  `f07-client.sql`, `f07-privileged.sql`, `f07-fixture.sql`,
  `f07-assertions.sql`, `phase-7f10-f07.md`.
- Updated: `Invoke-KlayStagingTests.ps1`, `fixture-residue-audit.sql`,
  `model-client-privileges.sql`, `Test-KlayMigrationHistory.ps1`,
  `Test-KlayStagingRunner.ps1`, `README.md`, and the superseded
  `proposals/f07_harden_model_profile_transition.sql`.
