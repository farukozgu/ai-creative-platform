-- Phase 5I: image work is accepted independently from the HTTP request that
-- created it.  These fields are additive so historical image and video rows
-- retain their existing semantics.
alter table public.generations
  add column if not exists execution_lease_token uuid null,
  add column if not exists execution_lease_expires_at timestamptz null,
  add column if not exists execution_lease_version bigint not null default 0,
  add column if not exists execution_attempts integer not null default 0,
  add column if not exists provider_submission_state text null,
  add column if not exists provider_submission_started_at timestamptz null;

alter table public.generations
  add constraint generations_image_execution_attempts_check
  check (generation_type <> 'image' or execution_attempts between 0 and 3),
  add constraint generations_image_submission_state_check
  check (generation_type <> 'image' or provider_submission_state is null or provider_submission_state in ('not_started', 'submitting', 'submitted', 'ambiguous')),
  add constraint generations_image_execution_lease_check
  check (generation_type <> 'image' or ((execution_lease_token is null and execution_lease_expires_at is null) or (execution_lease_token is not null and execution_lease_expires_at is not null)));

-- client_submission_id already exists for video.  The partial uniqueness rule
-- gives image requests the same durable idempotency boundary without changing
-- legacy rows that pre-date the browser supplied key.
create unique index generations_image_owner_submission_unique
  on public.generations (owner_id, client_submission_id)
  where generation_type = 'image' and client_submission_id is not null;

create index generations_image_execution_claim_idx
  on public.generations (created_at, execution_lease_expires_at)
  where generation_type = 'image' and status = 'queued';

-- Atomic, bounded claim. SKIP LOCKED and the monotonically increasing version
-- make duplicate scheduler delivery harmless at the database boundary.
create function public.claim_queued_image_generations(p_batch_size integer, p_lease_seconds integer)
returns setof public.generations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  safe_batch_size integer := greatest(1, least(coalesce(p_batch_size, 1), 5));
  safe_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 120), 300));
begin
  return query
  with candidates as (
    select g.id
    from public.generations g
    where g.generation_type = 'image'
      and g.status = 'queued'
      and g.execution_attempts < 3
      and (g.execution_lease_expires_at is null or g.execution_lease_expires_at <= clock_timestamp())
      and coalesce(g.provider_submission_state, 'not_started') <> 'ambiguous'
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
