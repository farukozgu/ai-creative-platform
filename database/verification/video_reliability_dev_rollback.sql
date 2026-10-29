-- Opt-in DEVELOPMENT ONLY: creative-ai-dev / fnzrnlvpkzwztccqzyzf.
-- No provider/Storage calls or schema changes. All fixtures are inside a forced
-- subtransaction rollback; an unexpected assertion also rolls back this statement.
do $gate$
declare
  owner_a uuid := 'cf663e91-d22b-47ae-9ed7-4acfbd7dd781';
  owner_b uuid := 'cf663e91-d22b-47ae-9ed7-4acfbd7dd782';
  source_a uuid := 'cf663e91-d22b-47ae-9ed7-4acfbd7dd783';
  source_b uuid := 'cf663e91-d22b-47ae-9ed7-4acfbd7dd784';
  job_a uuid := 'cf663e91-d22b-47ae-9ed7-4acfbd7dd785';
  job_b uuid := 'cf663e91-d22b-47ae-9ed7-4acfbd7dd786';
  submission_a uuid := 'cf663e91-d22b-47ae-9ed7-4acfbd7dd787';
  reservation_a uuid;
  claim_a public.generations;
  claim_b public.generations;
  affected integer;
  denied boolean;
  constraint_name text;
begin
  perform set_config('lock_timeout','2s',true);
  perform set_config('statement_timeout','15s',true);
  if exists(select 1 from auth.users where id in (owner_a,owner_b)) then raise exception 'Fixture collision'; end if;
  begin
    insert into auth.users(id,email) values
      (owner_a,'klay-video-rollback-a@example.invalid'),(owner_b,'klay-video-rollback-b@example.invalid');
    insert into public.video_source_assets(id,owner_id,object_path,mime_type,size_bytes,width,height) values
      (source_a,owner_a,owner_a||'/'||source_a||'/source.png','image/png',100,512,512),
      (source_b,owner_b,owner_b||'/'||source_b||'/source.png','image/png',100,512,512);

    -- Reproduce the actual empty-intent persistence mismatch without leaving a row.
    denied := false;
    begin
      insert into public.generations(owner_id,generation_type,provider,model,creative_direction_snapshot,
        video_mode,client_submission_id,quality,aspect_ratio,duration_seconds,camera_movement,endpoint_id,
        source_kind,source_id,billing_status,reconciliation_attempts)
      values(owner_a,'video','fal','kling-v3-standard-image','','image',gen_random_uuid(),'standard','1:1',5,'auto',
        'fal-ai/kling-video/v3/standard/image-to-video','uploaded-image',source_a,'reserved',0);
    exception when check_violation then
      get stacked diagnostics constraint_name = constraint_name;
      denied := constraint_name = 'generations_creative_direction_length_check';
    end;
    if not denied then raise exception 'Blank intent schema mismatch was not reproduced'; end if;

    reservation_a := public.reserve_video_beta_budget_once(owner_a,submission_a,0.000001,'standard',5);
    if reservation_a is null then raise exception 'First reservation rejected'; end if;
    if public.reserve_video_beta_budget_once(owner_a,submission_a,0.000001,'standard',5) is not null
      then raise exception 'Duplicate reservation admitted'; end if;
    insert into public.generations(id,owner_id,generation_type,provider,model,creative_direction_snapshot,
      video_mode,client_submission_id,quality,aspect_ratio,duration_seconds,camera_movement,endpoint_id,
      source_kind,source_id,billing_reservation_id,billing_status,reconciliation_attempts,provider_request_id)
    values(job_a,owner_a,'video','fal','kling-v3-standard-image','Verified server direction for blank user intent',
      'image',submission_a,'standard','1:1',5,'auto','fal-ai/kling-video/v3/standard/image-to-video',
      'uploaded-image',source_a,reservation_a::text,'reserved',0,'fixture-not-a-real-provider-job');

    select * into claim_a from public.claim_video_beta_reconciliations(owner_a,job_a,1);
    if claim_a.reconciliation_lease_token is null then raise exception 'Lease missing'; end if;
    if exists(select 1 from public.claim_video_beta_reconciliations(owner_a,job_a,1)) then raise exception 'Active lease reclaimed'; end if;
    update public.generations set reconciliation_lease_expires_at=clock_timestamp()-interval '1 second' where id=job_a;
    select * into claim_b from public.claim_video_beta_reconciliations(owner_a,job_a,1);
    if claim_b.reconciliation_lease_version <> claim_a.reconciliation_lease_version+1
      or claim_b.reconciliation_lease_token=claim_a.reconciliation_lease_token then raise exception 'Expired fence not replaced'; end if;
    update public.generations set status='processing' where id=job_a
      and reconciliation_lease_token=claim_a.reconciliation_lease_token and reconciliation_lease_version=claim_a.reconciliation_lease_version;
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'Stale worker updated job'; end if;
    if public.finalize_video_beta_budget(reservation_a,job_a,claim_a.reconciliation_lease_token,claim_a.reconciliation_lease_version)
      then raise exception 'Stale worker finalized budget'; end if;

    -- Same fields and fence as the repository's Storage retry checkpoint/release.
    update public.generations set status='processing',error_code='output_persistence_failure',reconciliation_attempts=1,
      next_reconciliation_at=clock_timestamp()+interval '1 minute',reconciliation_lease_token=null,reconciliation_lease_expires_at=null
      where id=job_a and reconciliation_lease_token=claim_b.reconciliation_lease_token
        and reconciliation_lease_version=claim_b.reconciliation_lease_version and reconciliation_lease_expires_at>clock_timestamp();
    get diagnostics affected = row_count;
    if affected<>1 then raise exception 'Retry checkpoint rejected'; end if;
    if exists(select 1 from public.claim_video_beta_reconciliations(owner_a,job_a,1)) then raise exception 'Backoff ignored'; end if;
    update public.generations set next_reconciliation_at=clock_timestamp()-interval '1 second' where id=job_a;
    select * into claim_b from public.claim_video_beta_reconciliations(owner_a,job_a,1);
    if claim_b.provider_request_id<>'fixture-not-a-real-provider-job' then raise exception 'Retry lost provider identity'; end if;
    update public.generations set output_bucket_id='generated-videos',output_object_path=owner_a||'/'||job_a||'/output.mp4',
      output_mime_type='video/mp4',output_size_bytes=1853,error_code=null where id=job_a;
    if not public.finalize_video_beta_budget(reservation_a,job_a,claim_b.reconciliation_lease_token,claim_b.reconciliation_lease_version)
      then raise exception 'Current fence did not finalize'; end if;
    update public.generations set status='succeeded',billing_status='finalized',reconciliation_lease_token=null,reconciliation_lease_expires_at=null
      where id=job_a and reconciliation_lease_token=claim_b.reconciliation_lease_token and reconciliation_lease_version=claim_b.reconciliation_lease_version;
    if exists(select 1 from public.claim_video_beta_reconciliations(owner_a,job_a,1)) then raise exception 'Completed job reclaimed'; end if;
    denied := false;
    begin update public.generations set error_code='provider_failure' where id=job_a;
    exception when raise_exception then denied := sqlerrm='terminal video generations are immutable'; end;
    if not denied then raise exception 'Completed row was mutable'; end if;

    insert into public.generations(id,owner_id,generation_type,provider,model,creative_direction_snapshot,
      video_mode,client_submission_id,quality,aspect_ratio,duration_seconds,camera_movement,endpoint_id,
      source_kind,source_id,billing_status,reconciliation_attempts)
    values(job_b,owner_b,'video','fal','kling-v3-standard-image','Isolated failed fixture','image',gen_random_uuid(),
      'standard','1:1',5,'auto','fal-ai/kling-video/v3/standard/image-to-video','uploaded-image',source_b,'reserved',0);
    update public.generations set status='failed',error_code='provider_failure',billing_status='reconciliation_required',
      reconciliation_lease_token=null,reconciliation_lease_expires_at=null where id=job_b;
    denied := false;
    begin update public.generations set status='processing' where id=job_b;
    exception when raise_exception then denied := sqlerrm='terminal video generations are immutable'; end;
    if not denied then raise exception 'Failed row was mutable'; end if;

    -- Use the real authenticated role and real RLS, not a WHERE-owner mock.
    perform set_config('request.jwt.claim.sub',owner_a::text,true);
    set local role authenticated;
    if not exists(select 1 from public.generations where id=job_a)
      or exists(select 1 from public.generations where id=job_b) then raise exception 'Generation ownership RLS failed'; end if;
    if not exists(select 1 from public.video_source_assets where id=source_a)
      or exists(select 1 from public.video_source_assets where id=source_b) then raise exception 'Source ownership RLS failed'; end if;
    denied := false;
    begin perform public.reserve_video_beta_budget_once(owner_a,gen_random_uuid(),0.000001,'standard',5);
    exception when insufficient_privilege then denied := true; end;
    if not denied then raise exception 'Authenticated caller reached reservation RPC'; end if;
    reset role;

    raise sqlstate 'ZK001' using message='KLAY_VIDEO_GATE_ROLLBACK_PASS';
  exception when sqlstate 'ZK001' then
    if sqlerrm<>'KLAY_VIDEO_GATE_ROLLBACK_PASS' then raise; end if;
  end;
  if exists(select 1 from auth.users where id in(owner_a,owner_b))
    or exists(select 1 from public.generations where id in(job_a,job_b))
    or exists(select 1 from public.video_beta_reservations where owner_id in(owner_a,owner_b))
    then raise exception 'Fixture rollback left residue'; end if;
end $gate$;
select 'PASS' as deployed_beta_rpc_state_rls, 'ROLLBACK VERIFIED' as fixture_cleanup,
  to_regprocedure('public.reserve_video_studio_budget_once(uuid,uuid,numeric,text,integer)') is not null as studio_rpc_installed;
