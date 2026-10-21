-- Phase 5I.2: Vercel Pro worker lease renewal. Additive and service-role only.
create or replace function public.claim_queued_image_generations(p_batch_size integer, p_lease_seconds integer)
returns setof public.generations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  safe_batch_size integer := greatest(1, least(coalesce(p_batch_size, 1), 5));
  safe_lease_seconds integer := greatest(60, least(coalesce(p_lease_seconds, 750), 780));
begin
  return query
  with candidates as (
    select g.id from public.generations g
    where g.generation_type = 'image'
      and g.status in ('queued', 'processing')
      and g.execution_attempts < 3
      and (g.execution_lease_expires_at is null or g.execution_lease_expires_at <= clock_timestamp())
      and coalesce(g.provider_submission_state, 'not_started') = 'not_started'
    order by g.created_at, g.id
    for update skip locked
    limit safe_batch_size
  ), claimed as (
    update public.generations g set
      execution_lease_token = gen_random_uuid(),
      execution_lease_expires_at = clock_timestamp() + make_interval(secs => safe_lease_seconds),
      execution_lease_version = g.execution_lease_version + 1,
      execution_attempts = g.execution_attempts + 1
    where g.id in (select id from candidates)
    returning g.*
  ) select * from claimed;
end;
$$;

create function public.renew_image_generation_lease(
  p_generation_id uuid,
  p_lease_token uuid,
  p_lease_version bigint,
  p_lease_seconds integer
)
returns setof public.generations
language sql
security definer
set search_path = pg_catalog, public
as $$
  update public.generations g set
    execution_lease_expires_at = clock_timestamp() + make_interval(secs => greatest(60, least(coalesce(p_lease_seconds, 750), 780)))
  where g.id = p_generation_id
    and g.generation_type = 'image'
    and g.status = 'processing'
    and g.execution_lease_token = p_lease_token
    and g.execution_lease_version = p_lease_version
    and g.execution_lease_expires_at > clock_timestamp()
    and coalesce(g.provider_submission_state, 'not_started') in ('not_started', 'submitting', 'submitted')
  returning g.*;
$$;

revoke all on function public.claim_queued_image_generations(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_queued_image_generations(integer, integer) to service_role;
revoke all on function public.renew_image_generation_lease(uuid, uuid, bigint, integer) from public, anon, authenticated;
grant execute on function public.renew_image_generation_lease(uuid, uuid, bigint, integer) to service_role;
