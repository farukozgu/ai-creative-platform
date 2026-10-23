\set ON_ERROR_STOP on
\pset pager off
BEGIN;
SET LOCAL statement_timeout = '45s';
SET LOCAL lock_timeout = '5s';
\ir f07-assertions.sql
-- Test missing protected context before an approval RPC. A pooled backend may
-- already know the custom GUC, so do not assume its initial value is NULL.
SELECT current_setting('app.model_approval',true) IS NULL AS f07_observed_null_guc;
INSERT INTO auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
VALUES('f7100000-0000-4000-8000-000000000003','authenticated','authenticated','klay-f07-null@staging.invalid','','{}','{"klay_test_run":"phase-7f10"}',clock_timestamp(),clock_timestamp());
INSERT INTO public.model_profiles(id,user_id,name,status,appearance)
VALUES('f7100000-0000-4000-8000-000000000016','f7100000-0000-4000-8000-000000000003','F07 NULL-context control','draft','{}');
SELECT pg_temp.f07_deny($sql$UPDATE public.model_profiles SET status='approved' WHERE id='f7100000-0000-4000-8000-000000000016'$sql$,
  'P0001','F07: approval requires protected RPC context','database-owner missing-context approval',
  'P0001','Approval requires the trusted approval transaction');
SELECT set_config('app.model_approval',NULL,true);
SELECT pg_temp.f07_deny($sql$UPDATE public.model_profiles SET status='approved' WHERE id='f7100000-0000-4000-8000-000000000016'$sql$,
  'P0001','F07: approval requires protected RPC context','database-owner NULL/reset GUC with absent protected context',
  'P0001','Approval requires the trusted approval transaction');

\ir f07-fixture.sql
SELECT set_config('app.model_approval','on',true);
SELECT pg_temp.f07_deny($sql$UPDATE public.model_profiles SET status='approved' WHERE id='f7100000-0000-4000-8000-000000000014'$sql$,
  'P0001','F07: approval requires protected RPC context','database-owner forged-GUC approval');
SELECT set_config('app.model_approval','',true);
SELECT pg_temp.f07_deny($sql$UPDATE public.model_profiles SET status='approved' WHERE id='f7100000-0000-4000-8000-000000000014'$sql$,
  'P0001','F07: approval requires protected RPC context','database-owner empty-GUC approval',
  'P0001','Approval requires the trusted approval transaction');
SELECT pg_temp.f07_deny($sql$UPDATE public.model_profiles SET current_identity_version_id=NULL WHERE id='f7100000-0000-4000-8000-000000000011'$sql$,
  'P0001','F07: approved identity is immutable','database-owner approved pointer clearing',
  'P0001','Approval requires the trusted approval transaction');
SELECT set_config('app.model_approval','on',true);
SELECT pg_temp.f07_deny($sql$UPDATE public.model_profiles SET current_identity_version_id=NULL WHERE id='f7100000-0000-4000-8000-000000000011'$sql$,
  'P0001','F07: approved identity is immutable','database-owner forged-GUC approved pointer clearing');
SELECT pg_temp.f07_deny($sql$UPDATE public.model_identity_versions SET appearance='{"tampered":true}' WHERE model_id='f7100000-0000-4000-8000-000000000011'$sql$,
  'P0001','Identity versions are immutable','database-owner immutable version UPDATE');
SELECT pg_temp.f07_deny($sql$DELETE FROM public.model_identity_versions WHERE model_id='f7100000-0000-4000-8000-000000000011'$sql$,
  'P0001','Identity versions are immutable','database-owner immutable version DELETE');

SET LOCAL ROLE service_role;
SELECT public.approve_model_candidate('f7100000-0000-4000-8000-000000000041','f7100000-0000-4000-8000-000000000001');
RESET ROLE;
SELECT pg_temp.f07_assert((SELECT count(*)=1 FROM public.model_identity_versions WHERE model_id='f7100000-0000-4000-8000-000000000011'),'authorized approval replay preserves one version');
SELECT pg_temp.f07_assert((SELECT count(*)=3 FROM public.model_profiles p JOIN public.model_identity_versions v
  ON v.id=p.current_identity_version_id AND v.model_id=p.id AND v.user_id=p.user_id
  WHERE p.id IN ('f7100000-0000-4000-8000-000000000011','f7100000-0000-4000-8000-000000000012','f7100000-0000-4000-8000-000000000013') AND p.status='approved'),
  'authorized approval creates owned version pointers');
DO $context_acl$
BEGIN
  IF pg_catalog.to_regnamespace('klay_model_security') IS NOT NULL THEN
    IF pg_catalog.has_schema_privilege('authenticated','klay_model_security','USAGE')
      OR pg_catalog.has_schema_privilege('anon','klay_model_security','USAGE')
      OR pg_catalog.has_schema_privilege('service_role','klay_model_security','USAGE') THEN
      RAISE EXCEPTION 'ASSERTION FAILED: F07 private approval context schema is accessible';
    END IF;
    IF EXISTS(SELECT 1 FROM klay_model_security.approval_context) THEN
      RAISE EXCEPTION 'ASSERTION FAILED: F07 approval left a context row';
    END IF;
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM pg_temp.f07_deny('INSERT INTO klay_model_security.approval_context(backend_pid,transaction_id,model_id,owner_id,candidate_id) VALUES(1,1,gen_random_uuid(),gen_random_uuid(),gen_random_uuid())',
      '42501','permission denied for schema klay_model_security','authenticated context injection');
    EXECUTE 'RESET ROLE';
    EXECUTE 'SET LOCAL ROLE service_role';
    PERFORM pg_temp.f07_deny('INSERT INTO klay_model_security.approval_context(backend_pid,transaction_id,model_id,owner_id,candidate_id) VALUES(1,1,gen_random_uuid(),gen_random_uuid(),gen_random_uuid())',
      '42501','permission denied for schema klay_model_security','service-role context injection');
    EXECUTE 'RESET ROLE';
    RAISE NOTICE 'PASS: F07 private context inaccessible and empty after approval';
  END IF;
END;
$context_acl$;
SELECT pg_temp.f07_finish();
ROLLBACK;
\echo KLAY_F07_PRIVILEGED_PASS
