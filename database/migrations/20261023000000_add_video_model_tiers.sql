-- Additive only: existing Auto/Best records remain readable as historical values.
alter table public.generations drop constraint if exists generations_quality_check;
alter table public.generations
  add constraint generations_quality_check check (quality is null or quality in ('preview', 'standard', 'pro', 'low', 'medium', 'high', 'xhigh', 'max', 'auto', 'best'));

alter table public.generations drop constraint if exists generations_video_fields_check;
alter table public.generations
  add constraint generations_video_fields_check check (
    generation_type <> 'video' or (
      client_submission_id is not null and video_mode is not null and video_mode in ('image', 'text')
      and quality is not null and quality in ('standard', 'pro', 'auto', 'best')
      and aspect_ratio is not null and aspect_ratio in ('16:9', '9:16', '1:1')
      and duration_seconds is not null and duration_seconds in (5, 10)
      and camera_movement is not null and camera_movement in ('auto', 'dolly-in', 'dolly-out', 'orbit', 'pan-left', 'pan-right', 'static')
      and endpoint_id is not null and billing_status is not null and billing_status in ('not_configured', 'reserved', 'finalized', 'released', 'reconciliation_required')
      and reconciliation_attempts is not null and reconciliation_attempts between 0 and 24
    )
  );
