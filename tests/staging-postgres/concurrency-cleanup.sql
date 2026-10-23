\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '5s';
DO $exact_cleanup$
DECLARE removed integer;
BEGIN
  DELETE FROM auth.users
  WHERE id='f7f50000-0000-4000-8000-000000000901'
    AND email='klay-concurrency@staging.invalid'
    AND raw_user_meta_data->>'klay_test_run'='phase-7f5-concurrency';
  GET DIAGNOSTICS removed = ROW_COUNT;
  IF removed NOT IN (0,1) THEN RAISE EXCEPTION 'ASSERTION FAILED: unexpected fixture cleanup row count'; END IF;
  RAISE NOTICE 'PASS: deleted only the exact marked synthetic concurrency identity if present';
END;
$exact_cleanup$;
COMMIT;
