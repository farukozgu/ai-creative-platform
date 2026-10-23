\set ON_ERROR_STOP on
\pset pager off
BEGIN;
SET LOCAL statement_timeout = '45s';
SET LOCAL lock_timeout = '5s';
\ir f07-assertions.sql
\ir f07-fixture.sql
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f7100000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"f7100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT set_config('app.model_approval','on',true);

SELECT pg_temp.f07_deny($sql$UPDATE public.model_profiles SET status='draft' WHERE id='f7100000-0000-4000-8000-000000000011'$sql$,
  'P0001','F07: approved status is immutable','authenticated approved to draft');
SELECT pg_temp.f07_deny($sql$UPDATE public.model_profiles SET status='archived' WHERE id='f7100000-0000-4000-8000-000000000011'$sql$,
  'P0001','F07: approved status is immutable','authenticated approved to archived');
SELECT pg_temp.f07_deny($sql$UPDATE public.model_profiles SET status='draft',current_identity_version_id=current_setting('test.f07.foreign_version')::uuid WHERE id='f7100000-0000-4000-8000-000000000011'$sql$,
  'P0001','F07: identity version must belong to this model and owner','authenticated foreign-owner pointer');
SELECT pg_temp.f07_deny($sql$UPDATE public.model_profiles SET status='draft',current_identity_version_id=current_setting('test.f07.wrong_model_version')::uuid WHERE id='f7100000-0000-4000-8000-000000000011'$sql$,
  'P0001','F07: identity version must belong to this model and owner','authenticated same-owner wrong-model pointer');
SELECT pg_temp.f07_deny($sql$UPDATE public.model_profiles SET status='draft',current_identity_version_id='f7100000-0000-4000-8000-000000000099' WHERE id='f7100000-0000-4000-8000-000000000011'$sql$,
  'P0001','F07: identity version must belong to this model and owner','authenticated nonexistent version',
  '23503','insert or update on table "model_profiles" violates foreign key constraint "model_profiles_current_identity_version_id_fkey"');
SELECT pg_temp.f07_deny($sql$UPDATE public.model_profiles SET status='approved' WHERE id='f7100000-0000-4000-8000-000000000014'$sql$,
  'P0001','F07: approval requires protected RPC context','authenticated forged-GUC direct approval',
  '42501','new row violates row-level security policy for table "model_profiles"');
SELECT pg_temp.f07_deny($sql$SELECT public.approve_model_candidate('f7100000-0000-4000-8000-000000000041','f7100000-0000-4000-8000-000000000001')$sql$,
  '42501','permission denied for function approve_model_candidate','authenticated approval RPC');
SELECT pg_temp.f07_deny($sql$UPDATE public.model_profiles SET approved_candidate_id='f7100000-0000-4000-8000-000000000099' WHERE id='f7100000-0000-4000-8000-000000000014'$sql$,
  'P0001','F07: approved candidate must belong to this model and owner','authenticated approval candidate manipulation');
SELECT pg_temp.f07_deny($sql$INSERT INTO public.model_profiles(id,user_id,name,status,appearance,current_identity_version_id)
  VALUES('f7100000-0000-4000-8000-000000000019','f7100000-0000-4000-8000-000000000001','F07 injected pointer','draft','{}',current_setting('test.f07.wrong_model_version')::uuid)$sql$,
  'P0001','F07: new profiles must be drafts without approval pointers','authenticated INSERT pointer injection');
SELECT pg_temp.f07_deny($sql$UPDATE public.model_identity_versions SET appearance='{"tampered":true}' WHERE model_id='f7100000-0000-4000-8000-000000000011'$sql$,
  '42501','permission denied for table model_identity_versions','authenticated identity version UPDATE');
SELECT pg_temp.f07_deny($sql$DELETE FROM public.model_identity_versions WHERE model_id='f7100000-0000-4000-8000-000000000011'$sql$,
  '42501','permission denied for table model_identity_versions','authenticated identity version DELETE');

UPDATE public.model_profiles SET name='F07 edited draft',appearance='{"edited":true}',notes='synthetic edit'
WHERE id='f7100000-0000-4000-8000-000000000014';
SELECT pg_temp.f07_assert(EXISTS(SELECT 1 FROM public.model_profiles WHERE id='f7100000-0000-4000-8000-000000000014'
  AND name='F07 edited draft' AND appearance='{"edited":true}'::jsonb),'legitimate authenticated draft editing');
INSERT INTO public.model_profiles(id,user_id,name,status,appearance)
VALUES('f7100000-0000-4000-8000-000000000018','f7100000-0000-4000-8000-000000000001','F07 client-created draft','draft','{}');
SELECT pg_temp.f07_assert(EXISTS(SELECT 1 FROM public.model_profiles WHERE id='f7100000-0000-4000-8000-000000000018' AND status='draft'),'legitimate authenticated draft creation');
UPDATE public.model_profiles SET status='archived' WHERE id='f7100000-0000-4000-8000-000000000015';
SELECT pg_temp.f07_assert(EXISTS(SELECT 1 FROM public.model_profiles WHERE id='f7100000-0000-4000-8000-000000000015' AND status='archived'),'legitimate draft archiving');
RESET ROLE;
SELECT pg_temp.f07_finish();
ROLLBACK;
\echo KLAY_F07_CLIENT_PASS
