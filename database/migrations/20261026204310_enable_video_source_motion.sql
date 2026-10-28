begin;

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

revoke all on function public.claim_source_motion_render(uuid,uuid),public.enforce_video_preservation_snapshot() from public,anon,authenticated;
grant execute on function public.claim_source_motion_render(uuid,uuid) to service_role;
commit;
