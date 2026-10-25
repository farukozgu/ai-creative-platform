-- READ ONLY. Run only in staging after both UGC migrations have been applied.
-- Core deployment checks are mandatory. Optional reference audio is reported separately
-- and does not fail core video readiness while the feature remains disabled.
with checks(check_name, status, details) as (
  values
    ('pipeline_columns',
      case when (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'ugc_video_jobs'
        and column_name = any(array['provider_plan','submission_started_at','lease_token','lease_version','lease_expires_at','reconciliation_attempts','next_poll_at'])) = 7
        then 'PASS' else 'FAIL' end,
      'All seven pipeline plan, submission, lease and reconciliation columns are installed'),
    ('plan_model_allowlist',
      case when exists (select 1 from pg_constraint c where c.conrelid = to_regclass('public.ugc_video_jobs') and c.conname = 'ugc_pipeline_plan_check'
        and pg_get_constraintdef(c.oid) like '%kling-v3-pro-image%'
        and pg_get_constraintdef(c.oid) like '%seedance-2.5-reference%'
        and pg_get_constraintdef(c.oid) like '%bytedance/seedance-2.0/mini/reference-to-video%'
        and pg_get_constraintdef(c.oid) like '%bytedance/seedance-2.5/reference-to-video%'
        and pg_get_constraintdef(c.oid) like '%durationSeconds%'
        and pg_get_constraintdef(c.oid) like '%aspectRatio%'
        and pg_get_constraintdef(c.oid) like '%resolution%'
        and pg_get_constraintdef(c.oid) like '%generateAudio%'
        and pg_get_constraintdef(c.oid) like '%tier%') then 'PASS' else 'FAIL' end,
      'Kling v1, Seedance Mini v3 and Seedance Premium v2 allowlists exist'),
    ('snapshot_route_binding',
      case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'ugc_pipeline_plan_matches_snapshot'
            and p.provolatile = 'i' and p.proconfig @> array['search_path=""']
            and pg_get_functiondef(p.oid) like '%kling-v3-pro-image%'
            and pg_get_functiondef(p.oid) like '%seedance-2.5-reference%'
            and pg_get_functiondef(p.oid) like '%bytedance/seedance-2.0/mini/reference-to-video%'
            and pg_get_functiondef(p.oid) like '%bytedance/seedance-2.5/reference-to-video%'
            and not has_function_privilege('anon', p.oid, 'execute')
            and not has_function_privilege('authenticated', p.oid, 'execute')
            and has_function_privilege('service_role', p.oid, 'execute'))
        and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'claim_ugc_submission'
            and pg_get_functiondef(p.oid) like '%ugc_pipeline_plan_matches_snapshot%'
            and pg_get_functiondef(p.oid) like '%provider route does not match immutable request%') then 'PASS' else 'FAIL' end,
      'Submission claim binds provider/model/endpoint to immutable snapshot'),
    ('route_guard_and_plan_immutability',
      case when exists (select 1 from pg_trigger where tgrelid = to_regclass('public.ugc_video_jobs')
          and tgname = 'ugc_pipeline_guard' and not tgisinternal
          and pg_get_triggerdef(oid) like '%BEFORE INSERT OR UPDATE%')
        and exists (select 1 from pg_proc p join pg_trigger t on t.tgfoid = p.oid
          where t.tgrelid = to_regclass('public.ugc_video_jobs') and t.tgname = 'ugc_pipeline_guard'
            and pg_get_functiondef(p.oid) like '%provider plan is immutable%'
            and pg_get_functiondef(p.oid) like '%provider identity is immutable%'
            and pg_get_functiondef(p.oid) like '%provider task identity is immutable%'
            and pg_get_functiondef(p.oid) like '%Terminal UGC output is immutable%')
        and exists (select 1 from pg_proc p join pg_trigger t on t.tgfoid = p.oid
          where t.tgrelid = to_regclass('public.ugc_video_jobs') and t.tgname = 'ugc_video_jobs_set_timestamps'
            and pg_get_functiondef(p.oid) like '%Terminal UGC jobs cannot be reopened%') then 'PASS' else 'FAIL' end,
      'Claimed route, task identity and terminal output are immutable'),
    ('safe_claim_rpcs',
      case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname in ('claim_ugc_submission', 'claim_ugc_reconciliation', 'is_ugc_claim_current', 'finish_ugc_claim')
            and p.prosecdef and p.proconfig @> array['search_path=""']) = 4
        and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname in ('claim_ugc_submission', 'claim_ugc_reconciliation', 'is_ugc_claim_current', 'finish_ugc_claim')
            and not has_function_privilege('anon', p.oid, 'execute')
            and not has_function_privilege('authenticated', p.oid, 'execute')
            and has_function_privilege('service_role', p.oid, 'execute')) = 4 then 'PASS' else 'FAIL' end,
      'All four fenced RPCs are SECURITY DEFINER, fixed search_path, service_role only'),
    ('atomic_submission_claim',
      case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'claim_ugc_submission'
          and pg_get_functiondef(p.oid) like '%for update skip locked%'
          and pg_get_functiondef(p.oid) like '%owner_id = p_owner%'
          and pg_get_functiondef(p.oid) like '%request_hash = p_hash%'
          and pg_get_functiondef(p.oid) like '%status = ''draft''%'
          and pg_get_functiondef(p.oid) like '%lease_version = lease_version + 1%'
          and pg_get_functiondef(p.oid) like '%provider route does not match immutable request%') then 'PASS' else 'FAIL' end,
      'Definition includes row locking, owner/hash/draft checks and route pinning before lease update'),
    ('reconciliation_lease_fencing',
      case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'claim_ugc_reconciliation'
          and pg_get_functiondef(p.oid) like '%for update skip locked%'
          and pg_get_functiondef(p.oid) like '%owner_id = p_owner%'
          and pg_get_functiondef(p.oid) like '%lease_version = lease_version + 1%'
          and pg_get_functiondef(p.oid) like '%reconciliation_attempts = reconciliation_attempts + 1%')
        and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'finish_ugc_claim'
            and pg_get_functiondef(p.oid) like '%lease_token = p_token%'
            and pg_get_functiondef(p.oid) like '%lease_version = p_version%'
            and pg_get_functiondef(p.oid) like '%lease_expires_at > clock_timestamp()%') then 'PASS' else 'FAIL' end,
      'Definitions include row locking, owner checks and token/version/expiry fencing'),
    ('ambiguous_task_completion',
      case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'claim_ugc_reconciliation'
          and pg_get_functiondef(p.oid) like '%status = ''provider_submission_ambiguous'' and provider_request_id is not null%')
        and exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'finish_ugc_claim'
            and pg_get_functiondef(p.oid) like '%status = ''provider_submission_ambiguous'' and provider_request_id is not null%'
            and pg_get_functiondef(p.oid) like '%if j.status = ''provider_submission_ambiguous'' and p_status = ''queued''%') then 'PASS' else 'FAIL' end,
      'Ambiguous rows with known task IDs can finish reconciliation without status regression'),
    ('atomic_private_terminal_output',
      case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'finish_ugc_claim'
          and pg_get_functiondef(p.oid) like '%p_output->>''bucketId'' is distinct from ''ugc-generated-videos''%'
          and pg_get_functiondef(p.oid) like '%p_output->>''contentType'' is distinct from ''video/mp4''%'
          and pg_get_functiondef(p.oid) like '%p_output->>''objectPath'' is distinct from%'
          and pg_get_functiondef(p.oid) like '%p_output->>''byteSize''%'
          and pg_get_functiondef(p.oid) like '%j.provider_plan->>''durationSeconds''%'
          and pg_get_functiondef(p.oid) like '%j.provider_request_id is null%') then 'PASS' else 'FAIL' end,
      'Completion validates owned private MP4 metadata and pinned duration before terminal write'),
    ('task_and_active_project_uniqueness',
      case when exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'ugc_video_jobs'
          and indexname = 'ugc_pipeline_provider_task_unique' and indexdef like '%UNIQUE%')
        and exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'ugc_video_jobs'
          and indexname = 'ugc_video_jobs_one_active_per_project_idx' and indexdef like '%UNIQUE%') then 'PASS' else 'FAIL' end,
      'Provider task IDs and active project jobs have unique indexes'),
    ('historical_ugc_task_routes',
      case when to_regclass('public.ugc_video_jobs') is not null and not exists (
        select 1 from public.ugc_video_jobs where status in ('queued', 'processing', 'provider_submission_ambiguous')
          and (provider is distinct from 'fal' or provider_plan is null or submission_started_at is null
            or not public.ugc_pipeline_plan_matches_snapshot(provider_plan, request_snapshot)
            or (provider_request_id is not null and provider_request_id !~ '^[a-zA-Z0-9_-]{1,255}$'))
      ) then 'PASS' else 'FAIL' end,
      'Every active UGC job has a supported snapshot-bound fal route; Video Studio rows are separate'),
    ('private_product_and_result_buckets',
      case when (select count(*) from storage.buckets where public = false and (
        (id = 'ugc-product-assets' and file_size_limit = 10485760 and allowed_mime_types = array['image/jpeg','image/png','image/webp']::text[])
        or (id = 'ugc-generated-videos' and file_size_limit = 536870912 and allowed_mime_types = array['video/mp4']::text[])
      )) = 2 then 'PASS' else 'FAIL' end,
      'Private image source and MP4 result buckets match the installed foundation contract'),
    ('optional_reference_audio',
      case when not exists (select 1 from storage.buckets where id = 'ugc-audio-references')
        or exists (select 1 from storage.buckets where id = 'ugc-audio-references' and public = false
          and allowed_mime_types = array['audio/mpeg','audio/wav']::text[]) then 'PASS' else 'FAIL' end,
      'Optional capability is absent and remains blocked, or has the expected private bucket; it does not gate core video readiness'),
    ('snapshot_and_idempotency_foundation',
      case when exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'ugc_video_jobs'
          and indexname = 'ugc_video_jobs_owner_idempotency_unique' and indexdef like '%UNIQUE%')
        and exists (select 1 from pg_proc p join pg_trigger t on t.tgfoid = p.oid
          where t.tgrelid = to_regclass('public.ugc_video_jobs') and t.tgname = 'ugc_video_jobs_set_timestamps'
            and pg_get_functiondef(p.oid) like '%request_snapshot%'
            and pg_get_functiondef(p.oid) like '%request_hash%'
            and pg_get_functiondef(p.oid) like '%idempotency_key%') then 'PASS' else 'FAIL' end,
      'Installed foundation still enforces owner idempotency and immutable snapshots')
)
select check_name, status, details from checks order by check_name;
