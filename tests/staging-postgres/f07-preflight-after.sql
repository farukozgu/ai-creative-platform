\set ON_ERROR_STOP on
\pset pager off
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '5s';
DO $checks$
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 40
    OR (SELECT count(DISTINCT version) FROM supabase_migrations.schema_migrations) <> 40
    OR NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261101030000')
    OR NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261101020000') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: F07 expected exact 40-version repaired history';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid='public.enforce_model_profile_transition()'::pg_catalog.regprocedure)
    OR pg_catalog.has_function_privilege('authenticated','public.approve_model_candidate(uuid,uuid)','EXECUTE')
    OR pg_catalog.has_function_privilege('anon','public.approve_model_candidate(uuid,uuid)','EXECUTE')
    OR NOT pg_catalog.has_function_privilege('service_role','public.approve_model_candidate(uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: F07 guard or approval RPC privileges differ';
  END IF;
  IF pg_catalog.has_schema_privilege('authenticated','klay_model_security','USAGE')
    OR pg_catalog.has_schema_privilege('anon','klay_model_security','USAGE')
    OR pg_catalog.has_schema_privilege('service_role','klay_model_security','USAGE')
    OR EXISTS(SELECT 1 FROM klay_model_security.approval_context) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: F07 context access or residue';
  END IF;
  RAISE NOTICE 'PASS: F07 exact 40-version history and protected context prerequisites';
END;
$checks$;
ROLLBACK;
\echo KLAY_F07_PREFLIGHT_AFTER_PASS
