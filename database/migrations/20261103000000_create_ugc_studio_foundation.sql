create table public.ugc_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text null,
  creator_concept jsonb not null,
  configuration jsonb not null,
  product_file_name text null,
  product_content_type text null,
  product_byte_size bigint null,
  product_object_path text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ugc_projects_title_check check (title is null or char_length(title) <= 120),
  constraint ugc_projects_creator_concept_check check (
    jsonb_typeof(creator_concept) = 'object'
    and creator_concept->>'reference_type' = 'placeholder_visual'
    and creator_concept->>'selection_id' in ('ada', 'deniz', 'maya')
  ),
  constraint ugc_projects_configuration_check check (
    jsonb_typeof(configuration) = 'object'
    and jsonb_typeof(configuration->'settings') = 'object'
    and jsonb_typeof(configuration->'script') = 'string'
    and char_length(configuration->>'script') <= 3000
    and configuration->>'format' in ('testimonial', 'review', 'unboxing', 'demo', 'story', 'problem')
    and configuration->'settings'->>'language' in ('tr', 'en')
    and configuration->'settings'->>'tone' in ('natural', 'energetic', 'professional')
    and configuration->'settings'->>'voice' in ('warm', 'bright', 'calm')
    and configuration->'settings'->>'environment' in ('home', 'studio', 'outdoor')
    and configuration->'settings'->>'lighting' in ('daylight', 'soft', 'warm')
    and configuration->'settings'->>'framing' in ('medium', 'close', 'wide')
    and configuration->'settings'->>'duration' in ('15', '30', '60')
    and configuration->'settings'->>'aspectRatio' in ('9:16', '1:1', '16:9')
    and jsonb_typeof(configuration->'settings'->'subtitles') = 'boolean'
  ),
  constraint ugc_projects_product_metadata_check check (
    (product_file_name is null and product_content_type is null and product_byte_size is null and product_object_path is null)
    or (
      product_file_name is not null and char_length(product_file_name) between 1 and 255
      and product_content_type in ('image/jpeg', 'image/png', 'image/webp')
      and product_byte_size between 1 and 10485760
      and product_object_path is not null
      and array_length(string_to_array(product_object_path, '/'), 1) = 3
      and split_part(product_object_path, '/', 1) = owner_id::text
      and split_part(product_object_path, '/', 2) = id::text
      and split_part(product_object_path, '/', 3) ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$'
    )
  ),
  constraint ugc_projects_id_owner_unique unique (id, owner_id)
);

create index ugc_projects_owner_updated_idx on public.ugc_projects (owner_id, updated_at desc);
alter table public.ugc_projects enable row level security;
create policy "UGC owners read their projects" on public.ugc_projects for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "UGC owners create their projects" on public.ugc_projects for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "UGC owners update their projects" on public.ugc_projects for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
revoke all on table public.ugc_projects from anon, authenticated, service_role;
grant select, insert, update on table public.ugc_projects to authenticated;
grant select, insert, update on table public.ugc_projects to service_role;

create function public.set_ugc_project_timestamps()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then new.created_at = clock_timestamp(); else new.created_at = old.created_at; end if;
  new.updated_at = clock_timestamp();
  return new;
end;
$$;
create trigger ugc_projects_set_timestamps before insert or update on public.ugc_projects
  for each row execute function public.set_ugc_project_timestamps();

create table public.ugc_video_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key uuid not null,
  request_hash text not null,
  request_snapshot jsonb not null,
  status text not null default 'draft',
  provider text null,
  provider_request_id text null,
  error_code text null,
  error_message text null,
  output_bucket_id text null,
  output_object_path text null,
  output_content_type text null,
  output_byte_size bigint null,
  duration_seconds numeric(8, 3) null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  constraint ugc_video_jobs_project_owner_fk foreign key (project_id, owner_id)
    references public.ugc_projects (id, owner_id) on delete cascade,
  constraint ugc_video_jobs_hash_check check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint ugc_video_jobs_snapshot_check check (jsonb_typeof(request_snapshot) = 'object'),
  constraint ugc_video_jobs_status_check check (status in ('draft', 'queued', 'processing', 'succeeded', 'failed', 'provider_submission_ambiguous')),
  constraint ugc_video_jobs_provider_check check (provider is null or char_length(provider) between 1 and 64),
  constraint ugc_video_jobs_provider_request_check check (provider_request_id is null or char_length(provider_request_id) <= 255),
  constraint ugc_video_jobs_error_check check (error_code is null or error_code in ('invalid_input', 'source_unavailable', 'provider_failure', 'provider_submission_ambiguous', 'output_invalid', 'output_persistence_failure', 'retry_limit_reached')),
  constraint ugc_video_jobs_error_message_check check (error_message is null or char_length(error_message) <= 1000),
  constraint ugc_video_jobs_result_check check (
    (status = 'succeeded'
      and output_bucket_id = 'ugc-generated-videos'
      and output_object_path is not null
      and output_content_type = 'video/mp4'
      and output_byte_size is not null and output_byte_size > 0
      and duration_seconds is not null and duration_seconds > 0
      and array_length(string_to_array(output_object_path, '/'), 1) = 3
      and split_part(output_object_path, '/', 1) = owner_id::text
      and split_part(output_object_path, '/', 2) = project_id::text
      and split_part(output_object_path, '/', 3) ~ '^[0-9a-f-]{36}\.mp4$')
    or (status <> 'succeeded'
      and output_bucket_id is null and output_object_path is null and output_content_type is null
      and output_byte_size is null and duration_seconds is null)
  ),
  constraint ugc_video_jobs_owner_idempotency_unique unique (owner_id, idempotency_key)
);

