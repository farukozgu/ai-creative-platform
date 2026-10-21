create table public.video_source_assets (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users (id) on delete cascade,
  bucket_id text not null default 'video-source-images', object_path text not null, mime_type text not null,
  size_bytes bigint not null, width integer not null, height integer not null, created_at timestamptz not null default now(),
  constraint video_source_assets_bucket_check check (bucket_id = 'video-source-images'),
  constraint video_source_assets_mime_check check (mime_type in ('image/jpeg', 'image/png')),
  constraint video_source_assets_size_check check (size_bytes between 1 and 26214400),
  constraint video_source_assets_dimensions_check check (width between 360 and 2000 and height between 360 and 2000),
  constraint video_source_assets_path_check check (array_length(string_to_array(object_path, '/'), 1) = 3 and split_part(object_path, '/', 1) = owner_id::text and split_part(object_path, '/', 2) = id::text and split_part(object_path, '/', 3) <> ''),
  constraint video_source_assets_object_unique unique (bucket_id, object_path)
);
create index video_source_assets_owner_created_idx on public.video_source_assets (owner_id, created_at desc);
alter table public.video_source_assets enable row level security;
create policy "Users can read their own video source assets" on public.video_source_assets for select to authenticated using ((select auth.uid()) = owner_id);
revoke all privileges on table public.video_source_assets from anon, authenticated, service_role;
grant select on table public.video_source_assets to authenticated;
grant select, insert, delete on table public.video_source_assets to service_role;

alter table public.generations
  add column owner_id uuid null references auth.users (id) on delete cascade,
  add column client_submission_id uuid null,
  add column video_mode text null,
  add column duration_seconds integer null,
  add column camera_movement text null,
  add column source_kind text null,
  add column source_id uuid null,
  add column endpoint_id text null,
  add column cancellation_status text null,
  add column error_code text null,
  add column output_size_bytes bigint null,
  add column estimated_provider_cost_usd numeric(12, 6) null,
  add column billing_reservation_id text null,
  add column billing_status text null,
  add column reconciliation_attempts integer null default 0,
  add column next_reconciliation_at timestamptz null;

update public.generations set owner_id = projects.user_id from public.projects where projects.id = generations.project_id and generations.owner_id is null;

alter table public.generations alter column owner_id set not null, alter column project_id drop not null, drop constraint if exists generations_quality_check;
alter table public.generations
  add constraint generations_quality_check check (quality is null or quality in ('preview', 'standard', 'low', 'medium', 'high', 'xhigh', 'max', 'auto', 'best')),
  add constraint generations_project_scope_check check (generation_type = 'video' or project_id is not null),
  add constraint generations_video_fields_check check (
    generation_type <> 'video' or (
      client_submission_id is not null and video_mode is not null and video_mode in ('image', 'text')
      and quality is not null and quality in ('auto', 'best')
      and aspect_ratio is not null and aspect_ratio in ('16:9', '9:16', '1:1')
      and duration_seconds is not null and duration_seconds in (5, 10)
      and camera_movement is not null and camera_movement in ('auto', 'dolly-in', 'dolly-out', 'orbit', 'pan-left', 'pan-right', 'static')
      and endpoint_id is not null and billing_status is not null and billing_status in ('not_configured', 'reserved', 'finalized', 'released', 'reconciliation_required')
      and reconciliation_attempts is not null and reconciliation_attempts between 0 and 24
    )
  ),
  add constraint generations_video_source_check check (
    generation_type <> 'video' or (video_mode = 'text' and source_kind is null and source_id is null)
    or (video_mode = 'image' and source_kind in ('generated-image', 'uploaded-image') and source_id is not null)
  ),
  add constraint generations_video_cancellation_check check (cancellation_status is null or cancellation_status in ('requested', 'confirmed', 'not_supported')),
  add constraint generations_video_error_code_check check (error_code is null or error_code in ('source_unavailable', 'billing_unavailable', 'provider_submission_ambiguous', 'provider_failure', 'output_invalid', 'output_persistence_failure', 'retry_limit_reached')),
  add constraint generations_video_output_check check (
    generation_type <> 'video' or (output_bucket_id is null and output_object_path is null and output_size_bytes is null)
    or (output_bucket_id = 'generated-videos' and output_object_path is not null and output_mime_type = 'video/mp4' and output_size_bytes > 0)
  ),
  add constraint generations_video_estimated_cost_check check (estimated_provider_cost_usd is null or estimated_provider_cost_usd >= 0),
  add constraint generations_video_terminal_output_check check (generation_type <> 'video' or status <> 'succeeded' or output_object_path is not null);

