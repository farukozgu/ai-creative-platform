-- Read only. Run separately against each explicitly selected Supabase project.
-- The historic migration cannot safely be replayed on a database whose beta
-- budget function has a locally installed administrator exception.
select
  exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20261027131744'
  ) as historical_migration_recorded,
  to_regclass('public.video_studio_budget_settings') is not null as studio_settings_present,
  to_regprocedure('public.reserve_video_studio_budget_once(uuid,uuid,numeric,text,integer)') is not null as studio_rpc_present,
  to_regprocedure('public.reserve_video_beta_budget_once(uuid,uuid,numeric,text,integer)') is not null as beta_once_present,
  coalesce((
    select pg_get_functiondef(p.oid) ~* 'admin_owner[[:space:]]+constant[[:space:]]+uuid'
    from pg_proc p
    where p.oid = to_regprocedure('public.reserve_video_beta_budget(uuid,uuid,numeric,text,integer)')
  ), false) as beta_has_local_admin_exception;
