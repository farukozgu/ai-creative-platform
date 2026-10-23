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

INSERT INTO public.generations (
  id, owner_id, project_id, generation_type, status, provider, model,
  creative_direction_snapshot, client_submission_id
) VALUES
  ('f7f50000-0000-4000-8000-000000000101', 'f7f50000-0000-4000-8000-000000000001', 'f7f50000-0000-4000-8000-000000000011', 'image', 'queued', 'synthetic', 'fixture-only', 'durable image fixture', 'f7f50000-0000-4000-8000-000000000102'),
  ('f7f50000-0000-4000-8000-000000000103', 'f7f50000-0000-4000-8000-000000000001', 'f7f50000-0000-4000-8000-000000000011', 'image', 'queued', 'synthetic', 'fixture-only', 'ambiguous image fixture', 'f7f50000-0000-4000-8000-000000000104');
UPDATE public.generations SET provider_submission_state = 'ambiguous' WHERE id = 'f7f50000-0000-4000-8000-000000000103';

SET LOCAL ROLE service_role;
DO $image_lease$
DECLARE claimed public.generations%rowtype; renewed public.generations%rowtype; n integer;
BEGIN
  SELECT * INTO claimed FROM public.claim_queued_image_generations(5, 60) WHERE id = 'f7f50000-0000-4000-8000-000000000101';
  IF claimed.id IS NULL THEN RAISE EXCEPTION 'ASSERTION FAILED: queued image generation was not claimed'; END IF;
  IF EXISTS (SELECT 1 FROM public.claim_queued_image_generations(5, 60) WHERE id = claimed.id) THEN RAISE EXCEPTION 'ASSERTION FAILED: live image lease was claimed twice'; END IF;
  SELECT * INTO renewed FROM public.renew_image_generation_lease(claimed.id, claimed.execution_lease_token, claimed.execution_lease_version, 60);
  IF renewed.id IS DISTINCT FROM claimed.id THEN RAISE EXCEPTION 'ASSERTION FAILED: valid image lease renewal failed'; END IF;
  PERFORM set_config('test.image_job_id', claimed.id::text, true);
  PERFORM set_config('test.image_lease_token', claimed.execution_lease_token::text, true);
  PERFORM set_config('test.image_lease_version', claimed.execution_lease_version::text, true);
  IF EXISTS (SELECT 1 FROM public.claim_queued_image_generations(5, 60) WHERE id = 'f7f50000-0000-4000-8000-000000000103') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: ambiguous provider submission was automatically reclaimed';
  END IF;
  RAISE NOTICE 'PASS: image lease claim, renewal, and ambiguous submission exclusion';
END;
$image_lease$;
RESET ROLE;

-- Use the database owner only to expire this synthetic lease deterministically.
UPDATE public.generations SET execution_lease_expires_at = clock_timestamp() - interval '1 second'
WHERE id = current_setting('test.image_job_id')::uuid;

SET LOCAL ROLE service_role;
DO $image_reclaim$
DECLARE claimed_version bigint; claimed_token uuid; reclaimed public.generations%rowtype; n integer;
BEGIN
  claimed_version := current_setting('test.image_lease_version')::bigint;
  claimed_token := current_setting('test.image_lease_token')::uuid;
  SELECT * INTO reclaimed FROM public.claim_queued_image_generations(5, 60)
  WHERE id = current_setting('test.image_job_id')::uuid;
  IF reclaimed.id IS NULL OR reclaimed.execution_lease_version <= claimed_version OR reclaimed.execution_lease_token = claimed_token THEN
    RAISE EXCEPTION 'ASSERTION FAILED: expired image job was not reclaimed with a new fencing lease';
  END IF;
  SELECT count(*) INTO n FROM public.renew_image_generation_lease(
    reclaimed.id, claimed_token, claimed_version, 60
  );
  IF n <> 0 THEN RAISE EXCEPTION 'ASSERTION FAILED: stale image lease renewed after reclaim'; END IF;
  RAISE NOTICE 'PASS: image expired-lease reclaim issues a new fence and rejects stale renewal';
END;
$image_reclaim$;

DO $image_idempotency$
BEGIN
  BEGIN
    INSERT INTO public.generations (owner_id, project_id, generation_type, status, provider, model, creative_direction_snapshot, client_submission_id)
    VALUES ('f7f50000-0000-4000-8000-000000000001', 'f7f50000-0000-4000-8000-000000000011', 'image', 'queued', 'synthetic', 'fixture-only', 'duplicate key', 'f7f50000-0000-4000-8000-000000000102');
    RAISE EXCEPTION 'ASSERTION FAILED: duplicate owner/submission image job was accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS: durable image idempotency rejects duplicate owner/submission key';
  END;
END;
$image_idempotency$;
RESET ROLE;

ROLLBACK;
\echo KLAY_IMAGE_LEASES_PASS
