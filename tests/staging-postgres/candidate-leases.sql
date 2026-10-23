\set ON_ERROR_STOP on
\pset pager off
\pset tuples_only on
BEGIN;
SET LOCAL statement_timeout = '45s';
SET LOCAL lock_timeout = '8s';
\ir fixture-base.sql

CREATE FUNCTION pg_temp.assert_true(assertion boolean, label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF assertion IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'PASS: %', label;
END;
$$;

SELECT pg_temp.assert_true(
  (SELECT p.status = 'approved' AND p.current_identity_version_id = v.id
   FROM public.model_profiles p JOIN public.model_identity_versions v
     ON v.id = p.current_identity_version_id AND v.model_id = p.id AND v.user_id = p.user_id
   WHERE p.id = 'f7f50000-0000-4000-8000-000000000021'),
  'approval RPC binds the identity version to the candidate model and owner'
);
SELECT pg_temp.assert_true(
  public.approve_model_candidate('f7f50000-0000-4000-8000-000000000061', 'f7f50000-0000-4000-8000-000000000001')
    = (SELECT current_identity_version_id FROM public.model_profiles WHERE id = 'f7f50000-0000-4000-8000-000000000021'),
  'same candidate approval replays the current version idempotently'
);

DO $candidate_owner_guard$
BEGIN
  BEGIN
    INSERT INTO public.model_candidate_jobs (model_id, user_id, idempotency_key, status, model, appearance_snapshot)
    VALUES ('f7f50000-0000-4000-8000-000000000021', 'f7f50000-0000-4000-8000-000000000002', 'f7f50000-0000-4000-8000-000000000091', 'queued', 'fixture-only', '{"fixture":true}');
    RAISE EXCEPTION 'ASSERTION FAILED: candidate job accepted a mismatched model owner';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ASSERTION FAILED:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: candidate job owner mismatch rejected';
  END;
  BEGIN
    INSERT INTO public.model_candidates (job_id, model_id, user_id, status, appearance_snapshot)
    VALUES ('f7f50000-0000-4000-8000-000000000031', 'f7f50000-0000-4000-8000-000000000021', 'f7f50000-0000-4000-8000-000000000002', 'pending', '{"fixture":true}');
    RAISE EXCEPTION 'ASSERTION FAILED: candidate accepted a mismatched job owner';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ASSERTION FAILED:%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: candidate/job owner mismatch rejected';
  END;
END;
$candidate_owner_guard$;

SET LOCAL ROLE service_role;
DO $candidate_lease$
DECLARE claimed public.model_candidate_jobs%rowtype; renewed public.model_candidate_jobs%rowtype; row_count integer;
BEGIN
  SELECT * INTO claimed FROM public.claim_queued_model_candidate_jobs(1, 120);
  IF claimed.id IS DISTINCT FROM 'f7f50000-0000-4000-8000-000000000033' THEN RAISE EXCEPTION 'ASSERTION FAILED: expected queued candidate job claim'; END IF;
  SELECT count(*) INTO row_count FROM public.claim_queued_model_candidate_jobs(1, 120);
  IF row_count <> 0 THEN RAISE EXCEPTION 'ASSERTION FAILED: already leased candidate job was claimed twice'; END IF;
  SELECT * INTO renewed FROM public.renew_model_candidate_lease(claimed.id, claimed.lease_token, claimed.lease_version, 120);
  IF renewed.id IS DISTINCT FROM claimed.id OR renewed.lease_version IS DISTINCT FROM claimed.lease_version THEN RAISE EXCEPTION 'ASSERTION FAILED: valid candidate lease renewal failed'; END IF;
  SELECT count(*) INTO row_count FROM public.renew_model_candidate_lease(claimed.id, gen_random_uuid(), claimed.lease_version, 120);
  IF row_count <> 0 THEN RAISE EXCEPTION 'ASSERTION FAILED: stale candidate lease token was accepted'; END IF;
  PERFORM set_config('test.candidate_job_id', claimed.id::text, true);
  PERFORM set_config('test.candidate_lease_token', claimed.lease_token::text, true);
  PERFORM set_config('test.candidate_lease_version', claimed.lease_version::text, true);
  RAISE NOTICE 'PASS: candidate claim exclusivity, renewal, and stale/expired fencing';
END;
$candidate_lease$;
RESET ROLE;
UPDATE public.model_candidate_jobs SET lease_expires_at = clock_timestamp() - interval '1 second'
WHERE id = current_setting('test.candidate_job_id')::uuid;
SET LOCAL ROLE service_role;
DO $candidate_expired$
DECLARE row_count integer;
BEGIN
  SELECT count(*) INTO row_count FROM public.renew_model_candidate_lease(
    current_setting('test.candidate_job_id')::uuid,
    current_setting('test.candidate_lease_token')::uuid,
    current_setting('test.candidate_lease_version')::bigint,120);
  IF row_count <> 0 THEN RAISE EXCEPTION 'ASSERTION FAILED: expired candidate lease was renewed'; END IF;
  RAISE NOTICE 'PASS: expired candidate lease renewal rejected';
END;
$candidate_expired$;
RESET ROLE;

ROLLBACK;
\echo KLAY_CANDIDATE_LEASES_PASS
