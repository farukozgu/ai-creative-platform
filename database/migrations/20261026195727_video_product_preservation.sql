begin;

create table public.video_fidelity_reviews (
  job_id uuid not null references public.generations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  evaluator_version text not null check (char_length(evaluator_version) between 1 and 80),
  model text not null check (model = 'gpt-4o-mini'),
  maximum_cost_usd numeric(12,6) not null check (maximum_cost_usd > 0 and maximum_cost_usd <= 1),
  pricing_version text not null check (char_length(pricing_version) between 1 and 80),
  locale text not null default 'tr' check (locale in ('tr','en')),
  status text not null default 'queued' check (status in ('queued','processing','submitting','succeeded','failed','uncertain')),
  claim_token uuid null,
  lease_expires_at timestamptz null,
  submitted_at timestamptz null,
  report jsonb null check (report is null or (jsonb_typeof(report) = 'object' and octet_length(report::text) <= 262144)),
  error_code text null check (error_code is null or char_length(error_code) <= 80),
  created_at timestamptz not null default now(),
  completed_at timestamptz null,
  primary key (job_id,evaluator_version),
  check (status <> 'succeeded' or report is not null),
  check (status not in ('submitting','succeeded','uncertain') or submitted_at is not null)
);
create index video_fidelity_reviews_owner_idx on public.video_fidelity_reviews(owner_id,created_at desc);
alter table public.video_fidelity_reviews enable row level security;
revoke all on public.video_fidelity_reviews from public,anon,authenticated,service_role;
grant select on public.video_fidelity_reviews to authenticated;
grant select,insert,update on public.video_fidelity_reviews to service_role;
create policy "Owners read their video fidelity reviews" on public.video_fidelity_reviews for select to authenticated
  using (owner_id = (select auth.uid()) and exists(select 1 from public.generations g where g.id=job_id and g.owner_id=(select auth.uid()) and g.generation_type='video'));

create function public.enforce_video_fidelity_review() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='INSERT' then
    if not exists(select 1 from public.generations g where g.id=new.job_id and g.owner_id=new.owner_id and g.generation_type='video' and g.status='succeeded' and g.provider='fal') then raise exception 'Owned completed Kling job required'; end if;
    if new.status <> 'queued' or new.claim_token is not null or new.submitted_at is not null or new.report is not null then raise exception 'Invalid initial review'; end if;
  else
    if (new.job_id,new.owner_id,new.evaluator_version,new.model,new.maximum_cost_usd,new.pricing_version,new.locale,new.created_at)
      is distinct from (old.job_id,old.owner_id,old.evaluator_version,old.model,old.maximum_cost_usd,old.pricing_version,old.locale,old.created_at) then raise exception 'Review consent is immutable'; end if;
    if old.status in ('succeeded','failed','uncertain') and new is distinct from old then raise exception 'Terminal reviews are immutable'; end if;
    if old.status='submitting' and new.status not in ('submitting','succeeded','uncertain') then raise exception 'Submitted review cannot be retried'; end if;
    if old.submitted_at is not null and new.submitted_at is distinct from old.submitted_at then raise exception 'Submission marker is immutable'; end if;
  end if;
  return new;
end; $$;
create trigger video_fidelity_review_guard before insert or update on public.video_fidelity_reviews for each row execute function public.enforce_video_fidelity_review();

create function public.claim_video_fidelity_review(p_owner uuid,p_job uuid,p_version text) returns uuid language plpgsql set search_path='' as $$
declare r public.video_fidelity_reviews; token uuid;
begin
  select * into r from public.video_fidelity_reviews where job_id=p_job and owner_id=p_owner and evaluator_version=p_version for update;
  if not found then return null; end if;
  if r.status='submitting' and r.lease_expires_at < clock_timestamp() then
    update public.video_fidelity_reviews set status='uncertain',error_code='provider_outcome_unknown',completed_at=clock_timestamp() where job_id=p_job and evaluator_version=p_version;
    return null;
  end if;
  if r.status not in ('queued','processing') or (r.status='processing' and r.lease_expires_at > clock_timestamp()) then return null; end if;
  token := gen_random_uuid();
  update public.video_fidelity_reviews set status='processing',claim_token=token,lease_expires_at=clock_timestamp()+interval '120 seconds' where job_id=p_job and evaluator_version=p_version;
  return token;
end; $$;

create function public.mark_video_fidelity_submitting(p_owner uuid,p_job uuid,p_version text,p_token uuid) returns boolean language plpgsql set search_path='' as $$
begin
  update public.video_fidelity_reviews set status='submitting',submitted_at=clock_timestamp()
    where job_id=p_job and owner_id=p_owner and evaluator_version=p_version and status='processing' and claim_token=p_token and lease_expires_at > clock_timestamp();
  return found;
end; $$;

create function public.claim_source_motion_render(p_owner uuid,p_job uuid) returns boolean language plpgsql set search_path='' as $$
begin
  perform pg_advisory_xact_lock(7246193086559);
  if exists(select 1 from public.generations where owner_id=p_owner and provider='local' and generation_type='video' and status='processing')
    or (select count(*) from public.generations where provider='local' and generation_type='video' and status='processing') >= 2 then return false; end if;
  update public.generations set status='processing' where id=p_job and owner_id=p_owner and generation_type='video' and provider='local'
    and model='source-motion-v1' and endpoint_id='local/source-motion' and status='queued' and provider_request_id is null
    and billing_reservation_id is null and billing_status='not_configured' and provider_metadata->'videoPreservation'->>'method'='source-motion';
  return found;
end; $$;

create function public.enforce_video_preservation_snapshot() returns trigger language plpgsql set search_path='' as $$
begin
  if old.generation_type='video' and new.provider_metadata->'videoPreservation' is distinct from old.provider_metadata->'videoPreservation' then raise exception 'Video preservation snapshot is immutable'; end if;
  return new;
end; $$;
create trigger video_preservation_snapshot_guard before update on public.generations for each row execute function public.enforce_video_preservation_snapshot();

revoke all on function public.claim_video_fidelity_review(uuid,uuid,text),public.mark_video_fidelity_submitting(uuid,uuid,text,uuid),public.claim_source_motion_render(uuid,uuid),public.enforce_video_fidelity_review(),public.enforce_video_preservation_snapshot() from public,anon,authenticated;
grant execute on function public.claim_video_fidelity_review(uuid,uuid,text),public.mark_video_fidelity_submitting(uuid,uuid,text,uuid),public.claim_source_motion_render(uuid,uuid) to service_role;
commit;
