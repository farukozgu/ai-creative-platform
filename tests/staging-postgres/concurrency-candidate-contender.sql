\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned
SET ROLE service_role;
SELECT id FROM public.claim_queued_model_candidate_jobs(1,120);
