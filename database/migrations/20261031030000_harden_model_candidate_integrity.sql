-- Depends on all four Model Studio migrations. Run transactionally; do not run against an unknown partial install.
alter table public.model_profiles add column if not exists approved_candidate_id uuid null unique;
alter table public.model_candidate_jobs add column if not exists submission_state text not null default 'not_started' check (submission_state in ('not_started','submitting','submitted','ambiguous','persisted'));
alter table public.model_candidate_jobs add column if not exists reconciliation_required_at timestamptz null;
create or replace function public.enforce_model_profile_transition() returns trigger language plpgsql set search_path='' as $$ begin
 if old.status='archived' and new.status<>'archived' then raise exception 'Archived model profiles cannot be restored'; end if;
 if new.status='approved' and current_setting('app.model_approval',true)<>'on' then raise exception 'Approval requires the trusted approval transaction'; end if;
 if new.status not in ('draft','archived','approved') then raise exception 'Model status transition is not enabled'; end if;
 return new;
end; $$;
create or replace function public.enforce_model_candidate_ownership() returns trigger language plpgsql set search_path='' as $$ begin
 if not exists(select 1 from public.model_profiles p where p.id=new.model_id and p.user_id=new.user_id) then raise exception 'Model ownership mismatch'; end if;
 if tg_table_name='model_candidates' and not exists(select 1 from public.model_candidate_jobs j where j.id=new.job_id and j.model_id=new.model_id and j.user_id=new.user_id) then raise exception 'Candidate job ownership mismatch'; end if;
 return new;
end; $$;
create trigger model_candidate_jobs_owner_guard before insert or update on public.model_candidate_jobs for each row execute function public.enforce_model_candidate_ownership();
create trigger model_candidates_owner_guard before insert or update on public.model_candidates for each row execute function public.enforce_model_candidate_ownership();
create or replace function public.enforce_model_version_reference_ownership() returns trigger language plpgsql set search_path='' as $$ begin
 if not exists(select 1 from public.model_identity_versions v join public.model_reference_assets a on a.id=new.reference_asset_id where v.id=new.identity_version_id and v.model_id=a.model_id and v.user_id=a.user_id) then raise exception 'Identity reference ownership mismatch'; end if; return new;
end; $$;
create trigger model_identity_version_references_owner_guard before insert on public.model_identity_version_references for each row execute function public.enforce_model_version_reference_ownership();
create or replace function public.approve_model_candidate(p_candidate_id uuid, p_owner_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.model_candidates; v uuid; n integer; begin
 perform set_config('app.model_approval','on',true);
 select * into c from public.model_candidates where id=p_candidate_id and user_id=p_owner_id for update; if not found then raise exception 'Candidate not found'; end if;
 select current_identity_version_id into v from public.model_profiles where id=c.model_id and user_id=p_owner_id for update;
 if v is not null then if exists(select 1 from public.model_profiles where id=c.model_id and approved_candidate_id=c.id) then return v; end if; raise exception 'Another candidate is already approved'; end if;
 if c.status<>'ready' or c.primary_reference_asset_id is null or not exists(select 1 from public.model_candidate_jobs j where j.id=c.job_id and j.model_id=c.model_id and j.user_id=p_owner_id and j.status='succeeded' and j.submission_state='persisted') then raise exception 'Candidate is not eligible'; end if;
 if not exists(select 1 from public.model_reference_assets a where a.id=c.primary_reference_asset_id and a.model_id=c.model_id and a.user_id=p_owner_id and a.source='candidate_generated') then raise exception 'Reference evidence is invalid'; end if;
 update public.model_profiles set status='approved',approved_candidate_id=c.id where id=c.model_id and user_id=p_owner_id;
 select coalesce(max(version_number),0)+1 into n from public.model_identity_versions where model_id=c.model_id;
 insert into public.model_identity_versions(model_id,user_id,version_number,appearance) values(c.model_id,p_owner_id,n,c.appearance_snapshot) returning id into v;
 insert into public.model_identity_version_references(identity_version_id,reference_asset_id,view) values(v,c.primary_reference_asset_id,'front'); update public.model_profiles set current_identity_version_id=v where id=c.model_id and user_id=p_owner_id; return v;
end; $$;
create function public.renew_model_candidate_lease(p_job_id uuid,p_lease_token uuid,p_lease_version bigint,p_lease_seconds integer) returns setof public.model_candidate_jobs language sql security definer set search_path='' as $$ update public.model_candidate_jobs j set lease_expires_at=clock_timestamp()+make_interval(secs=>greatest(60,least(coalesce(p_lease_seconds,120),300))) where j.id=p_job_id and j.status='processing' and j.lease_token=p_lease_token and j.lease_version=p_lease_version and j.lease_expires_at>clock_timestamp() and j.submission_state in ('not_started','submitting','submitted') returning j.*; $$;
revoke all on function public.renew_model_candidate_lease(uuid,uuid,bigint,integer) from public,anon,authenticated; grant execute on function public.renew_model_candidate_lease(uuid,uuid,bigint,integer) to service_role;
