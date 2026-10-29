-- DEVELOPMENT ONLY: identity-checked cleanup of this test's synthetic fixtures.
do $cleanup$
begin
  if exists(select 1 from auth.users where id='d29b49fd-b6fb-40f5-81ab-22b34ebca492'
    and email is distinct from 'klay-video-concurrency-d29b49fd@example.invalid')
    then raise exception 'Fixture identity mismatch; refusing cleanup'; end if;
  delete from public.video_source_assets where id='d29b49fd-b6fb-40f5-81ab-22b34ebca494' and owner_id='d29b49fd-b6fb-40f5-81ab-22b34ebca492';
  delete from auth.users where id='d29b49fd-b6fb-40f5-81ab-22b34ebca492' and email='klay-video-concurrency-d29b49fd@example.invalid';
end $cleanup$;
select not exists(select 1 from auth.users where id='d29b49fd-b6fb-40f5-81ab-22b34ebca492')
  and not exists(select 1 from public.video_beta_reservations where owner_id='d29b49fd-b6fb-40f5-81ab-22b34ebca492')
  and not exists(select 1 from public.video_source_assets where id='d29b49fd-b6fb-40f5-81ab-22b34ebca494') as fixture_cleanup_verified;
