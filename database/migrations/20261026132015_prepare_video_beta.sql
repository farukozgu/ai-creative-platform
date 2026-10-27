-- Video-only USD test allowance. Does not enable generation or touch customer credits/UGC.
begin;
create table public.video_beta_reservations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null,
  tier text not null check (tier in ('standard','pro')),
  duration integer not null check (duration in (5,10)),
  cost_usd numeric(12,6) not null check (cost_usd > 0 and cost_usd <= 2),
  status text not null default 'reserved' check (status in ('reserved','finalized')),
  created_at timestamptz not null default now(),
  unique(owner_id,submission_id)
);
alter table public.video_beta_reservations enable row level security;
revoke all on public.video_beta_reservations from public,anon,authenticated;
grant select,insert,update on public.video_beta_reservations to service_role;

create function public.reserve_video_beta_budget(p_owner uuid,p_submission uuid,p_cost numeric,p_tier text,p_duration integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.video_beta_reservations; total numeric; today_total numeric; today_count integer;
begin
  if p_owner is null or p_submission is null or p_cost is null or p_cost <= 0 or p_cost > 2
    or p_tier is null or p_tier not in ('standard','pro') or p_duration is null or p_duration not in (5,10) then
    raise exception 'Invalid video beta request';
  end if;
  perform pg_advisory_xact_lock(7246193086541);
  select * into r from public.video_beta_reservations where owner_id=p_owner and submission_id=p_submission;
  if found then
    if r.tier <> p_tier or r.duration <> p_duration or r.cost_usd <> p_cost then raise exception 'Video beta request identity changed'; end if;
    return r.id;
  end if;
  select coalesce(sum(cost_usd),0) into total from public.video_beta_reservations;
  select coalesce(sum(cost_usd),0),count(*) into today_total,today_count from public.video_beta_reservations
    where owner_id=p_owner and created_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
  if total + p_cost > 10 or today_total + p_cost > 2 or today_count >= 3 then raise exception 'Video beta budget exhausted'; end if;
  insert into public.video_beta_reservations(owner_id,submission_id,cost_usd,tier,duration)
    values(p_owner,p_submission,p_cost,p_tier,p_duration) returning * into r;
  return r.id;
end; $$;

create function public.finalize_video_beta_budget(p_reservation uuid,p_job uuid,p_token uuid,p_version bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare g public.generations;
begin
  select * into g from public.generations where id=p_job and generation_type='video'
    and billing_reservation_id=p_reservation::text and status='processing'
    and reconciliation_lease_token=p_token and reconciliation_lease_version=p_version
    and reconciliation_lease_expires_at > clock_timestamp() for update;
  if not found then return false; end if;
  update public.video_beta_reservations set status='finalized' where id=p_reservation and owner_id=g.owner_id;
  return found;
end; $$;

create function public.claim_video_beta_reconciliations(p_owner uuid default null,p_job uuid default null,p_limit integer default 1)
returns setof public.generations language plpgsql security definer set search_path = '' as $$
begin
  -- A process may die after POST but before task attachment. Never resubmit or release its allowance.
  update public.generations g set status='failed',error_code='provider_submission_ambiguous',billing_status='reconciliation_required'
    where g.generation_type='video' and g.status='queued' and g.provider_request_id is null
    and g.created_at < clock_timestamp()-interval '180 seconds'
    and (p_owner is null or g.owner_id=p_owner) and (p_job is null or g.id=p_job)
    and exists(select 1 from public.video_beta_reservations b where b.id::text=g.billing_reservation_id and b.owner_id=g.owner_id);
  return query with candidates as (
    select g.id from public.generations g
    where g.generation_type='video' and g.status in ('queued','processing') and g.provider_request_id is not null
      and (p_owner is null or g.owner_id=p_owner) and (p_job is null or g.id=p_job)
      and exists(select 1 from public.video_beta_reservations b where b.id::text=g.billing_reservation_id and b.owner_id=g.owner_id)
      and (g.next_reconciliation_at is null or g.next_reconciliation_at <= clock_timestamp())
      and (g.reconciliation_lease_expires_at is null or g.reconciliation_lease_expires_at <= clock_timestamp())
    order by g.created_at,g.id for update of g skip locked limit greatest(1,least(coalesce(p_limit,1),5))
  ) update public.generations g set reconciliation_lease_token=gen_random_uuid(),
    reconciliation_lease_expires_at=clock_timestamp()+interval '120 seconds',
    reconciliation_lease_version=g.reconciliation_lease_version+1
    where g.id in(select c.id from candidates c) returning g.*;
end; $$;
revoke all on function public.reserve_video_beta_budget(uuid,uuid,numeric,text,integer) from public,anon,authenticated;
revoke all on function public.finalize_video_beta_budget(uuid,uuid,uuid,bigint) from public,anon,authenticated;
revoke all on function public.claim_video_beta_reconciliations(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.reserve_video_beta_budget(uuid,uuid,numeric,text,integer) to service_role;
grant execute on function public.finalize_video_beta_budget(uuid,uuid,uuid,bigint) to service_role;
grant execute on function public.claim_video_beta_reconciliations(uuid,uuid,integer) to service_role;
commit;
