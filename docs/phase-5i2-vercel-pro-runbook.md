# Phase 5I.2 — Vercel Pro deployment runbook

## Runtime contract

- Vercel Pro hosts the Next.js Node.js Functions. Fluid Compute must remain enabled.
- Supabase PostgreSQL is the queue/claim/fencing authority; Storage holds private inputs and outputs.
- `/api/cron/image-generation` is a GET adapter for Vercel Cron. It calls the shared worker handler directly and never makes a loopback HTTP request.
- `/api/internal/image-generation-worker` remains a separately authenticated POST entry point for controlled validation.
- Both routes are disabled unless `IMAGE_GENERATION_WORKER_ENABLED=true`.
- Each invocation claims at most one job. One-minute cron delivery may overlap; PostgreSQL `SKIP LOCKED` claims remain authoritative.
- Function duration is 780 seconds. The renewable database lease is 750 seconds, renewed every 60 seconds while an image provider call is pending. OpenAI image calls have a 300-second timeout and SDK retries disabled.
- Cron delivery is neither timely nor exactly once. Normal visible queue latency is approximately 0–2 minutes, plus execution time.

## Environment checklist

Production server/runtime variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` — sensitive, server-only
- `OPENAI_API_KEY` — sensitive, server-only
- `IMAGE_GENERATION_WORKER_SECRET` — sensitive; controlled POST invocation only
- `CRON_SECRET` — sensitive; Vercel adds it as `Authorization: Bearer …` to cron GET requests
- `IMAGE_GENERATION_WORKER_ENABLED=false` until staging validation and production approval

Keep Preview connected to an isolated Supabase project and separate OpenAI/worker secrets. Keep the worker flag false in Production during initial deployment. Never create `NEXT_PUBLIC_` versions of worker, OpenAI, cron, or Supabase secret credentials. Video flags and secrets remain separate and disabled.

## Read-only migration verification

Run these against the linked database before applying anything:

```sql
select version from supabase_migrations.schema_migrations
where version in ('20261026000000', '20261027000000', '20261028000000', '20261029000000')
order by version;

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'generations'
  and column_name in (
    'execution_lease_token', 'execution_lease_expires_at',
    'execution_lease_version', 'execution_attempts',
    'provider_submission_state', 'provider_submission_started_at',
    'provider_submission_phase'
  )
order by column_name;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('claim_queued_image_generations', 'renew_image_generation_lease');

select indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename = 'generations'
  and indexname like 'generations_image_%'
order by indexname;
```

Apply missing migrations in timestamp order in staging, then Production only after review. Never rewrite a version already recorded as applied.

## Read-only operations

```sql
select id, owner_id, project_id, status, provider_submission_state,
       provider_submission_phase, execution_attempts,
       execution_lease_version, execution_lease_expires_at,
       output_bucket_id, output_object_path, error_message,
       created_at, updated_at
from public.generations
where generation_type = 'image'
  and status in ('queued', 'processing', 'reconciliation_required')
order by created_at
limit 100;
```

Use Vercel production logs filtered by `[image-worker]`, `[generation]`, and the generation ID. Logs deliberately exclude prompts, media, credentials, and signed URLs.

## Recovery rules

- **Queued:** confirm migrations, feature flag, cron registration, and recent cron logs. It is safe for the normal claimant to execute only when submission state is `not_started`/null.
- **Function timeout or pre-provider crash:** `not_started` may be reclaimed after lease expiry. Do not manually reset other submission states.
- **Crash/lease loss during inference:** `submitting` is uncertain and excluded from automatic claims. Do not resend. Escalate for manual reconciliation.
- **Lost provider response:** treat as ambiguous even if no provider request ID is available. OpenAI does not provide a recovery guarantee assumed by this system.
- **Submitted without terminal state:** do not run provider inference again. Inspect checkpoints and Storage.
- **Output saved, finalization failed:** verify the private object matches the stable generation path and expected MIME/dimensions, then use a separately reviewed operator procedure to finalize the existing output. Never regenerate automatically.
- **`reconciliation_required`:** preserve the row and lease history; resolve only with documented operator evidence.
- **Duplicate cron invocations:** take no action. `SKIP LOCKED`, token/version fencing, and batch size one handle overlap.
- **Database/Storage outage:** allow confirmed `not_started` jobs to retry after lease expiry. Any job at or beyond `submitting` requires reconciliation.

## Manual deployment sequence

1. Confirm Vercel Pro and Fluid Compute are enabled; do not opt into the 1,800-second beta for this worker.
2. Run the read-only schema queries above.
3. Apply missing migrations `20261026000000` through `20261029000000` in staging, in order.
4. Configure isolated Preview/Staging variables with `IMAGE_GENERATION_WORKER_ENABLED=false`.
5. Deploy and confirm both worker routes return `401` without credentials and `503` with valid credentials while disabled.
6. Use mocked/provider-disabled validation to verify empty queue and duplicate cron behavior.
7. Enable the worker only in staging under explicit approval; observe one job, lease renewals, output checkpoint, and terminal fencing.
8. Verify tab close/navigation has no effect and no duplicate provider submission occurs.
9. Apply verified migrations to Production.
10. Deploy Production with the worker flag still false. Confirm the cron is registered and harmlessly returns disabled.
11. Set Production secrets, then enable the flag only under a separate production-inference approval.

Video reconciliation can later use the same GET-adapter pattern, but remains disabled and billing-gated in this phase.
