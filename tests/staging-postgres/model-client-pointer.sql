\set ON_ERROR_STOP on
\pset pager off
\pset tuples_only on
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
\ir fixture-base.sql
SELECT set_config('test.foreign_identity_version', (
  SELECT current_identity_version_id::text FROM public.model_profiles
  WHERE id = 'f7f50000-0000-4000-8000-000000000022'
), true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f7f50000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"f7f50000-0000-4000-8000-000000000001","role":"authenticated"}', true);

DO $client_pointer$
DECLARE affected integer;
BEGIN
  PERFORM set_config('app.model_approval', 'on', true);
  BEGIN
    UPDATE public.model_profiles
    SET status = 'draft', current_identity_version_id = current_setting('test.foreign_identity_version')::uuid
    WHERE id = 'f7f50000-0000-4000-8000-000000000021' AND status = 'approved';
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected = 1 THEN RAISE EXCEPTION 'ASSERTION FAILED: user changed approved status and pointed its model at another owner identity'; END IF;
    RAISE NOTICE 'PASS: cross-owner approved identity pointer update denied';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ASSERTION FAILED:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: cross-owner approved identity pointer update rejected (%).', SQLSTATE;
  END;
END;
$client_pointer$;
RESET ROLE;
ROLLBACK;
