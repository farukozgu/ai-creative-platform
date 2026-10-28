-- REVIEW ONLY. Do not apply as part of pipeline preparation.
-- No billing, scheduler, provider call or change to existing Video Studio tables.
-- Execute this whole file once; any statement failure aborts the installation.
begin;

alter table public.ugc_video_jobs
  add column provider_plan jsonb null,
  add column submission_started_at timestamptz null,
  add column lease_token uuid null,
  add column lease_version bigint not null default 0,
  add column lease_expires_at timestamptz null,
  add column reconciliation_attempts integer not null default 0,
  add column next_poll_at timestamptz null,
  add constraint ugc_pipeline_plan_check check (provider_plan is null or (
    jsonb_typeof(provider_plan) = 'object'
    and provider_plan->>'snapshotDigest' ~ '^[0-9a-f]{64}$'
    and provider_plan->>'provider' = 'fal'
    and (
      (provider_plan->>'version' = '1'
        and provider_plan->>'modelId' = 'kling-v3-pro-image'
        and provider_plan->>'endpointId' = 'fal-ai/kling-video/v3/pro/image-to-video'
        and provider_plan->>'durationSeconds' = '15')
      or (provider_plan->>'version' = '2'
        and provider_plan->>'modelId' = 'seedance-2.5-reference'
        and provider_plan->>'endpointId' = 'bytedance/seedance-2.5/reference-to-video'
        and provider_plan->>'durationSeconds' in ('15', '30')
        and provider_plan->>'aspectRatio' in ('9:16', '1:1', '16:9')
        and provider_plan->>'resolution' = '720p'
        and jsonb_typeof(provider_plan->'generateAudio') = 'boolean'
        and (not (provider_plan ? 'model') or (
          jsonb_typeof(provider_plan->'model') = 'object'
          and provider_plan->'model'->>'tier' = 'premium'
          and provider_plan->'model'->>'provider' = 'fal'
          and provider_plan->'model'->>'endpointId' = 'bytedance/seedance-2.5/reference-to-video'
          and provider_plan->'model'->>'version' = '1'
          and (provider_plan->'model') = jsonb_build_object('tier', 'premium', 'provider', 'fal',
            'endpointId', 'bytedance/seedance-2.5/reference-to-video', 'version', 1))))
      or (provider_plan->>'version' = '3'
        and provider_plan->>'modelId' = 'bytedance/seedance-2.0/mini/reference-to-video'
        and provider_plan->>'endpointId' = 'bytedance/seedance-2.0/mini/reference-to-video'
        and provider_plan->>'durationSeconds' = '15'
        and provider_plan->>'aspectRatio' in ('9:16', '1:1', '16:9')
        and provider_plan->>'resolution' = '720p'
        and jsonb_typeof(provider_plan->'generateAudio') = 'boolean'
        and provider_plan->'model' = jsonb_build_object('tier', 'standard', 'provider', 'fal',
          'endpointId', 'bytedance/seedance-2.0/mini/reference-to-video', 'version', 1))
      or (provider_plan->>'version' = '4'
        and provider_plan->>'durationSeconds' = '15'
        and provider_plan->>'aspectRatio' in ('9:16', '1:1', '16:9')
        and ((provider_plan->>'modelId' = 'kling-v3-standard-image'
          and provider_plan->>'endpointId' = 'fal-ai/kling-video/v3/standard/image-to-video'
          and provider_plan->'model' = jsonb_build_object('tier', 'standard', 'provider', 'fal',
            'endpointId', 'fal-ai/kling-video/v3/standard/image-to-video', 'version', 1))
        or (provider_plan->>'modelId' = 'kling-v3-pro-image'
          and provider_plan->>'endpointId' = 'fal-ai/kling-video/v3/pro/image-to-video'
          and provider_plan->'model' = jsonb_build_object('tier', 'premium', 'provider', 'fal',
            'endpointId', 'fal-ai/kling-video/v3/pro/image-to-video', 'version', 1))))
    )
  ) is true);

