\set ON_ERROR_STOP on
\pset pager off
\pset tuples_only on
\pset format unaligned

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

-- All rows below are synthetic and are rolled back at the end of this file.
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('f7f50000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'klay-staging-a@staging.invalid', '', clock_timestamp(), '{}', '{"klay_test_run":"phase-7f5"}', clock_timestamp(), clock_timestamp()),
  ('f7f50000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'klay-staging-b@staging.invalid', '', clock_timestamp(), '{}', '{"klay_test_run":"phase-7f5"}', clock_timestamp(), clock_timestamp());

INSERT INTO public.projects (id, user_id, title)
VALUES
  ('f7f50000-0000-4000-8000-000000000011', 'f7f50000-0000-4000-8000-000000000001', 'Klay staging fixture A'),
  ('f7f50000-0000-4000-8000-000000000012', 'f7f50000-0000-4000-8000-000000000002', 'Klay staging fixture B');

INSERT INTO public.model_profiles (id, user_id, name, status, appearance)
VALUES
  ('f7f50000-0000-4000-8000-000000000021', 'f7f50000-0000-4000-8000-000000000001', 'Klay synthetic model', 'draft', '{"fixture":true}'),
  ('f7f50000-0000-4000-8000-000000000022', 'f7f50000-0000-4000-8000-000000000001', 'Klay GUC regression model', 'draft', '{"fixture":true}');

INSERT INTO public.model_candidate_jobs (
  id, model_id, user_id, idempotency_key, status, provider, model,
  appearance_snapshot, submission_state
) VALUES (
  'f7f50000-0000-4000-8000-000000000031',
  'f7f50000-0000-4000-8000-000000000021',
  'f7f50000-0000-4000-8000-000000000001',
  'f7f50000-0000-4000-8000-000000000041', 'succeeded', 'synthetic',
  'fixture-only', '{"fixture":true}', 'persisted'
);

INSERT INTO public.model_reference_assets (
  id, model_id, user_id, object_path, source, mime_type, byte_size
) VALUES (
  'f7f50000-0000-4000-8000-000000000051',
  'f7f50000-0000-4000-8000-000000000021',
  'f7f50000-0000-4000-8000-000000000001',
  'f7f50000-0000-4000-8000-000000000001/f7f50000-0000-4000-8000-000000000021/synthetic.png',
  'candidate_generated', 'image/png', 1
);

INSERT INTO public.model_candidates (
  id, job_id, model_id, user_id, status, appearance_snapshot,
  primary_reference_asset_id
) VALUES (
  'f7f50000-0000-4000-8000-000000000061',
  'f7f50000-0000-4000-8000-000000000031',
  'f7f50000-0000-4000-8000-000000000021',
  'f7f50000-0000-4000-8000-000000000001',
  'ready', '{"fixture":true}', 'f7f50000-0000-4000-8000-000000000051'
);

CREATE FUNCTION pg_temp.assert_true(assertion boolean, label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF assertion IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', label;
  END IF;
  RAISE NOTICE 'PASS: %', label;
END;
$$;

-- Authenticated owner sees own row, not another user's row.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f7f50000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"f7f50000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SELECT pg_temp.assert_true(
  (SELECT count(*) = 1 FROM public.projects WHERE id = 'f7f50000-0000-4000-8000-000000000011'),
  'owner can read own project through RLS'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) = 0 FROM public.projects WHERE id = 'f7f50000-0000-4000-8000-000000000012'),
  'cross-user project read is denied by RLS'
);
DO $owner_write_denied$
BEGIN
  BEGIN
    INSERT INTO public.projects (user_id, title)
    VALUES ('f7f50000-0000-4000-8000-000000000002', 'cross-user insert must fail');
    RAISE EXCEPTION 'ASSERTION FAILED: authenticated user inserted a project for another owner';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: cross-user project insert rejected by RLS';
  END;
  BEGIN
    UPDATE public.projects
    SET user_id = 'f7f50000-0000-4000-8000-000000000002'
    WHERE id = 'f7f50000-0000-4000-8000-000000000011';
    RAISE EXCEPTION 'ASSERTION FAILED: authenticated user transferred project ownership';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: project ownership transfer rejected by RLS';
  END;
END;
$owner_write_denied$;
RESET ROLE;

-- Approval is the only supported path to an approved profile.
SET LOCAL ROLE service_role;
SELECT public.approve_model_candidate(
  'f7f50000-0000-4000-8000-000000000061',
  'f7f50000-0000-4000-8000-000000000001'
);
RESET ROLE;
SELECT pg_temp.assert_true(
  (SELECT status = 'approved' AND current_identity_version_id IS NOT NULL
   FROM public.model_profiles WHERE id = 'f7f50000-0000-4000-8000-000000000021'),
  'candidate approval sets profile and current immutable version'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) = 1 FROM public.model_identity_version_references r
   JOIN public.model_profiles p ON p.current_identity_version_id = r.identity_version_id
   WHERE p.id = 'f7f50000-0000-4000-8000-000000000021' AND r.view = 'front'),
  'approved version has its candidate reference evidence'
);

DO $immutable$
BEGIN
  BEGIN
    UPDATE public.model_identity_versions
    SET appearance = '{"tampered":true}'
    WHERE model_id = 'f7f50000-0000-4000-8000-000000000021';
    RAISE EXCEPTION 'ASSERTION FAILED: identity version update was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ASSERTION FAILED:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: identity version update rejected';
  END;
END;
$immutable$;

DO $immutable_delete$
BEGIN
  BEGIN
    DELETE FROM public.model_identity_versions
    WHERE model_id = 'f7f50000-0000-4000-8000-000000000021';
    RAISE EXCEPTION 'ASSERTION FAILED: identity version delete was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ASSERTION FAILED:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: identity version delete rejected';
  END;
END;
$immutable_delete$;

-- F-07 regression: a caller-set custom GUC must not authorize approval.
-- Current trigger code trusts this GUC, so this assertion should fail until a
-- corrective migration replaces the GUC trust boundary with an unforgeable one.
DO $guc_bypass$
BEGIN
  BEGIN
    PERFORM set_config('app.model_approval', 'off', true);
    PERFORM set_config('app.model_approval', 'on', true);
    UPDATE public.model_profiles
    SET status = 'approved'
    WHERE id = 'f7f50000-0000-4000-8000-000000000022';
    RAISE EXCEPTION 'ASSERTION FAILED: caller-set app.model_approval bypassed approval RPC';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ASSERTION FAILED:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: caller-set approval GUC rejected';
  END;
END;
$guc_bypass$;

ROLLBACK;
