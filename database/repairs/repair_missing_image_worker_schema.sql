  if not exists (select 1 from pg_constraint where conrelid='public.generations'::regclass and conname='generations_image_execution_attempts_check') then
    alter table public.generations add constraint generations_image_execution_attempts_check check (generation_type <> 'image' or execution_attempts between 0 and 3);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.generations'::regclass and conname='generations_image_submission_state_check') then
    alter table public.generations add constraint generations_image_submission_state_check check (generation_type <> 'image' or provider_submission_state is null or provider_submission_state in ('not_started','submitting','submitted','ambiguous'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.generations'::regclass and conname='generations_image_execution_lease_check') then
    alter table public.generations add constraint generations_image_execution_lease_check check (generation_type <> 'image' or ((execution_lease_token is null and execution_lease_expires_at is null) or (execution_lease_token is not null and execution_lease_expires_at is not null)));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.generations'::regclass and conname='generations_image_submission_phase_check') then
    alter table public.generations add constraint generations_image_submission_phase_check check (generation_type <> 'image' or provider_submission_phase is null or provider_submission_phase in ('initial','repair'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.generations'::regclass and conname='generations_reconciliation_type_check') then
    alter table public.generations add constraint generations_reconciliation_type_check check (status <> 'reconciliation_required' or generation_type='image');
  end if;
  if position('reconciliation_required' in (select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.generations'::regclass and conname='generations_status_check'))=0 then
    alter table public.generations drop constraint generations_status_check;
    alter table public.generations add constraint generations_status_check check (status in ('queued','processing','succeeded','failed','reconciliation_required'));
  end if;
end;
$constraints$;

-- Create a missing index only after an explicit collision check. Existing named
-- indexes must match their expected definition exactly.
do $indexes$
declare
  def text;
  idx oid;
begin
  select pg_get_indexdef(indexrelid) into def from pg_index
  where indrelid='public.generations'::regclass and indexrelid=to_regclass('public.generations_image_owner_submission_unique');
  if def is not null and def <> 'CREATE UNIQUE INDEX generations_image_owner_submission_unique ON public.generations USING btree (owner_id, client_submission_id) WHERE ((generation_type = ''image''::text) AND (client_submission_id IS NOT NULL))' then
    raise exception 'Repair stopped: image idempotency index has unexpected definition: %', def;
  end if;
  if to_regclass('public.generations_image_owner_submission_unique') is null then
    create unique index generations_image_owner_submission_unique on public.generations (owner_id, client_submission_id)
      where generation_type='image' and client_submission_id is not null;
  end if;

  select pg_get_indexdef(indexrelid) into def from pg_index
  where indrelid='public.generations'::regclass and indexrelid=to_regclass('public.generations_image_execution_claim_idx');
  if def is not null and def <> 'CREATE INDEX generations_image_execution_claim_idx ON public.generations USING btree (created_at, execution_lease_expires_at) WHERE ((generation_type = ''image''::text) AND (status = ''queued''::text))' then
    raise exception 'Repair stopped: image claim index has unexpected definition: %', def;
  end if;
  if to_regclass('public.generations_image_execution_claim_idx') is null then
    create index generations_image_execution_claim_idx on public.generations (created_at, execution_lease_expires_at)
      where generation_type='image' and status='queued';
  end if;

  select pg_get_indexdef(indexrelid) into def from pg_index
  where indrelid='public.generations'::regclass and indexrelid=to_regclass('public.generations_image_reconciliation_idx');
  if def is not null and def <> 'CREATE INDEX generations_image_reconciliation_idx ON public.generations USING btree (updated_at) WHERE ((generation_type = ''image''::text) AND (status = ''reconciliation_required''::text))' then
    raise exception 'Repair stopped: image reconciliation index has unexpected definition: %', def;
  end if;
  if to_regclass('public.generations_image_reconciliation_idx') is null then
    create index generations_image_reconciliation_idx on public.generations (updated_at)
      where generation_type='image' and status='reconciliation_required';
  end if;
end;
$indexes$;

-- This is the final 20261029 claim contract, preserving the worker's bounded
-- lease values and excluding work that may already have reached a provider.
create or replace function public.claim_queued_image_generations(p_batch_size integer, p_lease_seconds integer)
returns setof public.generations
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  safe_batch_size integer := greatest(1, least(coalesce(p_batch_size, 1), 5));
  safe_lease_seconds integer := greatest(60, least(coalesce(p_lease_seconds, 750), 780));
begin
  return query
  with candidates as (
    select g.id from public.generations g
    where g.generation_type='image' and g.status in ('queued','processing')
      and g.execution_attempts < 3
      and (g.execution_lease_expires_at is null or g.execution_lease_expires_at <= clock_timestamp())
      and coalesce(g.provider_submission_state,'not_started')='not_started'
    order by g.created_at, g.id for update skip locked limit safe_batch_size
  ), claimed as (
    update public.generations g set
      execution_lease_token=gen_random_uuid(),
      execution_lease_expires_at=clock_timestamp()+make_interval(secs=>safe_lease_seconds),
      execution_lease_version=g.execution_lease_version+1,
      execution_attempts=g.execution_attempts+1
    where g.id in (select id from candidates) returning g.*
  ) select * from claimed;
end;
$$;

create or replace function public.renew_image_generation_lease(
  p_generation_id uuid, p_lease_token uuid, p_lease_version bigint, p_lease_seconds integer
)
returns setof public.generations
language sql security definer set search_path = pg_catalog, public
as $$
  update public.generations g set execution_lease_expires_at=clock_timestamp()+make_interval(secs=>greatest(60,least(coalesce(p_lease_seconds,750),780)))
  where g.id=p_generation_id and g.generation_type='image' and g.status='processing'
    and g.execution_lease_token=p_lease_token and g.execution_lease_version=p_lease_version
    and g.execution_lease_expires_at>clock_timestamp()
    and coalesce(g.provider_submission_state,'not_started') in ('not_started','submitting','submitted')
  returning g.*;
$$;

revoke all on function public.claim_queued_image_generations(integer,integer) from public, anon, authenticated;
grant execute on function public.claim_queued_image_generations(integer,integer) to service_role;
revoke all on function public.renew_image_generation_lease(uuid,uuid,bigint,integer) from public, anon, authenticated;
grant execute on function public.renew_image_generation_lease(uuid,uuid,bigint,integer) to service_role;

commit;

-- Read-only post-repair verification; run separately after the transaction.
select
  a.attname as column_name,
  format_type(a.atttypid,a.atttypmod) as data_type,
  a.attnotnull as not_null,
  pg_get_expr(d.adbin,d.adrelid) as default_value
from pg_attribute a
left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
where a.attrelid='public.generations'::regclass and not a.attisdropped
  and a.attname in ('execution_attempts','execution_lease_expires_at','execution_lease_token','execution_lease_version','provider_submission_phase','provider_submission_state','provider_submission_started_at')
order by a.attname;

select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       has_function_privilege('service_role',p.oid,'EXECUTE') as service_role_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.oid in (