# Klay AI staging PostgreSQL integration suite

Phase 7F.10: [the separate F-07 repair and diagnostic plan](phase-7f10-f07.md)
prepares migration `20261101030000` without applying it. Use
`-F07Diagnostic BeforeRepair` with the applied 39-version baseline, or
`-F07Diagnostic AfterRepair` only after an authorized application and exact
40-version history. BeforeRepair never reports a security PASS. These modes
run only migration preflight, residue audit, and focused client/privileged
rollback groups. Candidate-only and default full-suite modes remain pinned
to 39; they cannot silently accept the pending migration.

Phase 7F.9: the operator reports migration `20261101020000` applied to staging
and 39 matching Local/Remote versions. The runner now enforces that exact
39-migration baseline. The operator subsequently reported candidate ownership
diagnostic PASS. See [the trigger repair review](phase-7f7-repair.md).

This opt-in suite targets only the verified staging database. It has not been
run against staging in this preparation phase. It does not call OpenAI, fal.ai,
Storage APIs, video providers, billing providers, or background workers.

## Safety and execution prerequisites

The runner explicitly changes to `C:\klay-ai-staging-tests` and fails closed
unless its linked ref is `gklpgcyndeghjgemoonk`, the local pooler metadata has
the project-qualified user `postgres.gklpgcyndeghjgemoonk`, its host is the
Dashboard-verified `aws-0-eu-west-1.pooler.supabase.com:5432`, and all 39 local
and remote migration versions match. The runner asks the operator to confirm
the host against the staging Dashboard before requesting a database password.
It never reads the application `.env.local` or changes either Supabase link.
The protected ref `fnzrnlvpkzwztccqzyzf` is never a permitted target.

Install PostgreSQL client tools for Windows and ensure `psql.exe` is on PATH.
Install or expose the Supabase CLI on PATH, and authenticate that CLI for the
staging project. The suite uses remote `psql` directly; it does not need Docker
or pgTAP. The password is collected as a SecureString and passed through the
child process environment for the run. It is not placed in arguments, files,
reports, or output. Existing `PG*` values are saved only for restoration and
are overridden/cleared before psql starts. Connection, statement, and lock
timeouts are bounded.

Native command output is handled by `Invoke-KlayNativeCommand.ps1`. Windows
PowerShell 5.1 can promote routine native stderr to PowerShell error records;
the helper uses `Continue` only during that invocation, retains the output,
restores the caller's preference, and treats the native process exit code as
the success signal. PowerShell 7 uses a different native stderr model, but the
same captured-output and exit-code checks apply. Nonzero CLI or psql exits
still stop or fail their group.

The local native-process regression check (no database connection) is:

```powershell
& 'C:\Users\faruk\Desktop\ai-creative-platform\tests\staging-postgres\Test-KlayNativeCommand.ps1'
```

For the first post-repair diagnostic, run exactly:

```powershell
Set-Location -LiteralPath 'C:\klay-ai-staging-tests'
powershell.exe -NoProfile -File 'C:\Users\faruk\Desktop\ai-creative-platform\tests\staging-postgres\Invoke-KlayStagingTests.ps1' -CandidateOwnershipDiagnostic
```

The switch runs only the linked migration-history gate, `preflight.sql`, the
read-only `fixture-residue-audit.sql`, and `candidate-ownership-regression.sql`.
The usual Dashboard confirmation and secure staging-password prompt remain.
The diagnostic returns before all broader groups and the concurrency harness.
Do not omit the switch for this first run. Omitting it selects the existing
full suite, which includes the independent F-07 probes.

Each SQL file must exit 0 and emit its exact completion marker after ROLLBACK.
The diagnostic stops on the first failure, missing/duplicate marker, or
`ASSERTION FAILED` output. Only after all three succeed does it print
`CANDIDATE OWNERSHIP DIAGNOSTIC PASS`. The child PowerShell process returns
exit 0 for success; any uncaught failure returns nonzero, visible in the
operator's `$LASTEXITCODE`. A few earlier PASS notices do not establish an
overall pass. The candidate transaction explicitly rolls back; if SQL fails,
ON_ERROR_STOP closes the psql connection and its unfinished transaction is
rolled back by PostgreSQL. No cleanup mutation is run by this diagnostic.

Local-only regression checks are `Test-KlayMigrationHistory.ps1`,
`Test-KlayNativeCommand.ps1`, and `Test-KlayStagingRunner.ps1`. The runner test
uses local child PowerShell processes with fake CLI/psql tools and metadata;
it never connects to a database. It verifies the fixed diagnostic sequence,
39-version history, failure exits, no false final PASS, connection gates,
timeout/ON_ERROR_STOP arguments, and environment/directory restoration.

