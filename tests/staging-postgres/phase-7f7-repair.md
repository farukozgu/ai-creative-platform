# Phase 7F.7: candidate ownership trigger correction

Phase 7F.9 update: the operator reports the correction applied and all 39
Local/Remote versions matched. The runner, parser and SQL preflight now enforce
39 versions; `-CandidateOwnershipDiagnostic` selects only preflight, the
read-only residue audit and the rollback regression. This update has not run
the remote diagnostic. The source investigation below records Phase 7F.7.

Phase 7F.7 status: prepared for a controlled staging application. No remote
connection, SQL execution, migration, or cleanup was performed in that phase.
The runtime failures and independent Storage metadata pass are operator-reported
results. They do not establish a pass for any group blocked by fixture setup.

## Source and root cause

The sole historical definition of `public.enforce_model_candidate_ownership()`
is in `database/migrations/20261031030000_harden_model_candidate_integrity.sql`.
All 38 historical repository migrations match the dedicated staging copies by
SHA-256. No later historical migration replaces this function.

The same function backs two `BEFORE INSERT OR UPDATE FOR EACH ROW` triggers:

| Trigger | Table | Fields relevant to validation |
| --- | --- | --- |
| `model_candidate_jobs_owner_guard` | `public.model_candidate_jobs` | `id`, `model_id`, `user_id`; **no `job_id`** |
| `model_candidates_owner_guard` | `public.model_candidates` | `job_id`, `model_id`, `user_id` |

