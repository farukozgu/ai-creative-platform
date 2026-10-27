-- Explicit disposable gklpgcyndeghjgemoonk only. All fixtures roll back.
begin;
create temporary table preservation_checks(name text,passed boolean) on commit drop;
do $$
declare u uuid:=gen_random_uuid(); v uuid:=gen_random_uuid(); j uuid:=gen_random_uuid(); k uuid:=gen_random_uuid(); l uuid:=gen_random_uuid(); a uuid; b uuid; denied boolean;
begin
  insert into auth.users(id,email) values(u,'preservation-a-'||u||'@staging.invalid'),(v,'preservation-b-'||v||'@staging.invalid');
  insert into public.generations(id,owner_id,generation_type,status,provider,model,creative_direction_snapshot,client_submission_id,video_mode,quality,aspect_ratio,duration_seconds,camera_movement,source_kind,source_id,endpoint_id,billing_status,output_bucket_id,output_object_path,output_mime_type,output_size_bytes)
  values(j,u,'video','succeeded','fal','kling-v3-standard-image','fixture',gen_random_uuid(),'image','standard','9:16',5,'static','uploaded-image',gen_random_uuid(),'fal-fixture','not_configured','generated-videos',u||'/'||j||'/output.mp4','video/mp4',100),
        (k,v,'video','succeeded','fal','kling-v3-standard-image','fixture',gen_random_uuid(),'image','standard','9:16',5,'static','uploaded-image',gen_random_uuid(),'fal-fixture','not_configured','generated-videos',v||'/'||k||'/output.mp4','video/mp4',100);
  insert into public.video_fidelity_reviews(job_id,owner_id,evaluator_version,model,maximum_cost_usd,pricing_version) values(j,u,'test-v1','gpt-4o-mini',0.02,'test'),(k,v,'test-v1','gpt-4o-mini',0.02,'test');
  denied:=false; begin insert into public.video_fidelity_reviews(job_id,owner_id,evaluator_version,model,maximum_cost_usd,pricing_version) values(j,v,'test-other','gpt-4o-mini',0.02,'test'); exception when others then denied:=true; end;
  insert into preservation_checks values('cross-owner review denied',denied);
  a:=public.claim_video_fidelity_review(u,j,'test-v1'); b:=public.claim_video_fidelity_review(u,j,'test-v1');
  insert into preservation_checks values('one active claim',a is not null and b is null),('wrong-owner claim denied',public.claim_video_fidelity_review(v,j,'test-v1') is null);
  insert into preservation_checks values('wrong-token submission denied',not public.mark_video_fidelity_submitting(u,j,'test-v1',gen_random_uuid())),('first submission marker',public.mark_video_fidelity_submitting(u,j,'test-v1',a)),('duplicate submission marker denied',not public.mark_video_fidelity_submitting(u,j,'test-v1',a));
  update public.video_fidelity_reviews set lease_expires_at=clock_timestamp()-interval '1 second' where job_id=j;
  b:=public.claim_video_fidelity_review(u,j,'test-v1');
  insert into preservation_checks select 'expired submitted review is uncertain', b is null and status='uncertain' from public.video_fidelity_reviews where job_id=j;
  denied:=false; begin update public.video_fidelity_reviews set status='queued' where job_id=j; exception when others then denied:=true; end;
  insert into preservation_checks values('uncertain review cannot retry',denied);
  denied:=false; begin update public.video_fidelity_reviews set maximum_cost_usd=0.03 where job_id=k; exception when others then denied:=true; end;
  insert into preservation_checks values('consent immutable',denied);
  insert into public.generations(id,owner_id,generation_type,status,provider,model,creative_direction_snapshot,client_submission_id,video_mode,quality,aspect_ratio,duration_seconds,camera_movement,source_kind,source_id,endpoint_id,billing_status,provider_metadata)
    values(l,u,'video','queued','fal','kling-v3-standard-image','fixture',gen_random_uuid(),'image','standard','9:16',5,'static','uploaded-image',gen_random_uuid(),'fal-ai/kling-video/v3/standard/image-to-video','not_configured','{"videoPreservation":{"method":"kling","version":"product-preservation-v2"}}');
  denied:=false; begin update public.generations set provider_metadata='{}' where id=l; exception when others then denied:=true; end;
  insert into preservation_checks values('Kling preservation snapshot immutable',denied);
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
end; $$;
set local role authenticated;
do $$ begin if (select count(*) from public.video_fidelity_reviews) <> 1 then raise exception 'Owner RLS failed'; end if; end $$;
reset role;
insert into preservation_checks values('owner RLS',true),('authenticated cannot mutate',not has_table_privilege('authenticated','public.video_fidelity_reviews','INSERT')),
  ('RPC service-only',not has_function_privilege('authenticated','public.claim_video_fidelity_review(uuid,uuid,text)','EXECUTE'));
select name,passed from preservation_checks order by name;
select count(*) as checks,bool_and(passed) as all_passed from preservation_checks;
rollback;