create unique index generations_video_owner_submission_unique on public.generations (owner_id, client_submission_id) where generation_type = 'video';
create unique index generations_video_provider_request_unique on public.generations (provider, endpoint_id, provider_request_id) where generation_type = 'video' and provider_request_id is not null;
create index generations_video_owner_created_idx on public.generations (owner_id, created_at desc) where generation_type = 'video';
create index generations_video_reconciliation_idx on public.generations (next_reconciliation_at) where generation_type = 'video' and status in ('queued', 'processing');

drop policy if exists "Authenticated users can select generations for their own projects" on public.generations;
create policy "Authenticated users can select their own generations" on public.generations for select to authenticated using (
  owner_id = (select auth.uid()) and (project_id is null or exists (select 1 from public.projects where public.projects.id = generations.project_id and public.projects.user_id = (select auth.uid())))
);

create function public.set_generation_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.owner_id is null and new.project_id is not null then
    select user_id into new.owner_id from public.projects where id = new.project_id;
  elsif tg_op = 'UPDATE' then
    new.owner_id = old.owner_id;
  end if;
  return new;
end;
$$;
create trigger generations_set_owner before insert or update on public.generations for each row execute function public.set_generation_owner();

create function public.enforce_video_generation_lifecycle()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.generation_type <> 'video' then return new; end if;
  new.client_submission_id = old.client_submission_id; new.provider = old.provider; new.endpoint_id = old.endpoint_id; new.model = old.model;
  if old.provider_request_id is not null and new.provider_request_id is distinct from old.provider_request_id then raise exception 'provider_request_id is immutable once assigned'; end if;
  if old.status in ('succeeded', 'failed') and new is distinct from old then raise exception 'terminal video generations are immutable'; end if;
  if old.status = 'queued' and new.status not in ('queued', 'processing', 'failed') then raise exception 'invalid queued video generation transition'; end if;
  if old.status = 'processing' and new.status not in ('processing', 'succeeded', 'failed') then raise exception 'invalid processing video generation transition'; end if;
  if old.status = 'queued' and new.status = 'processing' and new.processing_started_at is null then new.processing_started_at = clock_timestamp(); end if;
  if new.status in ('succeeded', 'failed') and new.status is distinct from old.status then new.processing_completed_at = clock_timestamp(); end if;
  return new;
end;
$$;
create trigger zz_generations_enforce_video_lifecycle before update on public.generations for each row execute function public.enforce_video_generation_lifecycle();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('video-source-images', 'video-source-images', false, 26214400, array['image/jpeg', 'image/png']::text[]),
  ('generated-videos', 'generated-videos', false, 262144000, array['video/mp4']::text[])
on conflict (id) do nothing;
create policy "Users can read their registered video source images" on storage.objects for select to authenticated using (
  bucket_id = 'video-source-images' and array_length(storage.foldername(name), 1) = 2 and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.video_source_assets where owner_id = (select auth.uid()) and object_path = name)
);
create policy "Users can read their generated videos" on storage.objects for select to authenticated using (
  bucket_id = 'generated-videos' and array_length(storage.foldername(name), 1) = 2 and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.generations where owner_id = (select auth.uid()) and generation_type = 'video' and status = 'succeeded' and output_object_path = name)
);