The first failing statement is the multi-row job INSERT in `fixture-base.sql`.
The SQL condition combines `TG_TABLE_NAME = 'model_candidates'` with a subquery
that references `NEW.job_id`. PostgreSQL must resolve record fields when it
prepares that SQL expression; a false table-name predicate does not make an
absent field valid. This is a database trigger defect, not a fixture ownership
mismatch. Boolean expressions are not procedural branches. See PostgreSQL's
[expression evaluation rules](https://www.postgresql.org/docs/current/sql-expressions.html#SYNTAX-EXPRESS-EVAL)
and [PL/pgSQL statement preparation](https://www.postgresql.org/docs/current/plpgsql-implementation.html#PLPGSQL-PLAN-CACHING).

## Additive migration

`database/migrations/20261101020000_fix_model_candidate_ownership_trigger.sql`
is the next unique version after `20261101010000`. It replaces only this
trigger function and reuses both existing trigger attachments.

The migration rejects missing dependencies, unexpected/disabled trigger
attachments, an unexpected SECURITY DEFINER definition, and existing
job/candidate ownership inconsistencies. It then branches on the table name
before accessing the row's fields. Only the candidate branch references
`NEW.job_id`. Both branches preserve the original model-owner validation;
the candidate branch additionally preserves the exact job-model-owner match.
It rejects unsupported schema, table, timing, level, operation, or trigger
arguments before accessing fields that may be unavailable.

This is a targeted repair of the existing validation semantics. It does not
add a general parent-row reparenting policy or a new concurrency guarantee.
RLS, table grants, reference-evidence checks, approved identity immutability,
approval RPCs, and lease RPCs are unchanged. The function remains SECURITY
INVOKER with an empty search_path and schema-qualified table references.
CREATE OR REPLACE preserves its owner, ACL, and trigger dependencies. No new
EXECUTE privilege or elevated execution context is introduced. Actual deployed
ACLs still need a staging catalog check; they were not queried in this phase.

## Fixture validation and residue

The shared fixture's graph is internally consistent:

| Owner suffix | Model suffix | Job suffix | Candidate suffix | Reference suffix |
| --- | --- | --- | --- | --- |
| `001` | `021` | `031` | `061` | `051` |
| `002` | `022` | `032` | `062` | `052` |
| `001` | `021` | `033` (queued) | none | none |

All IDs above have prefix `f7f50000-0000-4000-8000-000000000`.
The extra draft model `023` belongs to owner `001`. The concurrency owner
`901`, model `905`, and jobs `906`/`907` likewise agree. No fixture relationship
change is required to correct this error.

Every group including `fixture-base.sql` starts an explicit bounded transaction
and ends with ROLLBACK. On an ON_ERROR_STOP failure, psql closes its connection
and PostgreSQL rolls back the unfinished transaction. The concurrency setup
also starts with BEGIN; its job INSERT fails before COMMIT. Therefore the
reported failure should leave no committed setup rows even though the harness
does not mark the fixture as created or call its cleanup path.

`fixture-residue-audit.sql` is a prepared, read-only audit of exact reserved
identity IDs and markers. It is not run automatically. Under a separately
verified staging connection, zero returned rows plus the PASS notice is the
expected outcome. If any identity appears, stop and inspect its exact marker
and dependencies. Do not delete mismatched identities. The existing
`concurrency-cleanup.sql` can remove only owner `901` with email
`klay-concurrency@staging.invalid` and marker `phase-7f5-concurrency`; use it
only after staging isolation and stopped test sessions are confirmed. No
cleanup is currently indicated by the reported pre-COMMIT failure.

## Staging verification plan (not executed)

1. Reverify `C:\klay-ai-staging-tests`, ref `gklpgcyndeghjgemoonk`, the
   Dashboard pooler host, and `postgres.gklpgcyndeghjgemoonk`. Stop on any
   mismatch; never obtain connection credentials from the application env.
2. Review/copy only the new migration into the dedicated staging migration
   directory. Apply it as one transaction through the authorized staging
   migration flow. Do not edit/repair history or use a reset.
3. Read back the function, SECURITY INVOKER property, owner/ACL, and both
   trigger definitions. Confirm version `20261101020000` and the complete
   expected **39** migration versions locally and remotely.
4. Phase 7F.9 aligns the runner/parser/preflight with exactly 39 versions and
   requires the repair version. Use `-CandidateOwnershipDiagnostic` for the
   first run; the full suite remains a separate operator choice.
5. Run the read-only residue audit, then `candidate-ownership-regression.sql`
   as a small independent group under the verified staging connection. It
   uses fresh `f7f70000-...` synthetic IDs and rolls back, without approval or
   F-07 dependencies. Test valid job/candidate INSERT and UPDATE, mismatched
   model/owner and job/model/owner relationships, missing parents, unexpected
   attachment, authenticated owner read isolation, and denied job insertion.
   Negative assertions accept only the exact expected trigger error; a new
   undefined-field error cannot be mistaken for a PASS.
6. Only after that group passes, rerun the original groups in controlled
   batches. Stop each affected group on an integrity failure. F-07 tests are
   still expected to expose their independent defect. No workers or provider
   calls are needed.

## F-07 compatibility review

The F-07 proposal replaces `enforce_model_profile_transition()`, a different
function. It does not share this trigger's record-shape problem, and this
migration does not change its signature or approval flow. Approved candidate
fixtures invoke the SECURITY DEFINER approval RPC under SET ROLE service_role;
that RPC sets the approval GUC before its profile updates. This remains the
intended context to verify for the separate F-07 proposal.

The F-07 proposal remains unapplied and is not part of this migration. Its
`trusted_approval` expression can be NULL when the approval GUC is unset in a
service_role context; `IF ... AND NOT trusted_approval` would then not reject.
Make that flag explicitly false for missing context in the separate F-07
repair, and test the actual caller/SECURITY DEFINER role context. Approved
status downgrade and identity pointer tests still require that independent
correction. Do not regard fixing `job_id` as resolving F-07.

## Validation and verdict

Local application tests, lint, TypeScript, migration version/hash checks, and
PowerShell parsing are recorded in the phase response. SQL was reviewed
against the actual migration contracts, but no PostgreSQL server/parser was
available in this execution environment; SQL compilation and the new SQL
regression assertions have not run. No dependencies were added.

The correction's application is now operator-reported. The post-application
PostgreSQL diagnostic is the acceptance gate and remains unexecuted by this
agent. The 39-version baseline is prepared; Model Studio security acceptance
still requires the separate F-07 fix.
