alter table public.generations
  add column reconciliation_lease_token uuid null,
  add column reconciliation_lease_expires_at timestamptz null,
  add column reconciliation_lease_version bigint not null default 0;

alter table public.generations add constraint generations_video_reconciliation_lease_check check (
  generation_type <> 'video' or (
    (reconciliation_lease_token is null and reconciliation_lease_expires_at is null)
    or (reconciliation_lease_token is not null and reconciliation_lease_expires_at is not null)
  )
);

create index generations_video_reconciliation_claim_idx on public.generations
  (next_reconciliation_at, reconciliation_lease_expires_at, created_at)
  where generation_type = 'video' and status in ('queued', 'processing');

create function public.claim_due_video_reconciliations(p_batch_size integer, p_lease_seconds integer)
returns setof public.generations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  safe_batch_size integer := greatest(1, least(coalesce(p_batch_size, 1), 10));
  safe_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 120), 300));
begin
  return query
  with candidates as (
    select generations.id
    from public.generations
    where generations.generation_type = 'video'
      and generations.status in ('queued', 'processing')
      and generations.provider_request_id is not null
      and generations.reconciliation_attempts < 24
      and (generations.next_reconciliation_at is null or generations.next_reconciliation_at <= clock_timestamp())
      and (generations.reconciliation_lease_expires_at is null or generations.reconciliation_lease_expires_at <= clock_timestamp())
    order by coalesce(generations.next_reconciliation_at, generations.created_at), generations.created_at, generations.id
    for update skip locked
    limit safe_batch_size
  ), claimed as (
    update public.generations
    set reconciliation_lease_token = gen_random_uuid(),
        reconciliation_lease_expires_at = clock_timestamp() + make_interval(secs => safe_lease_seconds),
        reconciliation_lease_version = reconciliation_lease_version + 1
    where generations.id in (select candidates.id from candidates)
    returning generations.*
  )
  select * from claimed;
end;
$$;

revoke all on function public.claim_due_video_reconciliations(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_due_video_reconciliations(integer, integer) to service_role;
