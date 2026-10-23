\set ON_ERROR_STOP on
\pset pager off
\pset tuples_only on
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
\ir fixture-base.sql
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f7f50000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"f7f50000-0000-4000-8000-000000000001","role":"authenticated"}', true);

DO $client_status$
DECLARE affected integer;
BEGIN
  -- Custom GUCs can be set by ordinary sessions; this must not authorize a write.
  PERFORM set_config('app.model_approval', 'on', true);
  BEGIN
    UPDATE public.model_profiles SET status = 'draft'
    WHERE id = 'f7f50000-0000-4000-8000-000000000021' AND status = 'approved';
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected = 1 THEN RAISE EXCEPTION 'ASSERTION FAILED: authenticated owner downgraded an approved model'; END IF;
    RAISE NOTICE 'PASS: approved model status update denied';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ASSERTION FAILED:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: approved model status update rejected (%).', SQLSTATE;
  END;
END;
$client_status$;
RESET ROLE;
ROLLBACK;
