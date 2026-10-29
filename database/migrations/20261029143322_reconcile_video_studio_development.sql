-- Replays after the two component migrations as a no-op.
do $transition$
begin
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261027131744') then
    return;
  end if;
  execute $bundle$-- Run only in the same transaction and connection as the historical Studio
-- migration and the following preserve_video_budget_policy migration.
-- This intentionally does not persist the privileged function definition.
do $preflight$
begin
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261027131744')
     or to_regclass('public.video_studio_budget_settings') is not null
     or to_regprocedure('public.reserve_video_studio_budget_once(uuid,uuid,numeric,text,integer)') is not null
     or to_regprocedure('public.reserve_video_beta_budget_once(uuid,uuid,numeric,text,integer)') is null
     or to_regprocedure('public.reserve_video_beta_budget(uuid,uuid,numeric,text,integer)') is null then
    raise exception 'Video budget transition is not applicable to this database';
  end if;
end
$preflight$;

create temporary table video_budget_policy_transition (definition text not null) on commit drop;
revoke all on pg_temp.video_budget_policy_transition from public, anon, authenticated, service_role;
insert into pg_temp.video_budget_policy_transition
  select pg_get_functiondef('public.reserve_video_beta_budget(uuid,uuid,numeric,text,integer)'::regprocedure);
do $preflight$
begin
  if (select count(*) from pg_temp.video_budget_policy_transition) <> 1
     or not exists (select 1 from pg_temp.video_budget_policy_transition
       where definition like '%admin_owner constant uuid%'
         and definition like '%p_owner is distinct from admin_owner%'
         and definition like '%where owner_id <> admin_owner%') then
    raise exception 'Expected private administrator policy not present';
  end if;
end
$preflight$;

-- Operator-only configuration. No client or customer-role budget mutation API.

create table public.video_studio_budget_settings (
  singleton boolean primary key default true check (singleton),
  allow_high_limits boolean not null default false,
  max_request_usd numeric(18,6) default 2,
  user_daily_usd numeric(18,6) default 2,
  user_daily_count integer default 3,
  global_daily_usd numeric(18,6) default 10,
  global_lifetime_usd numeric(18,6) default 10,
  check (max_request_usd > 0 and max_request_usd < 1000000),
  check (user_daily_usd > 0 and user_daily_usd < 1000000000000),
  check (user_daily_count > 0),
  check (global_daily_usd > 0 and global_daily_usd < 1000000000000),
  check (global_lifetime_usd > 0 and global_lifetime_usd < 1000000000000),
  -- NULL means unlimited only after an explicit privileged opt-in.
  check (allow_high_limits or (
    max_request_usd is not null and max_request_usd <= 2 and
    user_daily_usd is not null and user_daily_usd <= 2 and
    user_daily_count is not null and user_daily_count <= 3 and
    global_daily_usd is not null and global_daily_usd <= 10 and
    global_lifetime_usd is not null and global_lifetime_usd <= 10))
);
insert into public.video_studio_budget_settings(singleton) values (true);
alter table public.video_studio_budget_settings enable row level security;
revoke all on public.video_studio_budget_settings from public, anon, authenticated, service_role;
-- Only a database administrator may edit limits. The application may only read.
grant select on public.video_studio_budget_settings to service_role;

-- Keep all existing rows; move the fixed $2 ceiling into operator policy.
alter table public.video_beta_reservations drop constraint video_beta_reservations_cost_usd_check;
alter table public.video_beta_reservations add constraint video_beta_reservations_cost_usd_check
  check (cost_usd > 0 and cost_usd < 1000000);

