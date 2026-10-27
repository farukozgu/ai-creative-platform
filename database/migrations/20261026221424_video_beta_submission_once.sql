-- Additive admission wrapper. Existing reservation limits, data and functions stay intact.
begin;
create or replace function public.reserve_video_beta_budget_once(p_owner uuid, p_submission uuid, p_cost numeric, p_tier text, p_duration integer)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  -- Same transaction lock as reserve_video_beta_budget; duplicate and reserve are atomic.
  perform pg_advisory_xact_lock(7246193086541);
  if exists (select 1 from public.video_beta_reservations where owner_id = p_owner and submission_id = p_submission) then
    return null;
  end if;
  return public.reserve_video_beta_budget(p_owner, p_submission, p_cost, p_tier, p_duration);
end;
$$;
revoke all on function public.reserve_video_beta_budget_once(uuid,uuid,numeric,text,integer) from public, anon, authenticated;
grant execute on function public.reserve_video_beta_budget_once(uuid,uuid,numeric,text,integer) to service_role;
commit;