create index ugc_video_jobs_project_created_idx on public.ugc_video_jobs (project_id, created_at desc);
create index ugc_video_jobs_owner_created_idx on public.ugc_video_jobs (owner_id, created_at desc);
create unique index ugc_video_jobs_one_active_per_project_idx on public.ugc_video_jobs (project_id)
  where status in ('queued', 'processing', 'provider_submission_ambiguous');
alter table public.ugc_video_jobs enable row level security;
create policy "UGC owners read their video jobs" on public.ugc_video_jobs for select to authenticated
  using (owner_id = (select auth.uid()));
revoke all on table public.ugc_video_jobs from anon, authenticated, service_role;
grant select (id, project_id, owner_id, status, error_code, output_bucket_id, output_object_path,
  output_content_type, output_byte_size, duration_seconds, created_at, updated_at, completed_at)
  on table public.ugc_video_jobs to authenticated;
grant select, insert, update on table public.ugc_video_jobs to service_role;

create function public.set_ugc_job_timestamps()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'UGC jobs must be prepared before submission'; end if;
    new.created_at = clock_timestamp();
  else
    new.created_at = old.created_at;
    if old.status in ('succeeded', 'failed') and new.status <> old.status then
      raise exception 'Terminal UGC jobs cannot be reopened';
    end if;
    if old.status = 'draft' and new.status not in ('draft', 'queued', 'failed') then
      raise exception 'Invalid UGC job transition';
    end if;
    if old.status = 'queued' and new.status not in ('queued', 'processing', 'failed', 'provider_submission_ambiguous') then
      raise exception 'Invalid UGC job transition';
    end if;
    if old.status = 'processing' and new.status not in ('processing', 'succeeded', 'failed', 'provider_submission_ambiguous') then
      raise exception 'Invalid UGC job transition';
    end if;
    if old.status = 'provider_submission_ambiguous' and new.status not in ('provider_submission_ambiguous', 'processing', 'succeeded', 'failed') then
      raise exception 'Ambiguous UGC submissions require reconciliation';
    end if;
    if new.owner_id <> old.owner_id or new.project_id <> old.project_id
      or new.idempotency_key <> old.idempotency_key or new.request_hash <> old.request_hash
      or new.request_snapshot <> old.request_snapshot then
      raise exception 'UGC generation request snapshots are immutable';
    end if;
  end if;
  new.updated_at = clock_timestamp();
  if new.status in ('succeeded', 'failed') then new.completed_at = clock_timestamp(); end if;
  return new;
end;
$$;
create trigger ugc_video_jobs_set_timestamps before insert or update on public.ugc_video_jobs
  for each row execute function public.set_ugc_job_timestamps();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ugc-product-assets', 'ugc-product-assets', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ugc-generated-videos', 'ugc-generated-videos', false, 536870912, array['video/mp4']::text[])
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'ugc-product-assets' and name = 'ugc-product-assets'
    and public = false and file_size_limit = 10485760
    and allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]) then
    raise exception 'UGC product storage bucket must be private with the required upload constraints';
  end if;
  if not exists (select 1 from storage.buckets where id = 'ugc-generated-videos' and name = 'ugc-generated-videos'
    and public = false and file_size_limit = 536870912 and allowed_mime_types = array['video/mp4']::text[]) then
    raise exception 'UGC output storage bucket must be private with the required output constraints';
  end if;
end;
$$;

create policy "UGC owners read their saved product objects" on storage.objects for select to authenticated
  using (bucket_id = 'ugc-product-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.ugc_projects p where p.owner_id = (select auth.uid())
      and p.product_object_path = name));
create policy "UGC owners read successful video outputs" on storage.objects for select to authenticated
  using (bucket_id = 'ugc-generated-videos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.ugc_video_jobs j where j.owner_id = (select auth.uid())
      and j.status = 'succeeded' and j.output_bucket_id = bucket_id and j.output_object_path = name));

revoke all on function public.set_ugc_project_timestamps() from public, anon, authenticated;
revoke all on function public.set_ugc_job_timestamps() from public, anon, authenticated;
