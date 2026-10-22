-- Depends on 20261030000000 and 20261031000000. Do not apply independently.
drop policy if exists "Owners insert queued candidate jobs" on public.model_candidate_jobs;
create function public.approve_model_candidate(p_candidate_id uuid, p_owner_id uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_candidate public.model_candidates; v_version_id uuid; v_next_version integer;
begin
 select * into v_candidate from public.model_candidates where id = p_candidate_id and user_id = p_owner_id for update;
 if not found then raise exception 'Candidate not found'; end if;
 if v_candidate.status <> 'ready' or v_candidate.primary_reference_asset_id is null then raise exception 'Candidate is not eligible'; end if;
 if not exists (select 1 from public.model_candidate_jobs where id=v_candidate.job_id and model_id=v_candidate.model_id and user_id=p_owner_id and status='succeeded') then raise exception 'Candidate job is not complete'; end if;
 if not exists (select 1 from public.model_reference_assets where id=v_candidate.primary_reference_asset_id and model_id=v_candidate.model_id and user_id=p_owner_id and source='candidate_generated') then raise exception 'Reference evidence is invalid'; end if;
 select current_identity_version_id into v_version_id from public.model_profiles where id=v_candidate.model_id and user_id=p_owner_id for update;
 if v_version_id is not null then return v_version_id; end if;
 select coalesce(max(version_number),0)+1 into v_next_version from public.model_identity_versions where model_id=v_candidate.model_id;
 update public.model_profiles set status='approved' where id=v_candidate.model_id and user_id=p_owner_id;
 insert into public.model_identity_versions(model_id,user_id,version_number,appearance) values(v_candidate.model_id,p_owner_id,v_next_version,v_candidate.appearance_snapshot) returning id into v_version_id;
 insert into public.model_identity_version_references(identity_version_id,reference_asset_id,view) values(v_version_id,v_candidate.primary_reference_asset_id,'front');
 update public.model_profiles set current_identity_version_id=v_version_id where id=v_candidate.model_id and user_id=p_owner_id;
 return v_version_id;
end; $$;
revoke all on function public.approve_model_candidate(uuid,uuid) from public;
grant execute on function public.approve_model_candidate(uuid,uuid) to service_role;
