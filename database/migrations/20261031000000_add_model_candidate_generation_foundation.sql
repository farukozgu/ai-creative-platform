create table public.model_candidate_jobs (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.model_profiles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key uuid not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'succeeded', 'failed', 'ambiguous')),
  provider text not null default 'openai',
  model text not null,
  appearance_snapshot jsonb not null check (jsonb_typeof(appearance_snapshot) = 'object'),
  provider_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(provider_metadata) = 'object'),
  error_code text null,
  lease_token uuid null,
  lease_expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, model_id, idempotency_key)
);
create index model_candidate_jobs_owner_model_idx on public.model_candidate_jobs (user_id, model_id, created_at desc);
create table public.model_candidates (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.model_candidate_jobs (id) on delete cascade,
  model_id uuid not null references public.model_profiles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed', 'rejected')),
  appearance_snapshot jsonb not null check (jsonb_typeof(appearance_snapshot) = 'object'),
  primary_reference_asset_id uuid null references public.model_reference_assets (id) on delete restrict,
  created_at timestamptz not null default now(),
  finalized_at timestamptz null
);
create index model_candidates_owner_model_idx on public.model_candidates (user_id, model_id, created_at desc);
alter table public.model_profiles add column current_identity_version_id uuid null references public.model_identity_versions (id) on delete restrict;
alter table public.model_candidate_jobs enable row level security;
alter table public.model_candidates enable row level security;
create policy "Owners select model candidate jobs" on public.model_candidate_jobs for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners insert queued candidate jobs" on public.model_candidate_jobs for insert to authenticated with check ((select auth.uid()) = user_id and status = 'queued');
create policy "Owners select model candidates" on public.model_candidates for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.model_candidate_jobs, public.model_candidates from anon, authenticated, service_role;
grant select, insert on public.model_candidate_jobs to authenticated;
grant select on public.model_candidates to authenticated;
create function public.set_model_candidate_job_timestamps() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = clock_timestamp(); return new; end; $$;
create trigger model_candidate_jobs_set_timestamps before update on public.model_candidate_jobs for each row execute function public.set_model_candidate_job_timestamps();
