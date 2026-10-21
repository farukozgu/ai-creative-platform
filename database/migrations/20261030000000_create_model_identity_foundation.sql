create table public.model_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  status text not null default 'draft' check (status in ('draft', 'candidate_pending', 'identity_review_pending', 'approved', 'archived')),
  appearance jsonb not null check (jsonb_typeof(appearance) = 'object'),
  notes text null check (char_length(coalesce(notes, '')) <= 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null
);
create index model_profiles_owner_updated_idx on public.model_profiles (user_id, updated_at desc);

create table public.model_identity_versions (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.model_profiles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  version_number integer not null check (version_number > 0),
  appearance jsonb not null check (jsonb_typeof(appearance) = 'object'),
  created_at timestamptz not null default now(),
  unique (model_id, version_number)
);
create index model_identity_versions_owner_model_idx on public.model_identity_versions (user_id, model_id, version_number desc);

create table public.model_reference_assets (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.model_profiles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket_id text not null default 'model-reference-assets' check (bucket_id = 'model-reference-assets'),
  object_path text not null,
  source text not null check (source = 'candidate_generated'),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 20971520),
  created_at timestamptz not null default now(),
  unique (bucket_id, object_path),
  check (array_length(string_to_array(object_path, '/'), 1) = 3 and split_part(object_path, '/', 1) = user_id::text and split_part(object_path, '/', 2) = model_id::text and split_part(object_path, '/', 3) <> '')
);
create index model_reference_assets_owner_model_idx on public.model_reference_assets (user_id, model_id, created_at asc);

create table public.model_identity_version_references (
  identity_version_id uuid not null references public.model_identity_versions (id) on delete cascade,
  reference_asset_id uuid not null references public.model_reference_assets (id) on delete restrict,
  view text not null check (view in ('front', 'three_quarter', 'side')),
  primary key (identity_version_id, reference_asset_id),
  unique (identity_version_id, view)
);

create function public.set_model_profile_timestamps() returns trigger language plpgsql set search_path = '' as $$ begin
  if tg_op = 'INSERT' then new.created_at = clock_timestamp(); else new.created_at = old.created_at; end if;
  new.updated_at = clock_timestamp();
  if new.status = 'archived' and old.status <> 'archived' then new.archived_at = clock_timestamp(); end if;
  return new;
end; $$;
create trigger model_profiles_set_timestamps before insert or update on public.model_profiles for each row execute function public.set_model_profile_timestamps();

create function public.enforce_model_profile_transition() returns trigger language plpgsql set search_path = '' as $$ begin
  if old.status = 'archived' and new.status <> 'archived' then raise exception 'Archived model profiles cannot be restored'; end if;
  if new.status not in ('draft', 'archived') then raise exception 'Model status transition is not enabled'; end if;
  return new;
end; $$;
create trigger model_profiles_enforce_transition before update on public.model_profiles for each row execute function public.enforce_model_profile_transition();

create function public.enforce_model_version_ownership() returns trigger language plpgsql set search_path = '' as $$ begin
  if not exists (select 1 from public.model_profiles where id = new.model_id and user_id = new.user_id and status = 'approved') then raise exception 'Approved owned model required for identity version'; end if;
  return new;
end; $$;
create trigger model_identity_versions_enforce_ownership before insert on public.model_identity_versions for each row execute function public.enforce_model_version_ownership();

create function public.prevent_model_version_mutation() returns trigger language plpgsql set search_path = '' as $$ begin raise exception 'Identity versions are immutable'; end; $$;
create trigger model_identity_versions_immutable before update or delete on public.model_identity_versions for each row execute function public.prevent_model_version_mutation();

alter table public.model_profiles enable row level security;
alter table public.model_identity_versions enable row level security;
alter table public.model_reference_assets enable row level security;
alter table public.model_identity_version_references enable row level security;
create policy "Owners select model profiles" on public.model_profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners insert model profiles" on public.model_profiles for insert to authenticated with check ((select auth.uid()) = user_id and status = 'draft');
create policy "Owners update model profiles" on public.model_profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and status in ('draft', 'archived'));
create policy "Owners select model versions" on public.model_identity_versions for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners select model reference assets" on public.model_reference_assets for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners select model version references" on public.model_identity_version_references for select to authenticated using (exists (select 1 from public.model_identity_versions where id = identity_version_id and user_id = (select auth.uid())));
revoke all on public.model_profiles, public.model_identity_versions, public.model_reference_assets, public.model_identity_version_references from anon, authenticated, service_role;
grant select, insert, update on public.model_profiles to authenticated;
grant select on public.model_identity_versions, public.model_reference_assets, public.model_identity_version_references to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('model-reference-assets', 'model-reference-assets', false, 20971520, array['image/jpeg', 'image/png', 'image/webp']::text[]) on conflict (id) do nothing;
-- No authenticated storage write policy is intentionally created: candidate references are future server-authorized outputs only.
create policy "Owners read model reference objects" on storage.objects for select to authenticated using (bucket_id = 'model-reference-assets' and (storage.foldername(name))[1] = (select auth.uid())::text and exists (select 1 from public.model_reference_assets where bucket_id = 'model-reference-assets' and object_path = name and user_id = (select auth.uid())));
