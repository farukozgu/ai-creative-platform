-- No transaction control, provider calls, or real storage objects. Caller rolls back.
INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) VALUES
  ('f7100000-0000-4000-8000-000000000001','authenticated','authenticated','klay-f07-a@staging.invalid','','{}','{"klay_test_run":"phase-7f10"}',clock_timestamp(),clock_timestamp()),
  ('f7100000-0000-4000-8000-000000000002','authenticated','authenticated','klay-f07-b@staging.invalid','','{}','{"klay_test_run":"phase-7f10"}',clock_timestamp(),clock_timestamp());
INSERT INTO public.model_profiles(id,user_id,name,status,appearance) VALUES
  ('f7100000-0000-4000-8000-000000000011','f7100000-0000-4000-8000-000000000001','F07 model A1','draft','{}'),
  ('f7100000-0000-4000-8000-000000000012','f7100000-0000-4000-8000-000000000001','F07 model A2','draft','{}'),
  ('f7100000-0000-4000-8000-000000000013','f7100000-0000-4000-8000-000000000002','F07 model B','draft','{}'),
  ('f7100000-0000-4000-8000-000000000014','f7100000-0000-4000-8000-000000000001','F07 editable draft','draft','{}'),
  ('f7100000-0000-4000-8000-000000000015','f7100000-0000-4000-8000-000000000001','F07 draft archive control','draft','{}');
INSERT INTO public.model_candidate_jobs(id,model_id,user_id,idempotency_key,status,provider,model,appearance_snapshot,submission_state)
SELECT x.job_id,p.id,p.user_id,x.job_id,'succeeded','synthetic','fixture-only','{}','persisted'
FROM (VALUES
  ('f7100000-0000-4000-8000-000000000021'::uuid,'f7100000-0000-4000-8000-000000000011'::uuid),
  ('f7100000-0000-4000-8000-000000000022'::uuid,'f7100000-0000-4000-8000-000000000012'::uuid),
  ('f7100000-0000-4000-8000-000000000023'::uuid,'f7100000-0000-4000-8000-000000000013'::uuid)
) AS x(job_id,model_id) JOIN public.model_profiles p ON p.id=x.model_id;
INSERT INTO public.model_reference_assets(id,model_id,user_id,object_path,source,mime_type,byte_size)
SELECT x.reference_id,p.id,p.user_id,p.user_id::text||'/'||p.id::text||'/f07.png','candidate_generated','image/png',1
FROM (VALUES
  ('f7100000-0000-4000-8000-000000000031'::uuid,'f7100000-0000-4000-8000-000000000011'::uuid),
  ('f7100000-0000-4000-8000-000000000032'::uuid,'f7100000-0000-4000-8000-000000000012'::uuid),
  ('f7100000-0000-4000-8000-000000000033'::uuid,'f7100000-0000-4000-8000-000000000013'::uuid)
) AS x(reference_id,model_id) JOIN public.model_profiles p ON p.id=x.model_id;
INSERT INTO public.model_candidates(id,job_id,model_id,user_id,status,appearance_snapshot,primary_reference_asset_id)
SELECT x.candidate_id,j.id,j.model_id,j.user_id,'ready','{}',x.reference_id
FROM (VALUES
  ('f7100000-0000-4000-8000-000000000041'::uuid,'f7100000-0000-4000-8000-000000000021'::uuid,'f7100000-0000-4000-8000-000000000031'::uuid),
  ('f7100000-0000-4000-8000-000000000042'::uuid,'f7100000-0000-4000-8000-000000000022'::uuid,'f7100000-0000-4000-8000-000000000032'::uuid),
  ('f7100000-0000-4000-8000-000000000043'::uuid,'f7100000-0000-4000-8000-000000000023'::uuid,'f7100000-0000-4000-8000-000000000033'::uuid)
) AS x(candidate_id,job_id,reference_id) JOIN public.model_candidate_jobs j ON j.id=x.job_id;
SET LOCAL ROLE service_role;
SELECT public.approve_model_candidate('f7100000-0000-4000-8000-000000000041','f7100000-0000-4000-8000-000000000001');
SELECT public.approve_model_candidate('f7100000-0000-4000-8000-000000000042','f7100000-0000-4000-8000-000000000001');
SELECT public.approve_model_candidate('f7100000-0000-4000-8000-000000000043','f7100000-0000-4000-8000-000000000002');
RESET ROLE;
SELECT set_config('test.f07.foreign_version',(SELECT current_identity_version_id::text FROM public.model_profiles WHERE id='f7100000-0000-4000-8000-000000000013'),true);
SELECT set_config('test.f07.wrong_model_version',(SELECT current_identity_version_id::text FROM public.model_profiles WHERE id='f7100000-0000-4000-8000-000000000012'),true);
