-- Forward-only cleanup for the discontinued local video renderer.
-- Preserves generations, Video Library records, and the shared preservation snapshot trigger.
begin;

drop function if exists public.claim_source_motion_render(uuid, uuid);

commit;
