-- READ ONLY. Run only in staging AFTER the separate pipeline migration is reviewed/applied.
-- This task does not apply the migration or run this script against a live database.
select p.proname, p.prosecdef, p.proconfig,
  has_function_privilege('anon', p.oid, 'execute') as anon_must_be_false,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_must_be_false,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_must_be_true
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in
  ('claim_ugc_submission', 'claim_ugc_reconciliation', 'is_ugc_claim_current', 'finish_ugc_claim');

select c.conname, pg_get_constraintdef(c.oid)
from pg_constraint c where c.conrelid = 'public.ugc_video_jobs'::regclass
  and c.conname in ('ugc_pipeline_plan_check', 'ugc_video_jobs_result_check', 'ugc_video_jobs_owner_idempotency_unique');

select indexname, indexdef from pg_indexes where schemaname = 'public'
  and tablename = 'ugc_video_jobs'
  and indexname in ('ugc_pipeline_provider_task_unique', 'ugc_video_jobs_one_active_per_project_idx');

select id, public as must_be_false, file_size_limit, allowed_mime_types
from storage.buckets where id in ('ugc-product-assets', 'ugc-generated-videos');

-- Review with isolated fixture owners/jobs in staging, with no provider credentials:
-- 1. Race two claim_ugc_submission calls for the same job: exactly one receives a row.
-- 2. Race different draft jobs/keys for one project: the active-project index admits one.
-- 3. Reject owner/hash mismatch and a plan whose snapshotDigest differs from p_hash.
-- 4. Expire a lease, reclaim reconciliation, then prove an old token/version cannot finish.
-- 5. Expired submission with no task must become ambiguous, never draft/queued for resubmit.
-- 6. Reject task-ID replacement, route/plan mutation, processing->queued and terminal reopening.
-- 7. Commit success with ALL required metadata atomically; reject wrong owner/project/job path,
--    MIME, size, duration and missing task. Verify owner/non-owner Storage RLS independently.
-- 8. Call every RPC as anon/authenticated: permission denied. Never grant those roles execution.
