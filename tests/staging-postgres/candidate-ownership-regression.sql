\set ON_ERROR_STOP on
\pset pager off
-- Opt-in post-migration probe. Execute only through a verified staging
-- connection. Independent of fixture-base.sql and all F-07 approval paths.
BEGIN;
SET LOCAL statement_timeout = '45s';
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.expect_ownership_rejection(statement text, expected_message text, label text)
RETURNS void LANGUAGE plpgsql AS $helper$
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> expected_message THEN RAISE; END IF;
    RAISE NOTICE 'PASS: %', label;
    RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % was accepted', label;
END;
$helper$;

INSERT INTO auth.users (id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('f7f70000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'klay-guard-a@staging.invalid', '', '{}', '{"klay_test_run":"phase-7f7-guard"}', clock_timestamp(), clock_timestamp()),
  ('f7f70000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'klay-guard-b@staging.invalid', '', '{}', '{"klay_test_run":"phase-7f7-guard"}', clock_timestamp(), clock_timestamp());

INSERT INTO public.model_profiles (id, user_id, name, status, appearance) VALUES
  ('f7f70000-0000-4000-8000-000000000011', 'f7f70000-0000-4000-8000-000000000001', 'Guard A1', 'draft', '{}'),
  ('f7f70000-0000-4000-8000-000000000012', 'f7f70000-0000-4000-8000-000000000001', 'Guard A2', 'draft', '{}'),
  ('f7f70000-0000-4000-8000-000000000013', 'f7f70000-0000-4000-8000-000000000002', 'Guard B', 'draft', '{}');

INSERT INTO public.model_candidate_jobs (id, model_id, user_id, idempotency_key, status, provider, model, appearance_snapshot) VALUES
  ('f7f70000-0000-4000-8000-000000000021', 'f7f70000-0000-4000-8000-000000000011', 'f7f70000-0000-4000-8000-000000000001', 'f7f70000-0000-4000-8000-000000000031', 'queued', 'synthetic', 'fixture-only', '{}'),
  ('f7f70000-0000-4000-8000-000000000022', 'f7f70000-0000-4000-8000-000000000012', 'f7f70000-0000-4000-8000-000000000001', 'f7f70000-0000-4000-8000-000000000032', 'queued', 'synthetic', 'fixture-only', '{}'),
  ('f7f70000-0000-4000-8000-000000000023', 'f7f70000-0000-4000-8000-000000000013', 'f7f70000-0000-4000-8000-000000000002', 'f7f70000-0000-4000-8000-000000000033', 'queued', 'synthetic', 'fixture-only', '{}');

INSERT INTO public.model_candidates (id, job_id, model_id, user_id, status, appearance_snapshot) VALUES
  ('f7f70000-0000-4000-8000-000000000041', 'f7f70000-0000-4000-8000-000000000021', 'f7f70000-0000-4000-8000-000000000011', 'f7f70000-0000-4000-8000-000000000001', 'pending', '{}'),
  ('f7f70000-0000-4000-8000-000000000042', 'f7f70000-0000-4000-8000-000000000023', 'f7f70000-0000-4000-8000-000000000013', 'f7f70000-0000-4000-8000-000000000002', 'pending', '{}');

UPDATE public.model_candidate_jobs SET status = 'processing', lease_token = gen_random_uuid(), lease_version = 1,
  lease_expires_at = clock_timestamp() + interval '2 minutes'
WHERE id = 'f7f70000-0000-4000-8000-000000000021';
UPDATE public.model_candidates SET status = 'failed'
WHERE id = 'f7f70000-0000-4000-8000-000000000041';

DO $valid_paths$
BEGIN
  IF (SELECT count(*) FROM public.model_candidate_jobs WHERE id IN (
    'f7f70000-0000-4000-8000-000000000021', 'f7f70000-0000-4000-8000-000000000022', 'f7f70000-0000-4000-8000-000000000023')) <> 3
    OR NOT EXISTS (SELECT 1 FROM public.model_candidate_jobs WHERE id='f7f70000-0000-4000-8000-000000000021' AND status='processing' AND lease_version=1)
    OR NOT EXISTS (SELECT 1 FROM public.model_candidates WHERE id='f7f70000-0000-4000-8000-000000000041' AND status='failed') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: legitimate INSERT/UPDATE paths did not persist inside the transaction';
  END IF;
  RAISE NOTICE 'PASS: valid job and candidate INSERT/UPDATE paths, including job rows without job_id';
END;
$valid_paths$;

SELECT pg_temp.expect_ownership_rejection($sql$
  INSERT INTO public.model_candidate_jobs (model_id,user_id,idempotency_key,model,appearance_snapshot)
  VALUES ('f7f70000-0000-4000-8000-000000000011','f7f70000-0000-4000-8000-000000000002',gen_random_uuid(),'fixture-only','{}')
$sql$, 'Model ownership mismatch', 'job INSERT with foreign model owner');

SELECT pg_temp.expect_ownership_rejection($sql$
  INSERT INTO public.model_candidate_jobs (model_id,user_id,idempotency_key,model,appearance_snapshot)
  VALUES ('f7f70000-0000-4000-8000-000000000099','f7f70000-0000-4000-8000-000000000001',gen_random_uuid(),'fixture-only','{}')
$sql$, 'Model ownership mismatch', 'job INSERT with missing model');

SELECT pg_temp.expect_ownership_rejection($sql$
  UPDATE public.model_candidate_jobs SET user_id='f7f70000-0000-4000-8000-000000000002'
  WHERE id='f7f70000-0000-4000-8000-000000000021'
$sql$, 'Model ownership mismatch', 'job UPDATE with foreign model owner');

SELECT pg_temp.expect_ownership_rejection($sql$
  INSERT INTO public.model_candidates (job_id,model_id,user_id,appearance_snapshot)
  VALUES ('f7f70000-0000-4000-8000-000000000023','f7f70000-0000-4000-8000-000000000011','f7f70000-0000-4000-8000-000000000001','{}')
$sql$, 'Candidate job ownership mismatch', 'candidate INSERT with foreign job');

SELECT pg_temp.expect_ownership_rejection($sql$
  INSERT INTO public.model_candidates (job_id,model_id,user_id,appearance_snapshot)
  VALUES ('f7f70000-0000-4000-8000-000000000022','f7f70000-0000-4000-8000-000000000011','f7f70000-0000-4000-8000-000000000001','{}')
$sql$, 'Candidate job ownership mismatch', 'candidate INSERT with same-owner but different-model job');

SELECT pg_temp.expect_ownership_rejection($sql$
  INSERT INTO public.model_candidates (job_id,model_id,user_id,appearance_snapshot)
  VALUES ('f7f70000-0000-4000-8000-000000000099','f7f70000-0000-4000-8000-000000000011','f7f70000-0000-4000-8000-000000000001','{}')
$sql$, 'Candidate job ownership mismatch', 'candidate INSERT with missing job');

SELECT pg_temp.expect_ownership_rejection($sql$
  UPDATE public.model_candidates SET job_id='f7f70000-0000-4000-8000-000000000022'
  WHERE id='f7f70000-0000-4000-8000-000000000041'
$sql$, 'Candidate job ownership mismatch', 'candidate UPDATE with different-model job');

SELECT pg_temp.expect_ownership_rejection($sql$
  UPDATE public.model_candidates SET job_id='f7f70000-0000-4000-8000-000000000023'
  WHERE id='f7f70000-0000-4000-8000-000000000041'
$sql$, 'Candidate job ownership mismatch', 'candidate UPDATE with foreign-owner job');

SELECT pg_temp.expect_ownership_rejection($sql$
  UPDATE public.model_candidates SET job_id='f7f70000-0000-4000-8000-000000000099'
  WHERE id='f7f70000-0000-4000-8000-000000000041'
$sql$, 'Candidate job ownership mismatch', 'candidate UPDATE with missing job');

SELECT pg_temp.expect_ownership_rejection($sql$
  UPDATE public.model_candidates SET user_id='f7f70000-0000-4000-8000-000000000002'
  WHERE id='f7f70000-0000-4000-8000-000000000041'
$sql$, 'Model ownership mismatch', 'candidate UPDATE with foreign model owner');

-- An accidental attachment to another table must reject before accessing fields.
CREATE TEMP TABLE klay_ownership_context_probe (id integer);
INSERT INTO klay_ownership_context_probe VALUES (1);
CREATE TRIGGER klay_ownership_context_probe_guard BEFORE INSERT OR UPDATE OR DELETE ON klay_ownership_context_probe
FOR EACH ROW EXECUTE FUNCTION public.enforce_model_candidate_ownership();
SELECT pg_temp.expect_ownership_rejection('INSERT INTO klay_ownership_context_probe VALUES (2)',
  'Unsupported candidate ownership trigger context', 'unexpected-schema/table attachment without model_id or job_id');
SELECT pg_temp.expect_ownership_rejection('UPDATE klay_ownership_context_probe SET id=2 WHERE id=1',
  'Unsupported candidate ownership trigger context', 'unexpected UPDATE context');
SELECT pg_temp.expect_ownership_rejection('DELETE FROM klay_ownership_context_probe WHERE id=1',
  'Unsupported candidate ownership trigger context', 'unexpected DELETE context without NEW fields');

CREATE TEMP TABLE klay_ownership_statement_probe (id integer);
CREATE TRIGGER klay_ownership_statement_probe_guard AFTER INSERT ON klay_ownership_statement_probe
FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_model_candidate_ownership();
SELECT pg_temp.expect_ownership_rejection('INSERT INTO klay_ownership_statement_probe VALUES (1)',
  'Unsupported candidate ownership trigger context', 'unexpected AFTER STATEMENT context');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f7f70000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"f7f70000-0000-4000-8000-000000000001","role":"authenticated"}', true);
DO $rls_remains$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.model_candidate_jobs WHERE id='f7f70000-0000-4000-8000-000000000021')
    OR EXISTS (SELECT 1 FROM public.model_candidate_jobs WHERE id='f7f70000-0000-4000-8000-000000000023')
    OR NOT EXISTS (SELECT 1 FROM public.model_candidates WHERE id='f7f70000-0000-4000-8000-000000000041')
    OR EXISTS (SELECT 1 FROM public.model_candidates WHERE id='f7f70000-0000-4000-8000-000000000042') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: authenticated owner read isolation changed';
  END IF;
  RAISE NOTICE 'PASS: authenticated job and candidate owner read isolation';
  BEGIN
    INSERT INTO public.model_candidate_jobs (model_id,user_id,idempotency_key,model,appearance_snapshot)
    VALUES ('f7f70000-0000-4000-8000-000000000011','f7f70000-0000-4000-8000-000000000001',gen_random_uuid(),'fixture-only','{}');
    RAISE EXCEPTION 'ASSERTION FAILED: authenticated inserted a service-managed candidate job';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: authenticated candidate job insertion still denied';
  END;
  BEGIN
    INSERT INTO public.model_candidates (job_id,model_id,user_id,appearance_snapshot)
    VALUES ('f7f70000-0000-4000-8000-000000000021','f7f70000-0000-4000-8000-000000000011','f7f70000-0000-4000-8000-000000000001','{}');
    RAISE EXCEPTION 'ASSERTION FAILED: authenticated inserted a service-managed candidate';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: authenticated candidate insertion still denied';
  END;
END;
$rls_remains$;
RESET ROLE;
ROLLBACK;
\echo KLAY_CANDIDATE_OWNERSHIP_REGRESSION_PASS
