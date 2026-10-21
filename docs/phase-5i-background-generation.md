# Phase 5I — durable background generation

## Current behavior before this phase

Image creation persisted a `queued` `generations` row and then awaited the full
OpenAI, validation, optional repair, and Storage workflow inside the initiating
server action.  A request timeout, navigation interruption, or deployment could
therefore leave a queued record or end the request without a durable executor.
The browser polling controls only presented status; it did not execute work.

Video rows already use a separate durable request id, private Storage, a
PostgreSQL reconciliation lease, and fenced reconciliation writes. Its scheduler
is intentionally disabled while billing is not production-approved.

## Architecture and deployment status

Image submission now persists a user-owned `client_submission_id` before any
provider call. A partial unique index returns the existing job for a transport
retry. The SQL claim function uses `FOR UPDATE SKIP LOCKED`, a bounded lease,
and monotonic lease version. The complete creative pipeline now lives in the
server-only `image-worker-service.ts`; the dashboard action is a submission
facade and never invokes inference.

`POST /api/internal/image-generation-worker` accepts only a constant-time Bearer
secret and is disabled unless `IMAGE_GENERATION_WORKER_ENABLED=true`. When
enabled, it claims at most one job and executes it through the server-only
pipeline. Every worker-owned transition is conditional on the claim token,
version, and unexpired lease.

Provider submission is checkpointed as `submitting` immediately before each
OpenAI call and `submitted` only after a response is durably observed. A lost
response becomes `reconciliation_required`/`ambiguous` while the lease is still
valid. If the lease expires first, fenced writes fail and the row remains
`processing`/`submitting`; neither form is eligible for automatic claim. A
confirmed pre-submission interruption remains `not_started` and may be reclaimed.
Stored output uses the stable generation object path with `upsert: false`, so a
finalization retry cannot silently replace an existing result.

## Deployment requirements

No production hosting or cron configuration exists in this repository. Keep
`IMAGE_GENERATION_WORKER_ENABLED` unset until an independent Node executor or a
scheduled environment with a request/runtime limit of at least 300 seconds is
configured. It needs `IMAGE_GENERATION_WORKER_SECRET`, the existing Supabase
service-role credentials, OpenAI credentials, and private Storage access.
Concurrency is one job per invocation. Schedule invocations no faster than the
platform can finish them. Jobs in `ambiguous`, `submitted` without a terminal
state, or with a stored object but incomplete finalization require operator
reconciliation; they must never be automatically submitted to OpenAI again.

Apply `20261027000000_add_durable_image_generation_jobs.sql` followed by
`20261028000000_add_image_reconciliation_state.sql` in staging first. Neither
migration is deployed by this change.

## Explicit non-changes

No OpenAI model, prompt, image-quality/canvas setting, fidelity threshold,
automatic repair policy, storage contract, video model flag, video scheduler,
or credit reservation/settlement was activated or changed.
