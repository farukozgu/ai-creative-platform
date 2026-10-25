-- Disposable test project gklpgcyndeghjgemoonk ONLY. No provider calls.
-- All synthetic users and quota counters are rolled back; no DELETE or reset.
begin;
set local statement_timeout = '15s';
set local lock_timeout = '5s';

do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  used_before integer;
  tests integer := 0;
begin
  if exists (select 1 from public.openai_beta_daily_usage
    where budget_day = (clock_timestamp() at time zone 'UTC')::date) then
    raise exception 'Test requires an unused disposable daily budget; existing counters are never changed';
  end if;
  insert into auth.users(id, email, aud, role) values
    (a, a::text || '@staging.invalid', 'authenticated', 'authenticated'),
    (b, b::text || '@staging.invalid', 'authenticated', 'authenticated');

  if not (select relrowsecurity from pg_class where oid='public.openai_beta_daily_usage'::regclass) then
    raise exception 'ASSERTION: budget table must have RLS'; end if;
  tests := tests + 1;
  if has_function_privilege('anon','public.consume_openai_beta_request(uuid,text,integer,integer)','execute')
    or has_function_privilege('authenticated','public.consume_openai_beta_request(uuid,text,integer,integer)','execute')
    or not has_function_privilege('service_role','public.consume_openai_beta_request(uuid,text,integer,integer)','execute') then
    raise exception 'ASSERTION: service-only RPC'; end if;
  tests := tests + 1;
  if has_table_privilege('authenticated','public.openai_beta_daily_usage','select')
    or has_table_privilege('service_role','public.openai_beta_daily_usage','update') then
    raise exception 'ASSERTION: direct quota edits forbidden'; end if;
  tests := tests + 1;

  if public.consume_openai_beta_request(null,'image',2,3)
    or public.consume_openai_beta_request(a,null,2,3)
    or public.consume_openai_beta_request(a,'video',2,3)
    or public.consume_openai_beta_request(a,'image',null,3)
    or public.consume_openai_beta_request(a,'image',2,0)
    or public.consume_openai_beta_request(a,'image',101,3)
    or public.consume_openai_beta_request(gen_random_uuid(),'image',2,3) then
    raise exception 'ASSERTION: invalid request admitted'; end if;
  if exists(select 1 from public.openai_beta_daily_usage) then
    raise exception 'ASSERTION: rejected requests must not mutate counters'; end if;
  tests := tests + 1;

  set local role service_role;
  if not public.consume_openai_beta_request(a,'image',2,3)
    or not public.consume_openai_beta_request(a,'image',2,3)
    or public.consume_openai_beta_request(a,'image',2,3) then
    raise exception 'ASSERTION: per-user ceiling'; end if;
  reset role;
  tests := tests + 1;

  select request_count into used_before from public.openai_beta_daily_usage where scope=a::text and kind='image';
  if used_before <> 2 then raise exception 'ASSERTION: denied attempt consumed quota'; end if;
  tests := tests + 1;

  if not public.consume_openai_beta_request(b,'image',2,3)
    or public.consume_openai_beta_request(b,'image',2,3) then
    raise exception 'ASSERTION: global ceiling across different owners'; end if;
  tests := tests + 1;
  if (select request_count from public.openai_beta_daily_usage where scope='global' and kind='image') <> 3
    or (select sum(request_count) from public.openai_beta_daily_usage where owner_id is not null and kind='image') <> 3 then
    raise exception 'ASSERTION: global and owner counts must conserve attempts'; end if;
  tests := tests + 1;

  if not public.consume_openai_beta_request(a,'analysis',1,1)
    or public.consume_openai_beta_request(b,'analysis',1,1) then
    raise exception 'ASSERTION: independent analysis quota'; end if;
  tests := tests + 1;

  set local role authenticated;
  begin
    perform public.consume_openai_beta_request(a,'image',2,3);
    raise exception 'ASSERTION: authenticated RPC should fail';
  exception when insufficient_privilege then null;
  end;
  reset role;
  tests := tests + 1;
  perform set_config('klay.beta_test.result', jsonb_build_object('passed',tests,'failed',0,'fixtures','transaction rollback')::text, true);
end;
$$;

select current_setting('klay.beta_test.result')::jsonb as beta_budget_behavioral_result;
rollback;
