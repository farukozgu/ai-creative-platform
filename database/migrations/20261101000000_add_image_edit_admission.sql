-- Phase 7B.1.1. Additive only; depends on public.generations and auth.users.
-- Do not deploy until reviewed and verified in isolated PostgreSQL.
create table public.image_edit_admissions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  base_generation_id uuid not null references public.generations(id) on delete restrict,
  generation_id uuid null references public.generations(id) on delete restrict,
  submission_id uuid not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  state text not null check (state in ('admitted','preparing_submission','possibly_submitted','provider_responded','output_persisted','reconciliation_required','failed_pre_provider','failed_terminal')),
  lease_token uuid not null,
  lease_version bigint not null default 1 check (lease_version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(owner_id, submission_id)
);
create index image_edit_admissions_owner_active_idx on public.image_edit_admissions(owner_id, created_at)
  where state in ('admitted','preparing_submission','possibly_submitted','provider_responded','reconciliation_required');
create table public.image_edit_admission_settings (
  singleton boolean primary key default true check (singleton),
  max_active_edits integer not null default 2 check (max_active_edits between 1 and 10),
  updated_at timestamptz not null default clock_timestamp()
);
insert into public.image_edit_admission_settings(singleton, max_active_edits) values (true, 2) on conflict (singleton) do nothing;
alter table public.image_edit_admissions enable row level security;
alter table public.image_edit_admission_settings enable row level security;
revoke all on public.image_edit_admissions, public.image_edit_admission_settings from anon, authenticated, service_role;
grant select, insert, update on public.image_edit_admissions to service_role;
grant select, update on public.image_edit_admission_settings to service_role;

create function public.admit_image_edit(p_owner_id uuid, p_project_id uuid, p_base_generation_id uuid, p_submission_id uuid, p_request_fingerprint text)
returns table(outcome text, admission_id uuid, generation_id uuid, state text, lease_token uuid, lease_version bigint)
language plpgsql security definer set search_path = pg_catalog, public as $$
declare existing public.image_edit_admissions; configured_limit integer; active_count integer; token uuid := gen_random_uuid();
begin
  if p_owner_id is null or p_project_id is null or p_base_generation_id is null or p_submission_id is null or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    return query select 'unauthorized'::text, null::uuid, null::uuid, null::text, null::uuid, null::bigint; return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 71101));
  if not exists (select 1 from public.projects p join public.generations g on g.id=p_base_generation_id where p.id=p_project_id and p.user_id=p_owner_id and g.project_id=p_project_id and g.owner_id=p_owner_id and g.generation_type='image' and g.status='succeeded') then
    return query select 'unauthorized'::text, null::uuid, null::uuid, null::text, null::uuid, null::bigint; return;
  end if;
  select * into existing from public.image_edit_admissions where owner_id=p_owner_id and submission_id=p_submission_id for update;
  if found then
    if existing.request_fingerprint <> p_request_fingerprint then return query select 'payload_conflict'::text, existing.id, existing.generation_id, existing.state, null::uuid, null::bigint; return; end if;
    if existing.state='failed_pre_provider' then
      update public.image_edit_admissions set state='admitted', lease_token=token, lease_version=existing.lease_version+1, updated_at=clock_timestamp() where id=existing.id;
      return query select 'admitted'::text, existing.id, existing.generation_id, 'admitted'::text, token, existing.lease_version+1; return;
    end if;
    return query select 'replay'::text, existing.id, existing.generation_id, existing.state, null::uuid, existing.lease_version; return;
  end if;
  select max_active_edits into configured_limit from public.image_edit_admission_settings where singleton=true for update;
  select count(*) into active_count from public.image_edit_admissions where owner_id=p_owner_id and state in ('admitted','preparing_submission','possibly_submitted','provider_responded','reconciliation_required');
  if active_count >= coalesce(configured_limit, 2) then return query select 'capacity'::text, null::uuid, null::uuid, null::text, null::uuid, null::bigint; return; end if;
  insert into public.image_edit_admissions(owner_id,project_id,base_generation_id,submission_id,request_fingerprint,state,lease_token) values(p_owner_id,p_project_id,p_base_generation_id,p_submission_id,p_request_fingerprint,'admitted',token) returning id into admission_id;
  return query select 'admitted'::text, admission_id, null::uuid, 'admitted'::text, token, 1::bigint;
end; $$;

create function public.bind_image_edit_admission_generation(p_admission_id uuid, p_lease_token uuid, p_lease_version bigint, p_generation_id uuid)
returns boolean language sql security definer set search_path = pg_catalog, public as $$
  update public.image_edit_admissions set generation_id=p_generation_id, state='preparing_submission', updated_at=clock_timestamp()
  where id=p_admission_id and lease_token=p_lease_token and lease_version=p_lease_version and state='admitted' returning true;
$$;
create function public.transition_image_edit_admission(p_admission_id uuid, p_lease_token uuid, p_lease_version bigint, p_state text)
returns boolean language sql security definer set search_path = pg_catalog, public as $$
  update public.image_edit_admissions set state=p_state, updated_at=clock_timestamp()
  where id=p_admission_id and lease_token=p_lease_token and lease_version=p_lease_version
    and state in ('admitted','preparing_submission','possibly_submitted','provider_responded')
    and p_state in ('possibly_submitted','provider_responded','output_persisted','reconciliation_required','failed_pre_provider','failed_terminal') returning true;
$$;
revoke all on function public.admit_image_edit(uuid,uuid,uuid,uuid,text), public.bind_image_edit_admission_generation(uuid,uuid,bigint,uuid), public.transition_image_edit_admission(uuid,uuid,bigint,text) from public, anon, authenticated;
grant execute on function public.admit_image_edit(uuid,uuid,uuid,uuid,text), public.bind_image_edit_admission_generation(uuid,uuid,bigint,uuid), public.transition_image_edit_admission(uuid,uuid,bigint,text) to service_role;
