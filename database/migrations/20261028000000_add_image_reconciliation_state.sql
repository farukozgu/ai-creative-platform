-- Phase 5I.1 follow-up. This is intentionally additive because deployment of
-- the preceding Phase 5I migration has not been confirmed.
alter table public.generations drop constraint if exists generations_status_check;
alter table public.generations add constraint generations_status_check check (
  status in ('queued', 'processing', 'succeeded', 'failed', 'reconciliation_required')
);

-- Video keeps its historical lifecycle; reconciliation_required is an image
-- execution state and cannot be assigned to video rows.
alter table public.generations add constraint generations_reconciliation_type_check check (
  status <> 'reconciliation_required' or generation_type = 'image'
);

alter table public.generations add column if not exists provider_submission_phase text null;
alter table public.generations add constraint generations_image_submission_phase_check check (
  generation_type <> 'image' or provider_submission_phase is null or provider_submission_phase in ('initial', 'repair')
);

create index generations_image_reconciliation_idx on public.generations (updated_at)
  where generation_type = 'image' and status = 'reconciliation_required';

-- A worker interrupted before any provider submission can be reclaimed safely.
-- Once submission starts, automatic reclaim is forbidden because OpenAI does
-- not provide an exactly-once idempotency guarantee for this operation.
create or replace function public.claim_queued_image_generations(p_batch_size integer, p_lease_seconds integer)
returns setof public.generations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  safe_batch_size integer := greatest(1, least(coalesce(p_batch_size, 1), 5));
  safe_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 300), 300));
begin
  return query
  with candidates as (
    select g.id
    from public.generations g
    where g.generation_type = 'image'
      and g.status in ('queued', 'processing')
      and g.execution_attempts < 3
      and (g.execution_lease_expires_at is null or g.execution_lease_expires_at <= clock_timestamp())
      and coalesce(g.provider_submission_state, 'not_started') = 'not_started'
    order by g.created_at, g.id
    for update skip locked
    limit safe_batch_size
  ), claimed as (
    update public.generations g
    set execution_lease_token = gen_random_uuid(),
        execution_lease_expires_at = clock_timestamp() + make_interval(secs => safe_lease_seconds),
        execution_lease_version = g.execution_lease_version + 1,
        execution_attempts = g.execution_attempts + 1
    where g.id in (select id from candidates)
    returning g.*
  ) select * from claimed;
end;
$$;

revoke all on function public.claim_queued_image_generations(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_queued_image_generations(integer, integer) to service_role;
