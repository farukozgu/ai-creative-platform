\set ON_ERROR_STOP on
\pset pager off
\pset tuples_only on
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
\ir fixture-base.sql

DO $function_grants$
BEGIN
  IF has_function_privilege('authenticated', 'public.approve_model_candidate(uuid,uuid)', 'EXECUTE') THEN RAISE EXCEPTION 'ASSERTION FAILED: authenticated can execute approval RPC'; END IF;
  RAISE NOTICE 'PASS: authenticated cannot execute approval RPC';
  IF has_function_privilege('anon', 'public.approve_model_candidate(uuid,uuid)', 'EXECUTE') THEN RAISE EXCEPTION 'ASSERTION FAILED: anon can execute approval RPC'; END IF;
  RAISE NOTICE 'PASS: anon cannot execute approval RPC';
  IF has_function_privilege('authenticated', 'public.claim_queued_model_candidate_jobs(integer,integer)', 'EXECUTE') THEN RAISE EXCEPTION 'ASSERTION FAILED: authenticated can claim candidate jobs'; END IF;
  RAISE NOTICE 'PASS: authenticated cannot claim candidate jobs';
  IF has_function_privilege('authenticated', 'public.renew_model_candidate_lease(uuid,uuid,bigint,integer)', 'EXECUTE') THEN RAISE EXCEPTION 'ASSERTION FAILED: authenticated can renew candidate leases'; END IF;
  RAISE NOTICE 'PASS: authenticated cannot renew candidate leases';
END;
$function_grants$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f7f50000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"f7f50000-0000-4000-8000-000000000001","role":"authenticated"}', true);
DO $client_version_write$
BEGIN
  BEGIN
    UPDATE public.model_identity_versions SET appearance = '{"tampered":true}'
    WHERE user_id = 'f7f50000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'ASSERTION FAILED: authenticated modified an immutable identity version';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: authenticated identity-version mutation denied by grants';
  END;
END;
$client_version_write$;
DO $client_version_delete$
BEGIN
  BEGIN
    DELETE FROM public.model_identity_versions
    WHERE user_id = 'f7f50000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'ASSERTION FAILED: authenticated deleted an immutable identity version';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: authenticated identity-version deletion denied by grants';
  END;
END;
$client_version_delete$;
DO $client_approval_call$
BEGIN
  BEGIN
    PERFORM public.approve_model_candidate('f7f50000-0000-4000-8000-000000000061', 'f7f50000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'ASSERTION FAILED: authenticated invoked approval RPC';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: authenticated approval RPC invocation denied';
  END;
END;
$client_approval_call$;
DO $client_direct_approval$
BEGIN
  PERFORM set_config('app.model_approval', 'on', true);
  BEGIN
    UPDATE public.model_profiles SET status = 'approved'
    WHERE id = 'f7f50000-0000-4000-8000-000000000023';
    RAISE EXCEPTION 'ASSERTION FAILED: authenticated directly approved a draft model using the custom GUC';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: authenticated direct approval denied by row policy';
  WHEN raise_exception THEN
    IF SQLERRM <> 'F07: approval requires protected RPC context' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: authenticated direct approval denied by F07 guard';
  END;
END;
$client_direct_approval$;
RESET ROLE;
ROLLBACK;
\echo KLAY_MODEL_CLIENT_PRIVILEGES_PASS
