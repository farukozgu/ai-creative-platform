-- Prepared only. Validate on disposable PostgreSQL before separately approved production installation.
-- Independent of UGC, customer credits and existing generation schemas. No provider calls.
begin;

create table public.openai_beta_daily_usage (
  budget_day date not null,
  scope text not null,
  kind text not null check (kind in ('image', 'analysis')),
  owner_id uuid null references auth.users(id),
  request_count integer not null default 0 check (request_count >= 0),
  constraint openai_beta_scope_check check (
    (scope = 'global' and owner_id is null)
    or (owner_id is not null and scope = owner_id::text)
  ),
  primary key (budget_day, scope, kind)
);
alter table public.openai_beta_daily_usage enable row level security;
revoke all on public.openai_beta_daily_usage from public, anon, authenticated, service_role;

create function public.consume_openai_beta_request(p_owner uuid, p_kind text, p_user_limit integer, p_global_limit integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_day date := (clock_timestamp() at time zone 'UTC')::date;
  v_user integer;
  v_global integer;
begin
  if p_owner is null or p_kind is null or p_kind not in ('image', 'analysis')
    or p_user_limit is null or p_global_limit is null
    or p_user_limit < 1 or p_global_limit < 1
    or p_user_limit > (case when p_kind = 'image' then 100 else 1000 end)
    or p_global_limit > (case when p_kind = 'image' then 1000 else 10000 end) then return false; end if;
  if not exists (select 1 from auth.users where id = p_owner) then return false; end if;

  -- Serialize both counter checks across all app instances; transaction ends before HTTP.
  perform pg_advisory_xact_lock(hashtextextended('klay:openai-beta:' || v_day::text || ':' || p_kind, 0));
  select request_count into v_user from public.openai_beta_daily_usage
    where budget_day = v_day and scope = p_owner::text and kind = p_kind;
  select request_count into v_global from public.openai_beta_daily_usage
    where budget_day = v_day and scope = 'global' and kind = p_kind;
  if coalesce(v_user, 0) >= p_user_limit or coalesce(v_global, 0) >= p_global_limit then return false; end if;

  insert into public.openai_beta_daily_usage(budget_day, scope, kind, owner_id, request_count)
    values (v_day, p_owner::text, p_kind, p_owner, 1), (v_day, 'global', p_kind, null, 1)
    on conflict (budget_day, scope, kind) do update
      set request_count = public.openai_beta_daily_usage.request_count + 1;
  return true;
end;
$$;
revoke all on function public.consume_openai_beta_request(uuid,text,integer,integer) from public, anon, authenticated;
grant execute on function public.consume_openai_beta_request(uuid,text,integer,integer) to service_role;

commit;
