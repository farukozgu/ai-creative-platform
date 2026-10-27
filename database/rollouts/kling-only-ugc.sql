-- Run after the UGC pipeline preparation migration, including on existing installations.
-- Retains immutable historical plans; only Kling v1/v4 may be newly claimed.
-- No provider calls, billing changes or snapshot rewrites. Not applied by this code change.
begin;
alter table public.ugc_video_jobs drop constraint ugc_pipeline_plan_check;
alter table public.ugc_video_jobs
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


create or replace function public.ugc_pipeline_plan_matches_snapshot(p_plan jsonb, p_snapshot jsonb)
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


create or replace function public.claim_ugc_submission(p_owner uuid, p_job uuid, p_hash text, p_plan jsonb)
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


commit;
