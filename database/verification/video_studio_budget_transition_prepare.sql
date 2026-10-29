-- Run only in the same transaction and connection as the historical Studio
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
