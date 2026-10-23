\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned
BEGIN;
DO $lock_fixture_job$
BEGIN
  PERFORM 1 FROM public.model_candidate_jobs WHERE id='f7f50000-0000-4000-8000-000000000906' FOR UPDATE;
END;
$lock_fixture_job$;
SELECT pg_sleep(6);
SET LOCAL ROLE service_role;
SELECT id FROM public.claim_queued_model_candidate_jobs(1,120);
COMMIT;