-- Route contract binds the claimed plan to the job's immutable model identity.
-- Model-less v1 Kling and v2 Premium snapshots are retained for historical reconciliation.
create function public.ugc_pipeline_plan_matches_snapshot(p_plan jsonb, p_snapshot jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when p_plan->>'version' = '1' then
      not (p_snapshot ? 'model') and not (p_plan ? 'model')
      and p_plan->>'modelId' = 'kling-v3-pro-image'
      and p_plan->>'endpointId' = 'fal-ai/kling-video/v3/pro/image-to-video'
    when p_plan->>'version' = '2' then
      p_plan->>'modelId' = 'seedance-2.5-reference'
      and p_plan->>'endpointId' = 'bytedance/seedance-2.5/reference-to-video'
      and case when p_snapshot ? 'model' then
        p_snapshot->'model' = jsonb_build_object('tier', 'premium', 'provider', 'fal',
          'endpointId', 'bytedance/seedance-2.5/reference-to-video', 'version', 1)
        and p_plan->'model' = p_snapshot->'model'
      else not (p_plan ? 'model') end
    when p_plan->>'version' = '3' then
      p_plan->>'modelId' = 'bytedance/seedance-2.0/mini/reference-to-video'
      and p_plan->>'endpointId' = 'bytedance/seedance-2.0/mini/reference-to-video'
      and p_snapshot->'model' = jsonb_build_object('tier', 'standard', 'provider', 'fal',
        'endpointId', 'bytedance/seedance-2.0/mini/reference-to-video', 'version', 1)
      and p_plan->'model' = p_snapshot->'model'
    when p_plan->>'version' = '4' then
      p_plan->'model' = p_snapshot->'model'
      and ((p_plan->>'modelId' = 'kling-v3-standard-image'
        and p_plan->>'endpointId' = 'fal-ai/kling-video/v3/standard/image-to-video'
        and p_snapshot->'model' = jsonb_build_object('tier', 'standard', 'provider', 'fal',
          'endpointId', 'fal-ai/kling-video/v3/standard/image-to-video', 'version', 1))
      or (p_plan->>'modelId' = 'kling-v3-pro-image'
        and p_plan->>'endpointId' = 'fal-ai/kling-video/v3/pro/image-to-video'
        and p_snapshot->'model' = jsonb_build_object('tier', 'premium', 'provider', 'fal',
          'endpointId', 'fal-ai/kling-video/v3/pro/image-to-video', 'version', 1)))
    else false
  end is true;
$$;

-- Pin legacy UGC Kling task IDs before the new reconciliation guard exists.
-- Historical UGC jobs used Kling exclusively; rows with unknown routing metadata stay untouched.
update public.ugc_video_jobs set
  provider_plan = jsonb_build_object('version', 1, 'snapshotDigest', request_hash, 'provider', 'fal',
    'modelId', 'kling-v3-pro-image', 'endpointId', 'fal-ai/kling-video/v3/pro/image-to-video',
    'durationSeconds', 15, 'legacyTask', true),
  submission_started_at = coalesce(submission_started_at, created_at)
where provider = 'fal' and provider_request_id is not null and provider_plan is null
  and status in ('queued', 'processing', 'provider_submission_ambiguous')
  and not (request_snapshot ? 'model')
  and provider_request_id ~ '^[a-zA-Z0-9_-]{1,255}$';

do $$
begin
  if exists (select 1 from public.ugc_video_jobs where provider_request_id is not null
    group by provider, provider_request_id having count(*) > 1) then
    raise exception 'Duplicate UGC provider task IDs must be reviewed before pipeline deployment';
  end if;
end;
$$;

create unique index ugc_pipeline_provider_task_unique on public.ugc_video_jobs (provider, provider_request_id)
  where provider_request_id is not null;

create function public.guard_ugc_pipeline_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.provider is not null or new.provider_plan is not null or new.provider_request_id is not null
      or new.submission_started_at is not null or new.lease_token is not null or new.lease_expires_at is not null
      or new.next_poll_at is not null or new.lease_version <> 0 or new.reconciliation_attempts <> 0 then
      raise exception 'UGC provider identity can only be assigned by a submission claim';
    end if;
    return new;
  end if;
  if old.provider is null and new.provider is not null and not (
    old.status = 'draft' and new.status = 'queued' and new.provider = 'fal'
    and new.provider_plan is not null
    and public.ugc_pipeline_plan_matches_snapshot(new.provider_plan, old.request_snapshot)
  ) then raise exception 'UGC provider can only be pinned by a matching submission claim'; end if;
  if old.provider_plan is not null and new.provider_plan is distinct from old.provider_plan then
    raise exception 'UGC provider plan is immutable';
  end if;
  if old.provider_plan is null and new.provider_plan is not null and not (
    old.status = 'draft' and new.status = 'queued' and new.provider = 'fal'
    and public.ugc_pipeline_plan_matches_snapshot(new.provider_plan, old.request_snapshot)
  ) then raise exception 'UGC provider plan can only be pinned by a matching submission claim'; end if;
  if old.provider_request_id is not null and new.provider_request_id is distinct from old.provider_request_id then
    raise exception 'UGC provider task identity is immutable';
  end if;
  if old.submission_started_at is not null and new.submission_started_at is distinct from old.submission_started_at then
    raise exception 'UGC submission cannot be restarted';
  end if;
  if old.submission_started_at is null and new.submission_started_at is not null and not (
    old.status = 'draft' and new.status = 'queued' and new.provider = 'fal' and new.provider_plan is not null
  ) then raise exception 'UGC submission can only start with a pinned provider plan'; end if;
  if old.provider_request_id is null and new.provider_request_id is not null and not (
    old.status in ('queued', 'processing', 'provider_submission_ambiguous')
    and new.provider = 'fal' and new.provider_plan is not null
  ) then raise exception 'UGC task ID requires a pinned provider route'; end if;
  if old.provider is not null and new.provider is distinct from old.provider then
    raise exception 'UGC provider identity is immutable';
  end if;
  if old.status in ('succeeded', 'failed') and (
    new.output_bucket_id is distinct from old.output_bucket_id
    or new.output_object_path is distinct from old.output_object_path
    or new.output_content_type is distinct from old.output_content_type
    or new.output_byte_size is distinct from old.output_byte_size
    or new.duration_seconds is distinct from old.duration_seconds
  ) then raise exception 'Terminal UGC output is immutable'; end if;
  return new;
end;
$$;
create trigger ugc_pipeline_guard before insert or update on public.ugc_video_jobs
  for each row execute function public.guard_ugc_pipeline_identity();

create function public.claim_ugc_submission(p_owner uuid, p_job uuid, p_hash text, p_plan jsonb)
returns setof public.ugc_video_jobs language plpgsql security definer set search_path = '' as $$
declare j public.ugc_video_jobs;
begin
  if p_plan is null or jsonb_typeof(p_plan) <> 'object' or p_plan ? 'legacyTask'
    or p_plan->>'provider' is distinct from 'fal'
    or p_plan->>'snapshotDigest' is distinct from p_hash then raise exception 'Invalid UGC plan'; end if;
  select * into j from public.ugc_video_jobs
    where id = p_job and owner_id = p_owner and request_hash = p_hash
      and status = 'draft' and submission_started_at is null
    for update skip locked;
  if not found then return; end if;
  if (p_plan->>'version') not in ('1', '4')
    or not public.ugc_pipeline_plan_matches_snapshot(p_plan, j.request_snapshot)
    or (j.provider is not null and j.provider <> 'fal') then
    raise exception 'UGC provider route does not match immutable request';
  end if;
  -- The existing unique active-project index arbitrates different keys/jobs too.
  return query update public.ugc_video_jobs set
    status = 'queued', provider = 'fal', provider_plan = p_plan,
    submission_started_at = clock_timestamp(), lease_token = gen_random_uuid(),
    lease_version = lease_version + 1, lease_expires_at = clock_timestamp() + interval '180 seconds',
    next_poll_at = clock_timestamp() + interval '180 seconds'
    where id = j.id returning *;
exception when unique_violation then return;
end;
$$;

create function public.claim_ugc_reconciliation(p_owner uuid, p_job uuid)
returns setof public.ugc_video_jobs language plpgsql security definer set search_path = '' as $$
declare j public.ugc_video_jobs;
begin
  select * into j from public.ugc_video_jobs
    where id = p_job and owner_id = p_owner
      and (status in ('queued', 'processing') or (status = 'provider_submission_ambiguous' and provider_request_id is not null))
      and provider = 'fal'
      and provider_plan is not null and submission_started_at is not null
      and coalesce(next_poll_at, '-infinity'::timestamptz) <= clock_timestamp()
      and coalesce(lease_expires_at, '-infinity'::timestamptz) <= clock_timestamp()
    for update skip locked;
  if not found then return; end if;
  -- An expired submission claim with no task ID must become ambiguous, never resubmitted.
  return query update public.ugc_video_jobs set lease_token = gen_random_uuid(),
    lease_version = lease_version + 1, lease_expires_at = clock_timestamp() + interval '180 seconds',
    reconciliation_attempts = reconciliation_attempts + 1 where id = j.id returning *;
end;
$$;

-- Reserve time for the bounded 30-second submit and task-ID checkpoint.
create function public.is_ugc_claim_current(p_owner uuid, p_job uuid, p_token uuid, p_version bigint)
returns boolean language sql security definer set search_path = '' as $$
  select exists (select 1 from public.ugc_video_jobs where id = p_job and owner_id = p_owner
    and lease_token = p_token and lease_version = p_version
    and lease_expires_at > clock_timestamp() + interval '40 seconds'
    and status = 'queued' and provider_request_id is null);
$$;

create function public.finish_ugc_claim(
  p_owner uuid, p_job uuid, p_token uuid, p_version bigint, p_status text,
  p_task text default null, p_error text default null, p_output jsonb default null, p_delay integer default 0
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  j public.ugc_video_jobs;
  output_bytes bigint;
  output_duration numeric;
  planned_duration numeric;
begin
  select * into j from public.ugc_video_jobs where id = p_job and owner_id = p_owner
    and lease_token = p_token and lease_version = p_version and lease_expires_at > clock_timestamp()
    and (status in ('queued', 'processing') or (status = 'provider_submission_ambiguous' and provider_request_id is not null))
    for update;
  if not found then return false; end if;
  if p_status not in ('queued', 'processing', 'succeeded', 'failed', 'provider_submission_ambiguous')
    or p_status is null then raise exception 'Invalid UGC transition'; end if;
  if j.status = 'processing' and p_status = 'queued' then raise exception 'UGC status regression'; end if;
  if j.status = 'provider_submission_ambiguous' and p_status = 'queued' then raise exception 'UGC status regression'; end if;
  if p_task is not null and (p_task !~ '^[a-zA-Z0-9_-]{1,255}$'
    or (j.provider_request_id is not null and j.provider_request_id <> p_task)) then
    raise exception 'Invalid UGC task identity';
  end if;
  if p_status = 'succeeded' then
    -- Reject malformed metadata before casting or changing any persisted state.
    if jsonb_typeof(p_output) is distinct from 'object'
      or jsonb_typeof(p_output->'byteSize') is distinct from 'number'
      or jsonb_typeof(p_output->'durationSeconds') is distinct from 'number' then
      raise exception 'Invalid UGC output' using errcode = '22023';
    end if;
    if (p_output->>'byteSize') !~ '^[0-9]{1,9}$' then
      raise exception 'Invalid UGC output' using errcode = '22023';
    end if;
    begin
      output_bytes := (p_output->>'byteSize')::bigint;
      output_duration := (p_output->>'durationSeconds')::numeric;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Invalid UGC output' using errcode = '22023';
    end;
    planned_duration := case j.provider_plan->>'durationSeconds' when '15' then 15 when '30' then 30 else null end;
    if j.provider_request_id is null
      or p_output->>'bucketId' is distinct from 'ugc-generated-videos'
      or p_output->>'objectPath' is distinct from (p_owner::text || '/' || j.project_id::text || '/' || j.id::text || '.mp4')
      or p_output->>'contentType' is distinct from 'video/mp4'
      or output_bytes is null or output_bytes not between 1 and 262144000
      or output_duration is null or output_duration not between 0.001 and 30.5
      or planned_duration is null or abs(output_duration - planned_duration) > 0.5
      then raise exception 'Invalid UGC output' using errcode = '22023'; end if;
    if j.status = 'queued' then
      update public.ugc_video_jobs set status = 'processing' where id = j.id;
    end if;
  elsif p_output is not null then raise exception 'Output requires completed persistence'; end if;
  update public.ugc_video_jobs set status = p_status,
    provider_request_id = coalesce(p_task, provider_request_id), error_code = p_error, error_message = null,
    output_bucket_id = case when p_status = 'succeeded' then p_output->>'bucketId' else null end,
    output_object_path = case when p_status = 'succeeded' then p_output->>'objectPath' else null end,
    output_content_type = case when p_status = 'succeeded' then 'video/mp4' else null end,
    output_byte_size = case when p_status = 'succeeded' then output_bytes else null end,
    duration_seconds = case when p_status = 'succeeded' then output_duration else null end,
    lease_token = null, lease_expires_at = null,
    next_poll_at = case when p_status in ('queued', 'processing')
      then clock_timestamp() + make_interval(secs => greatest(1, least(300, coalesce(p_delay, 10)))) else null end
    where id = j.id;
  return true;
end;
$$;

revoke all on function public.guard_ugc_pipeline_identity() from public, anon, authenticated;
revoke all on function public.ugc_pipeline_plan_matches_snapshot(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.ugc_pipeline_plan_matches_snapshot(jsonb, jsonb) to service_role;
revoke all on function public.claim_ugc_submission(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.claim_ugc_reconciliation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.is_ugc_claim_current(uuid, uuid, uuid, bigint) from public, anon, authenticated;
revoke all on function public.finish_ugc_claim(uuid, uuid, uuid, bigint, text, text, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.claim_ugc_submission(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.claim_ugc_reconciliation(uuid, uuid) to service_role;
grant execute on function public.is_ugc_claim_current(uuid, uuid, uuid, bigint) to service_role;
grant execute on function public.finish_ugc_claim(uuid, uuid, uuid, bigint, text, text, text, jsonb, integer) to service_role;

commit;
