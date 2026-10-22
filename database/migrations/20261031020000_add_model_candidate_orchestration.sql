-- Depends on 20261030000000, 20261031000000 and 20261031010000.
alter table public.model_candidate_jobs add column if not exists lease_version bigint not null default 0;
alter table public.model_candidate_jobs add column if not exists provider_submitted_at timestamptz null;
create index if not exists model_candidate_jobs_claim_idx on public.model_candidate_jobs(status, created_at) where status='queued';
create function public.claim_queued_model_candidate_jobs(p_batch_size integer, p_lease_seconds integer) returns setof public.model_candidate_jobs language plpgsql security definer set search_path='' as $$
begin
 return query with picked as (select id from public.model_candidate_jobs where status='queued' and (lease_expires_at is null or lease_expires_at < clock_timestamp()) order by created_at for update skip locked limit greatest(1,least(p_batch_size,10)))
 update public.model_candidate_jobs j set status='processing', lease_token=gen_random_uuid(), lease_version=j.lease_version+1, lease_expires_at=clock_timestamp()+make_interval(secs=>greatest(30,least(p_lease_seconds,300))) from picked where j.id=picked.id returning j.*;
end; $$;
revoke all on function public.claim_queued_model_candidate_jobs(integer,integer) from public,anon,authenticated;
grant execute on function public.claim_queued_model_candidate_jobs(integer,integer) to service_role;
