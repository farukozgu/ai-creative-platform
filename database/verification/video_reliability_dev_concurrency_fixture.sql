-- DEVELOPMENT ONLY: creative-ai-dev / fnzrnlvpkzwztccqzyzf.
-- Run the companion cleanup even if the opt-in RPC test fails. No Storage file.
do $fixture$
begin
  if exists(select 1 from auth.users where id='d29b49fd-b6fb-40f5-81ab-22b34ebca492')
    then raise exception 'Concurrency fixture collision'; end if;
  insert into auth.users(id,email) values('d29b49fd-b6fb-40f5-81ab-22b34ebca492','klay-video-concurrency-d29b49fd@example.invalid');
  insert into public.video_source_assets(id,owner_id,object_path,mime_type,size_bytes,width,height)
    values('d29b49fd-b6fb-40f5-81ab-22b34ebca494','d29b49fd-b6fb-40f5-81ab-22b34ebca492',
      'd29b49fd-b6fb-40f5-81ab-22b34ebca492/d29b49fd-b6fb-40f5-81ab-22b34ebca494/source.png','image/png',1,512,512);
end $fixture$;
