create or replace function public.delete_owned_settled_video(p_owner_id uuid, p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_owner_id is null or p_job_id is null then return false; end if;
  if pg_catalog.to_regclass('public.video_fidelity_reviews') is not null then
    if exists (select 1 from public.video_fidelity_reviews
      where owner_id = p_owner_id and job_id = p_job_id and status not in ('succeeded', 'failed')) then
      return false;
    end if;
  end if;
  delete from public.generations
    where id = p_job_id and owner_id = p_owner_id and generation_type = 'video'
      and status in ('succeeded', 'failed')
      and billing_status in ('not_configured', 'finalized', 'released')
      and error_code is distinct from 'provider_submission_ambiguous';
  return found;
end;
$$;
revoke all on function public.delete_owned_settled_video(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_owned_settled_video(uuid, uuid) to service_role;
comment on function public.delete_owned_settled_video(uuid, uuid) is
'Server-only video deletion after authenticated ownership verification; restricted to terminal, settled video rows. No table DELETE grant.';
