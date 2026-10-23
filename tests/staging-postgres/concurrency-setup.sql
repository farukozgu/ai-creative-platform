\set ON_ERROR_STOP on
\pset pager off
BEGIN;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '5s';
DO $collision_guard$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id='f7f50000-0000-4000-8000-000000000901') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: reserved concurrency fixture identity already exists';
  END IF;
END;
$collision_guard$;
INSERT INTO auth.users (
  id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) VALUES (
  'f7f50000-0000-4000-8000-000000000901','authenticated','authenticated','klay-concurrency@staging.invalid','',
  clock_timestamp(),'{}','{"klay_test_run":"phase-7f5-concurrency"}',clock_timestamp(),clock_timestamp()
);
INSERT INTO public.projects (id,user_id,title)
VALUES ('f7f50000-0000-4000-8000-000000000902','f7f50000-0000-4000-8000-000000000901','Klay concurrent admission fixture');
INSERT INTO public.generations (
  id,owner_id,project_id,generation_type,status,provider,model,creative_direction_snapshot,client_submission_id
) VALUES (
  'f7f50000-0000-4000-8000-000000000903','f7f50000-0000-4000-8000-000000000901',
  'f7f50000-0000-4000-8000-000000000902','image','succeeded','synthetic','fixture-only','concurrency base image',
  'f7f50000-0000-4000-8000-000000000904'
);
INSERT INTO public.assets (id,user_id,project_id,bucket_id,object_path,asset_type)
VALUES ('f7f50000-0000-4000-8000-000000000908','f7f50000-0000-4000-8000-000000000901',
  'f7f50000-0000-4000-8000-000000000902','product-assets',
  'f7f50000-0000-4000-8000-000000000901/f7f50000-0000-4000-8000-000000000902/concurrency.png','product');
INSERT INTO public.model_profiles (id,user_id,name,status,appearance)
VALUES ('f7f50000-0000-4000-8000-000000000905','f7f50000-0000-4000-8000-000000000901','Klay concurrent candidate model','draft','{"fixture":true}');
INSERT INTO public.model_candidate_jobs (id,model_id,user_id,idempotency_key,status,model,appearance_snapshot)
VALUES
  ('f7f50000-0000-4000-8000-000000000906','f7f50000-0000-4000-8000-000000000905','f7f50000-0000-4000-8000-000000000901','f7f50000-0000-4000-8000-000000000916','queued','fixture-only','{"fixture":true}'),
  ('f7f50000-0000-4000-8000-000000000907','f7f50000-0000-4000-8000-000000000905','f7f50000-0000-4000-8000-000000000901','f7f50000-0000-4000-8000-000000000917','queued','fixture-only','{"fixture":true}');
COMMIT;