Every Supabase CLI command is run with the current directory explicitly set to
`C:\klay-ai-staging-tests`. Do not run `supabase link`, migration commands,
reset, repair, or push as part of these tests. The runner's only CLI database
operation is the read-only linked migration history check. The custom psql
suite is used for remote bounded transactions and real multi-session tests.
See the [Supabase CLI test reference](https://supabase.com/docs/reference/cli/supabase-test)
and [testing and linting guide](https://supabase.com/docs/guides/local-development/cli/testing-and-linting).

## SQL roles and isolation

| Role/context | Used by | Purpose |
| --- | --- | --- |
| `postgres` connection role | SQL fixture creation, schema/catalog checks, expected privileged F-07 probe | Creates isolated synthetic rows; all ordinary SQL groups roll back. It is not evidence of authenticated RLS behavior. |
| `authenticated` via `SET LOCAL ROLE` and Supabase JWT claim GUCs | `authenticated-rls.sql`, model client probes, `transactional-smoke.sql` | Exercises PostgreSQL grants, policies, triggers, and `auth.uid()` as two distinct synthetic users. |
| `anon` via `SET LOCAL ROLE` | `authenticated-rls.sql`, function grant assertions | Verifies private row access and approval RPC are denied. |
| `service_role` via `SET LOCAL ROLE` | Fixture approval and worker/admission/credit RPC groups | Exercises service-only function grants and privileged transactional paths. This does not represent a browser client. |

`authenticated-rls.sql` sets both `request.jwt.claim.sub` and
`request.jwt.claims` to match Supabase's PostgREST role/JWT context. It does not
prove application login/session token handling. Every ordinary SQL group
starts a bounded transaction and ends with `ROLLBACK`; inserted fixture rows
are fixed synthetic UUIDs and `@staging.invalid` identities. A collision
causes a visible failure instead of overwriting existing rows.

The separate concurrency harness commits one specifically marked synthetic
identity because independent connections cannot share a rollback transaction.
It deletes only that identity after the sessions stop and PostgreSQL cascades
its dependent fixture rows. If PowerShell is forcibly terminated, do not run a
broad cleanup. Reverify the staging ref, inspect the exact marker
`phase-7f5-concurrency`, and use the exact-ID cleanup in
`concurrency-cleanup.sql` only after confirming no harness session remains.

## Test groups and coverage

| Security/correctness invariant | Test file(s) | Expected assertion |
| --- | --- | --- |
| Installed migration count | `preflight.sql` plus runner history comparison | Exactly 39 distinct registered versions including `20261101020000`, exact local/remote/filename equality, no duplicate or unmatched rows. |
| Applied candidate ownership repair | `candidate-ownership-regression.sql` via `-CandidateOwnershipDiagnostic` | Valid INSERT/UPDATE, mismatched/missing parents, unsupported temporary trigger contexts, and narrow authenticated checks; rollback only. SQL assertions still require operator execution. |
| Owner RLS and cross-user denial across projects, assets, generations, models, candidates/jobs, reference metadata, identity-version references, notifications, video source registrations, subscriptions, grants, and credit records | `authenticated-rls.sql` | User A and B can see only their own rows; anon cannot read private projects. |
| Cross-owner write denial | `transactional-smoke.sql`; `model-client-pointer.sql` | Foreign ownership insert/transfer and foreign identity pointer are rejected. The pointer probe currently exposes F-07 and is expected to fail against the present trigger. |
| Candidate approval and owner consistency | `fixture-base.sql`, `transactional-smoke.sql`, `candidate-leases.sql` | Service RPC binds approved profile/version/reference to the candidate owner; mismatched candidate/job owners are rejected; replay returns same version. |
| Approved model status and identity pointer integrity (F-07) | `model-client-status.sql`, `model-client-pointer.sql`, `transactional-smoke.sql` | Authenticated downgrade/pointer writes and privileged direct GUC approval must be denied. Source inspection shows current SQL permits approved-to-draft/archive and foreign pointer changes; these assertions should FAIL until corrected. |
| Approval RPC and immutable identity permissions | `model-client-privileges.sql`, `transactional-smoke.sql` | anon/authenticated cannot execute service-only approval/claim RPCs or mutate immutable identity versions. |
| Candidate claim exclusivity, renewal, stale token and expired lease fencing | `candidate-leases.sql`, concurrent candidate sessions | One job is claimed once; valid renewal succeeds; stale/expired lease cannot renew; `SKIP LOCKED` sessions receive different jobs. |
| Durable image idempotency and lease fencing | `image-leases.sql` | Duplicate owner/submission key fails; renewal works; reclaim issues a newer token/version; old lease is fenced; ambiguous submission is not auto-claimed. |
| Image-edit replay, payload conflict, active limit and ambiguity accounting | `admissions.sql` | Same key/fingerprint replays; changed fingerprint conflicts; third active request hits limit 2; reconciliation remains active; stale transition denied. |
| True concurrent image-edit limit | `Invoke-AdmissionConcurrency.ps1` and `concurrency-edit-*.sql` | Three separate service-role sessions contend behind a database advisory lock; exactly two admit and one hits capacity. This is not simulated by sequential calls. |
| Product reanalysis owner, replay, active limit, ambiguity and cooldown | `admissions.sql` | Active limit 1, cross-owner denial, ambiguity replay protection, cooldown, then a new fenced admission after cooldown expiry. |
| Credit grants, reservation, settlement, release, refund, expiry, accounting | `credit-lifecycle.sql` | RPC outcomes/idempotency, insufficient balance, expired-source refund treatment, account/source conservation, and ledger reconciliation. Runs only with synthetic billing event rows and no billing provider. |
| Private Storage bucket/policy metadata | `storage-metadata.sql` | Five buckets are private; storage.objects RLS and expected owner/path policies exist; authenticated model-reference uploads are absent. |

Each SQL assertion emits `NOTICE: PASS`; assertion failures raise an exception
with `ASSERTION FAILED`. `psql -v ON_ERROR_STOP=1` returns nonzero, the runner
prints `GROUP FAIL`, continues collecting independent group outcomes, and
ends nonzero if any group fails. A SQL command completing is not itself a
PASS. Do not interpret a suite run with any FAIL as passing.

## Storage API test strategy and limits

`storage-metadata.sql` checks catalog policy definitions only. It does not
establish Storage API authorization. For a later API verification, use the two
synthetic Auth users and short-lived user access tokens, upload a tiny inert
PNG under a unique per-run path in a private product bucket using each user's
normal authenticated Storage API, verify own download succeeds and the other
user's download is denied, and verify a user cannot upload to the model
reference bucket. Remove only the exact per-run object paths through the API
and expire/sign out the synthetic sessions. Do not put a service-role key in
the client or report. This API test is not implemented in this SQL suite and
requires a separately reviewed API harness before claiming end-to-end Storage
authorization coverage.

## Findings and limits

F-07 is confirmed by source inspection of the applied staging migration files:
the authenticated `model_profiles` update policy allows `draft` and `archived`,
while `enforce_model_profile_transition()` forbids restoring archived profiles
and gates entry into `approved`, but does not forbid leaving `approved`. The
trigger also does not validate `current_identity_version_id` ownership. An
authenticated owner can therefore downgrade its approved profile and change
its pointer to a known foreign version. The ability to set `app.model_approval`
does not, by itself, bypass the authenticated RLS `WITH CHECK` that prevents
direct entry into `approved`; the privileged regression probe separately
demonstrates why a caller-set GUC is not a trustworthy approval boundary.

An additive replacement proposal is at
`proposals/f07_harden_model_profile_transition.sql`. It is a proposal only,
has not been applied, and needs migration review plus targeted tests. Do not
edit historical migrations or apply it in this verification-preparation
phase.

Known untested behavior: Storage API authorization, actual browser/PostgREST
session plumbing, SQL execution against staging, and any provider or worker
integration. No test in this suite invokes paid inference, video generation,
image editing, background workers, or billing providers.

## Result capture

Keep the local console output for diagnosis. Redact email addresses, project
host if needed, operator paths, and any environment or CLI-auth details before
sharing. Never capture the SecureString prompt, `PGPASSWORD`, connection URIs,
passwords, access tokens, or service-role keys. This phase has not executed
remote SQL; local application test results must not be described as PostgreSQL
integration results.
# Failed F07 migration transaction review

With confirmed ABSENT state, use [the pinned atomic CLI plan](phase-7f10-7-atomic-cli-plan.md).
Its compatibility-review mode stops before application and requires explicit CLI 2.114.0.

For pending-history parsing and automatic read-only state classification, use
[the Phase 7F.10.5 inspection instructions](phase-7f10-5-inspection.md).

If version 20261101030000 failed with SQLSTATE 25P01, stop retries and follow
[the read-only state inspection plan](phase-7f10-3-transaction-review.md).
Use `-F07MigrationStateInspection` only for history/catalog evidence. It cannot
run fixtures or certify F07 security. Do not edit the pending migration until
its remote application state has been confirmed.

