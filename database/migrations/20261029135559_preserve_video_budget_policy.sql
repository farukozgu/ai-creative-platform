-- On a normal replay there is no session-local backup: preserve the policy
-- installed by the original Studio migration. Development's controlled
-- transition supplies the backup in the same transaction as both migrations.
do $migration$
declare
  saved_definition text;
begin
  if to_regclass('pg_temp.video_budget_policy_transition') is null then
    return;
  end if;
  select definition into strict saved_definition
    from pg_temp.video_budget_policy_transition;
  if saved_definition not like '%admin_owner constant uuid%'
     or saved_definition not like '%reserve_video_beta_budget%'
     or to_regprocedure('public.reserve_video_beta_budget_once(uuid,uuid,numeric,text,integer)') is null
     or to_regclass('public.video_studio_budget_settings') is null then
    raise exception 'Video budget policy transition precondition failed';
  end if;
  execute saved_definition;
  execute $function$
    create or replace function public.reserve_video_studio_budget_once(
      p_owner uuid, p_submission uuid, p_cost numeric, p_tier text, p_duration integer
    ) returns uuid language sql security definer set search_path = ''
    as 'select public.reserve_video_beta_budget_once($1, $2, $3, $4, $5)'
  $function$;
  revoke all on function public.reserve_video_studio_budget_once(uuid,uuid,numeric,text,integer)
    from public, anon, authenticated;
  grant execute on function public.reserve_video_studio_budget_once(uuid,uuid,numeric,text,integer)
    to service_role;
  comment on table public.video_studio_budget_settings is
    'Development compatibility: existing beta policy is authoritative; these settings do not alter it.';
end
$migration$;
