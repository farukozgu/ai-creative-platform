-- Phase 7B.2. Additive only; do not apply until isolated PostgreSQL verification.
-- This controls only manual forced product reanalysis. Normal upload analysis is unchanged.
create table public.product_reanalysis_admissions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  state text not null check (state in ('admitted', 'preparing_submission', 'possibly_submitted', 'provider_responded', 'completed', 'reconciliation_required', 'failed_pre_provider', 'failed_terminal')),
  lease_token uuid not null,
  lease_version bigint not null default 1 check (lease_version > 0),
  cooldown_until timestamptz null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (owner_id, asset_id)
);
create index product_reanalysis_admissions_owner_active_idx on public.product_reanalysis_admissions(owner_id, updated_at)
  where state in ('admitted', 'preparing_submission', 'possibly_submitted', 'provider_responded', 'reconciliation_required');
create table public.product_reanalysis_admission_settings (
  singleton boolean primary key default true check (singleton),
  max_active_reanalyses integer not null default 1 check (max_active_reanalyses between 1 and 5),
  refresh_cooldown_seconds integer not null default 3600 check (refresh_cooldown_seconds between 60 and 86400),
  updated_at timestamptz not null default clock_timestamp()
);
insert into public.product_reanalysis_admission_settings(singleton, max_active_reanalyses, refresh_cooldown_seconds) values (true, 1, 3600) on conflict (singleton) do nothing;
alter table public.product_reanalysis_admissions enable row level security;
alter table public.product_reanalysis_admission_settings enable row level security;
revoke all on public.product_reanalysis_admissions, public.product_reanalysis_admission_settings from anon, authenticated, service_role;
grant select, insert, update on public.product_reanalysis_admissions to service_role;
grant select, update on public.product_reanalysis_admission_settings to service_role;

create function public.admit_product_reanalysis(p_owner_id uuid, p_asset_id uuid)
returns table(outcome text, admission_id uuid, state text, lease_token uuid, lease_version bigint)
language plpgsql security definer set search_path = pg_catalog, public as $$
declare existing public.product_reanalysis_admissions%rowtype; configured_limit integer; active_count integer; token uuid := gen_random_uuid();
begin
  if p_owner_id is null or p_asset_id is null then return query select 'unauthorized'::text, null::uuid, null::text, null::uuid, null::bigint; return; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 71202));
  if not exists (select 1 from public.assets a where a.id = p_asset_id and a.user_id = p_owner_id and a.asset_type = 'product') then
    return query select 'unauthorized'::text, null::uuid, null::text, null::uuid, null::bigint; return;
  end if;
  select * into existing from public.product_reanalysis_admissions where owner_id = p_owner_id and asset_id = p_asset_id for update;
  if found then
    if existing.state = 'failed_pre_provider' or (existing.state = 'completed' and (existing.cooldown_until is null or existing.cooldown_until <= clock_timestamp())) then
      update public.product_reanalysis_admissions set state = 'admitted', lease_token = token, lease_version = existing.lease_version + 1, cooldown_until = null, updated_at = clock_timestamp() where id = existing.id;
      return query select 'admitted'::text, existing.id, 'admitted'::text, token, existing.lease_version + 1; return;
    end if;
    if existing.state = 'completed' then return query select 'cooldown'::text, existing.id, existing.state, null::uuid, existing.lease_version; return; end if;
    return query select 'replay'::text, existing.id, existing.state, null::uuid, existing.lease_version; return;
  end if;
  select max_active_reanalyses into configured_limit from public.product_reanalysis_admission_settings where singleton = true for update;
  select count(*) into active_count from public.product_reanalysis_admissions where owner_id = p_owner_id and state in ('admitted', 'preparing_submission', 'possibly_submitted', 'provider_responded', 'reconciliation_required');
  if active_count >= coalesce(configured_limit, 1) then return query select 'capacity'::text, null::uuid, null::text, null::uuid, null::bigint; return; end if;
  insert into public.product_reanalysis_admissions(owner_id, asset_id, state, lease_token) values (p_owner_id, p_asset_id, 'admitted', token) returning id into admission_id;
  return query select 'admitted'::text, admission_id, 'admitted'::text, token, 1::bigint;
end;
$$;

create function public.transition_product_reanalysis_admission(p_admission_id uuid, p_lease_token uuid, p_lease_version bigint, p_state text)
returns boolean language plpgsql security definer set search_path = pg_catalog, public as $$
declare cooldown_seconds integer;
begin
  select refresh_cooldown_seconds into cooldown_seconds from public.product_reanalysis_admission_settings where singleton = true;
  update public.product_reanalysis_admissions set state = p_state, cooldown_until = case when p_state = 'completed' then clock_timestamp() + make_interval(secs => coalesce(cooldown_seconds, 3600)) else cooldown_until end, updated_at = clock_timestamp()
    where id = p_admission_id and lease_token = p_lease_token and lease_version = p_lease_version
      and state in ('admitted', 'preparing_submission', 'possibly_submitted', 'provider_responded')
      and p_state in ('preparing_submission', 'possibly_submitted', 'provider_responded', 'completed', 'reconciliation_required', 'failed_pre_provider', 'failed_terminal');
  return found;
end;
$$;
revoke all on function public.admit_product_reanalysis(uuid, uuid), public.transition_product_reanalysis_admission(uuid, uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.admit_product_reanalysis(uuid, uuid), public.transition_product_reanalysis_admission(uuid, uuid, bigint, text) to service_role;