create function public.reserve_video_studio_budget_once(p_owner uuid, p_submission uuid, p_cost numeric, p_tier text, p_duration integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  limits public.video_studio_budget_settings;
  lifetime_total numeric; global_today numeric; user_today numeric; user_count bigint;
  reservation uuid;
  day_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
begin
  if p_owner is null or p_submission is null or p_cost is null
    or p_cost::text in ('NaN', 'Infinity', '-Infinity') or p_cost <= 0 or p_cost >= 1000000
    or p_cost <> round(p_cost, 6)
    or p_tier is null or p_tier not in ('standard', 'pro')
    or p_duration is null or p_duration not in (5, 10) then
    raise exception 'Invalid video reservation';
  end if;
  -- Shared with legacy admission so all callers see the same budget ledger.
  perform pg_advisory_xact_lock(7246193086541);
  if exists (select 1 from public.video_beta_reservations where owner_id = p_owner and submission_id = p_submission) then
    return null;
  end if;
  select * into limits from public.video_studio_budget_settings where singleton for share;
  if not found then raise exception 'Video budget policy unavailable'; end if;
  select coalesce(sum(cost_usd), 0),
    coalesce(sum(cost_usd) filter (where created_at >= day_start), 0),
    coalesce(sum(cost_usd) filter (where owner_id = p_owner and created_at >= day_start), 0),
    count(*) filter (where owner_id = p_owner and created_at >= day_start)
    into lifetime_total, global_today, user_today, user_count
    from public.video_beta_reservations;
  if (limits.max_request_usd is not null and p_cost > limits.max_request_usd)
    or (limits.global_lifetime_usd is not null and lifetime_total + p_cost > limits.global_lifetime_usd)
    or (limits.global_daily_usd is not null and global_today + p_cost > limits.global_daily_usd)
    or (limits.user_daily_usd is not null and user_today + p_cost > limits.user_daily_usd)
    or (limits.user_daily_count is not null and user_count >= limits.user_daily_count) then
    raise exception 'Video budget exhausted';
  end if;
  insert into public.video_beta_reservations(owner_id, submission_id, cost_usd, tier, duration)
    values (p_owner, p_submission, p_cost, p_tier, p_duration) returning id into reservation;
  return reservation;
end;
$$;
revoke all on function public.reserve_video_studio_budget_once(uuid,uuid,numeric,text,integer) from public, anon, authenticated;
grant execute on function public.reserve_video_studio_budget_once(uuid,uuid,numeric,text,integer) to service_role;

-- Older application instances must also obey edited operator limits.
-- Preserve the historical direct RPC's exact-identity recovery contract.
create or replace function public.reserve_video_beta_budget(p_owner uuid, p_submission uuid, p_cost numeric, p_tier text, p_duration integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare existing public.video_beta_reservations;
begin
  perform pg_advisory_xact_lock(7246193086541);
  select * into existing from public.video_beta_reservations where owner_id = p_owner and submission_id = p_submission;
  if found then
    if existing.tier is distinct from p_tier or existing.duration is distinct from p_duration or existing.cost_usd is distinct from p_cost then
      raise exception 'Video request identity changed';
    end if;
    return existing.id;
  end if;
  return public.reserve_video_studio_budget_once(p_owner, p_submission, p_cost, p_tier, p_duration);
end;
$$;
revoke all on function public.reserve_video_beta_budget(uuid,uuid,numeric,text,integer) from public, anon, authenticated;
grant execute on function public.reserve_video_beta_budget(uuid,uuid,numeric,text,integer) to service_role;

-- On a normal replay there is no session-local backup: preserve the policy
-- installed by the original Studio migration. Development's controlled
-- transition supplies the backup in the same transaction as both migrations.
do $migration$
declare
  saved_definition text;
begin
  if to_regclass('pg_temp.video_budget_policy_transition') is null then
    return;
  end if;
  select definition into strict saved_definition
    from pg_temp.video_budget_policy_transition;
  if saved_definition not like '%admin_owner constant uuid%'
     or saved_definition not like '%reserve_video_beta_budget%'
     or to_regprocedure('public.reserve_video_beta_budget_once(uuid,uuid,numeric,text,integer)') is null
     or to_regclass('public.video_studio_budget_settings') is null then
    raise exception 'Video budget policy transition precondition failed';
  end if;
  execute saved_definition;
  execute $function$
    create or replace function public.reserve_video_studio_budget_once(
      p_owner uuid, p_submission uuid, p_cost numeric, p_tier text, p_duration integer
    ) returns uuid language sql security definer set search_path = ''
    as 'select public.reserve_video_beta_budget_once($1, $2, $3, $4, $5)'
  $function$;
  revoke all on function public.reserve_video_studio_budget_once(uuid,uuid,numeric,text,integer)
    from public, anon, authenticated;
  grant execute on function public.reserve_video_studio_budget_once(uuid,uuid,numeric,text,integer)
    to service_role;
  comment on table public.video_studio_budget_settings is
    'Development compatibility: existing beta policy is authoritative; these settings do not alter it.';
end
$migration$;


    insert into supabase_migrations.schema_migrations(version,name,statements) values
      ('20261027131744','configure_video_studio_budget',array[$migration_record$-- Operator-only configuration. No client or customer-role budget mutation API.
begin;
create table public.video_studio_budget_settings (
  singleton boolean primary key default true check (singleton),
  allow_high_limits boolean not null default false,
  max_request_usd numeric(18,6) default 2,
  user_daily_usd numeric(18,6) default 2,
  user_daily_count integer default 3,
  global_daily_usd numeric(18,6) default 10,
  global_lifetime_usd numeric(18,6) default 10,
  check (max_request_usd > 0 and max_request_usd < 1000000),
  check (user_daily_usd > 0 and user_daily_usd < 1000000000000),
  check (user_daily_count > 0),
  check (global_daily_usd > 0 and global_daily_usd < 1000000000000),
  check (global_lifetime_usd > 0 and global_lifetime_usd < 1000000000000),
  -- NULL means unlimited only after an explicit privileged opt-in.
  check (allow_high_limits or (
    max_request_usd is not null and max_request_usd <= 2 and
    user_daily_usd is not null and user_daily_usd <= 2 and
    user_daily_count is not null and user_daily_count <= 3 and
    global_daily_usd is not null and global_daily_usd <= 10 and
    global_lifetime_usd is not null and global_lifetime_usd <= 10))
);
insert into public.video_studio_budget_settings(singleton) values (true);
alter table public.video_studio_budget_settings enable row level security;
revoke all on public.video_studio_budget_settings from public, anon, authenticated, service_role;
-- Only a database administrator may edit limits. The application may only read.
grant select on public.video_studio_budget_settings to service_role;

-- Keep all existing rows; move the fixed $2 ceiling into operator policy.
alter table public.video_beta_reservations drop constraint video_beta_reservations_cost_usd_check;
alter table public.video_beta_reservations add constraint video_beta_reservations_cost_usd_check
  check (cost_usd > 0 and cost_usd < 1000000);

create function public.reserve_video_studio_budget_once(p_owner uuid, p_submission uuid, p_cost numeric, p_tier text, p_duration integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  limits public.video_studio_budget_settings;
  lifetime_total numeric; global_today numeric; user_today numeric; user_count bigint;
  reservation uuid;
  day_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
begin
  if p_owner is null or p_submission is null or p_cost is null
    or p_cost::text in ('NaN', 'Infinity', '-Infinity') or p_cost <= 0 or p_cost >= 1000000
    or p_cost <> round(p_cost, 6)
    or p_tier is null or p_tier not in ('standard', 'pro')
    or p_duration is null or p_duration not in (5, 10) then
    raise exception 'Invalid video reservation';
  end if;
  -- Shared with legacy admission so all callers see the same budget ledger.
  perform pg_advisory_xact_lock(7246193086541);
  if exists (select 1 from public.video_beta_reservations where owner_id = p_owner and submission_id = p_submission) then
    return null;
  end if;
  select * into limits from public.video_studio_budget_settings where singleton for share;
  if not found then raise exception 'Video budget policy unavailable'; end if;
  select coalesce(sum(cost_usd), 0),
    coalesce(sum(cost_usd) filter (where created_at >= day_start), 0),
    coalesce(sum(cost_usd) filter (where owner_id = p_owner and created_at >= day_start), 0),
    count(*) filter (where owner_id = p_owner and created_at >= day_start)
    into lifetime_total, global_today, user_today, user_count
    from public.video_beta_reservations;
  if (limits.max_request_usd is not null and p_cost > limits.max_request_usd)
    or (limits.global_lifetime_usd is not null and lifetime_total + p_cost > limits.global_lifetime_usd)
    or (limits.global_daily_usd is not null and global_today + p_cost > limits.global_daily_usd)
    or (limits.user_daily_usd is not null and user_today + p_cost > limits.user_daily_usd)
    or (limits.user_daily_count is not null and user_count >= limits.user_daily_count) then
    raise exception 'Video budget exhausted';
  end if;
  insert into public.video_beta_reservations(owner_id, submission_id, cost_usd, tier, duration)
    values (p_owner, p_submission, p_cost, p_tier, p_duration) returning id into reservation;
  return reservation;
end;
$$;
revoke all on function public.reserve_video_studio_budget_once(uuid,uuid,numeric,text,integer) from public, anon, authenticated;
grant execute on function public.reserve_video_studio_budget_once(uuid,uuid,numeric,text,integer) to service_role;

-- Older application instances must also obey edited operator limits.
-- Preserve the historical direct RPC's exact-identity recovery contract.
create or replace function public.reserve_video_beta_budget(p_owner uuid, p_submission uuid, p_cost numeric, p_tier text, p_duration integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare existing public.video_beta_reservations;
begin
  perform pg_advisory_xact_lock(7246193086541);
  select * into existing from public.video_beta_reservations where owner_id = p_owner and submission_id = p_submission;
  if found then
    if existing.tier is distinct from p_tier or existing.duration is distinct from p_duration or existing.cost_usd is distinct from p_cost then
      raise exception 'Video request identity changed';
    end if;
    return existing.id;
  end if;
  return public.reserve_video_studio_budget_once(p_owner, p_submission, p_cost, p_tier, p_duration);
end;
$$;
revoke all on function public.reserve_video_beta_budget(uuid,uuid,numeric,text,integer) from public, anon, authenticated;
grant execute on function public.reserve_video_beta_budget(uuid,uuid,numeric,text,integer) to service_role;
commit;
$migration_record$]),
      ('20261029135559','preserve_video_budget_policy',array[$migration_record$-- On a normal replay there is no session-local backup: preserve the policy
-- installed by the original Studio migration. Development's controlled
-- transition supplies the backup in the same transaction as both migrations.
do $migration$
declare
  saved_definition text;
begin
  if to_regclass('pg_temp.video_budget_policy_transition') is null then
    return;
  end if;
  select definition into strict saved_definition
    from pg_temp.video_budget_policy_transition;
  if saved_definition not like '%admin_owner constant uuid%'
     or saved_definition not like '%reserve_video_beta_budget%'
     or to_regprocedure('public.reserve_video_beta_budget_once(uuid,uuid,numeric,text,integer)') is null
     or to_regclass('public.video_studio_budget_settings') is null then
    raise exception 'Video budget policy transition precondition failed';
  end if;
  execute saved_definition;
  execute $function$
    create or replace function public.reserve_video_studio_budget_once(
      p_owner uuid, p_submission uuid, p_cost numeric, p_tier text, p_duration integer
    ) returns uuid language sql security definer set search_path = ''
    as 'select public.reserve_video_beta_budget_once($1, $2, $3, $4, $5)'
  $function$;
  revoke all on function public.reserve_video_studio_budget_once(uuid,uuid,numeric,text,integer)
    from public, anon, authenticated;
  grant execute on function public.reserve_video_studio_budget_once(uuid,uuid,numeric,text,integer)
    to service_role;
  comment on table public.video_studio_budget_settings is
    'Development compatibility: existing beta policy is authoritative; these settings do not alter it.';
end
$migration$;
$migration_record$]);
    $bundle$;
end
$transition$;

