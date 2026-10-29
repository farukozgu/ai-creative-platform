-- Durable Product Understanding cache for private Video Studio source images.
-- Prepared only: production installation requires a separately approved rollout.
begin;

create table public.video_product_analysis_cache (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_asset_id uuid not null references public.video_source_assets(id) on delete cascade,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  analyzer_version text not null check (char_length(analyzer_version) between 1 and 80),
  schema_version integer not null check (schema_version > 0),
  model text not null check (char_length(model) between 1 and 128),
  status text not null check (status in ('analyzing','supported','unsupported','failed_transient')),
  product_profile jsonb,
  inferred_category text,
  failure_code text,
  attempted_at timestamptz not null default now(),
  analyzed_at timestamptz,
  retry_after timestamptz,
  lease_token uuid,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint video_product_analysis_cache_identity unique(owner_id, source_sha256, analyzer_version, schema_version, model),
  constraint video_product_analysis_cache_profile_state check (
    (status = 'supported' and jsonb_typeof(product_profile) = 'object' and analyzed_at is not null)
    or (status <> 'supported' and product_profile is null)
  ),
  constraint video_product_analysis_cache_lease_state check (
    (status = 'analyzing' and lease_token is not null and lease_expires_at is not null)
    or (status <> 'analyzing' and lease_token is null and lease_expires_at is null)
  )
);

comment on table public.video_product_analysis_cache is
  'Private, hash/version-keyed Product Understanding results and atomic analysis lease for Video Studio source images.';
alter table public.video_product_analysis_cache enable row level security;
revoke all on public.video_product_analysis_cache from public, anon, authenticated, service_role;

create function public.claim_video_product_analysis(
  p_owner uuid, p_source_asset uuid, p_sha256 text, p_model text,
  p_analysis_version text, p_schema_version integer, p_lease_token uuid
)
returns table(cache_id uuid, disposition text, product_profile jsonb, inferred_category text, failure_code text)
language plpgsql security definer set search_path = '' as $$
declare v_row public.video_product_analysis_cache;
begin
  if p_owner is null or p_source_asset is null or p_lease_token is null
    or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
    or p_model is null or char_length(p_model) not between 1 and 128
    or p_analysis_version is null or char_length(p_analysis_version) not between 1 and 80
    or p_schema_version is null or p_schema_version < 1
    or not exists (select 1 from public.video_source_assets s where s.id = p_source_asset and s.owner_id = p_owner) then
    return query select null::uuid, 'unavailable'::text, null::jsonb, null::text, null::text;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'klay:video-product-analysis:' || p_owner::text || ':' || p_sha256 || ':' || p_analysis_version || ':' || p_schema_version::text || ':' || p_model, 0));
  select * into v_row from public.video_product_analysis_cache c
    where c.owner_id = p_owner and c.source_sha256 = p_sha256 and c.analyzer_version = p_analysis_version
      and c.schema_version = p_schema_version and c.model = p_model for update;

  if not found then
    insert into public.video_product_analysis_cache(owner_id, source_asset_id, source_sha256, analyzer_version,
      schema_version, model, status, lease_token, lease_expires_at, attempt_count)
    values (p_owner, p_source_asset, p_sha256, p_analysis_version, p_schema_version, p_model,
      'analyzing', p_lease_token, clock_timestamp() + interval '15 minutes', 1)
    returning * into v_row;
    return query select v_row.id, 'claimed'::text, null::jsonb, null::text, null::text;
    return;
  end if;

  if v_row.status = 'supported' then
    return query select v_row.id, 'supported'::text, v_row.product_profile, null::text, null::text;
    return;
  elsif v_row.status = 'unsupported' then
    return query select v_row.id, 'unsupported'::text, null::jsonb, v_row.inferred_category, null::text;
    return;
  elsif v_row.status = 'analyzing' and v_row.lease_expires_at > clock_timestamp() then
    return query select v_row.id, 'pending'::text, null::jsonb, null::text, null::text;
    return;
  elsif v_row.status = 'failed_transient' and v_row.retry_after > clock_timestamp() then
    return query select v_row.id, 'retry_wait'::text, null::jsonb, null::text, v_row.failure_code;
    return;
  end if;

  update public.video_product_analysis_cache c set source_asset_id = p_source_asset, status = 'analyzing',
    product_profile = null, inferred_category = null, failure_code = null, retry_after = null,
    attempted_at = clock_timestamp(), lease_token = p_lease_token,
    lease_expires_at = clock_timestamp() + interval '15 minutes', attempt_count = c.attempt_count + 1,
    updated_at = clock_timestamp()
  where c.id = v_row.id returning * into v_row;
  return query select v_row.id, 'claimed'::text, null::jsonb, null::text, null::text;
end;
$$;

create function public.complete_video_product_analysis(
  p_owner uuid, p_cache_id uuid, p_lease_token uuid, p_status text,
  p_product_profile jsonb, p_inferred_category text, p_failure_code text, p_retry_after timestamptz
)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_owner is null or p_cache_id is null or p_lease_token is null
    or p_status is null or p_status not in ('supported','unsupported','failed_transient')
    or (p_status = 'supported' and (p_product_profile is null or jsonb_typeof(p_product_profile) <> 'object'))
    or (p_status <> 'supported' and p_product_profile is not null)
    or (p_status = 'failed_transient' and (p_retry_after is null or p_failure_code is null))
    or (p_status <> 'failed_transient' and p_retry_after is not null) then return false; end if;

  update public.video_product_analysis_cache c set status = p_status, product_profile = p_product_profile,
    inferred_category = p_inferred_category, failure_code = p_failure_code, retry_after = p_retry_after,
    analyzed_at = case when p_status in ('supported','unsupported') then clock_timestamp() else null end,
    lease_token = null, lease_expires_at = null, updated_at = clock_timestamp()
  where c.id = p_cache_id and c.owner_id = p_owner and c.status = 'analyzing' and c.lease_token = p_lease_token;
  return found;
end;
$$;

revoke all on function public.claim_video_product_analysis(uuid,uuid,text,text,text,integer,uuid) from public, anon, authenticated;
revoke all on function public.complete_video_product_analysis(uuid,uuid,uuid,text,jsonb,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.claim_video_product_analysis(uuid,uuid,text,text,text,integer,uuid) to service_role;
grant execute on function public.complete_video_product_analysis(uuid,uuid,uuid,text,jsonb,text,text,timestamptz) to service_role;

commit;
