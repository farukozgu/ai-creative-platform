\set ON_ERROR_STOP on
\pset pager off
\pset tuples_only on
BEGIN;
SET LOCAL statement_timeout = '45s';
SET LOCAL lock_timeout = '8s';
\ir fixture-base.sql

SET LOCAL ROLE service_role;
DO $admission_assertions$
DECLARE
  edit_one record; edit_two record; edit_three record; replay record; conflict record; decision boolean;
  reanalysis_one record; reanalysis_two record; reanalysis_replay record; n integer;
BEGIN
  SELECT * INTO edit_one FROM public.admit_image_edit(
    'f7f50000-0000-4000-8000-000000000001','f7f50000-0000-4000-8000-000000000011',
    'f7f50000-0000-4000-8000-000000000016','f7f50000-0000-4000-8000-000000000111',repeat('a',64));
  IF edit_one.outcome IS DISTINCT FROM 'admitted' THEN RAISE EXCEPTION 'ASSERTION FAILED: first image edit admission: %', edit_one.outcome; END IF;
  SELECT * INTO replay FROM public.admit_image_edit(
    'f7f50000-0000-4000-8000-000000000001','f7f50000-0000-4000-8000-000000000011',
    'f7f50000-0000-4000-8000-000000000016','f7f50000-0000-4000-8000-000000000111',repeat('a',64));
  IF replay.outcome IS DISTINCT FROM 'replay' OR replay.admission_id IS DISTINCT FROM edit_one.admission_id THEN RAISE EXCEPTION 'ASSERTION FAILED: image edit same-key replay'; END IF;
  SELECT * INTO conflict FROM public.admit_image_edit(
    'f7f50000-0000-4000-8000-000000000001','f7f50000-0000-4000-8000-000000000011',
    'f7f50000-0000-4000-8000-000000000016','f7f50000-0000-4000-8000-000000000111',repeat('b',64));
  IF conflict.outcome IS DISTINCT FROM 'payload_conflict' THEN RAISE EXCEPTION 'ASSERTION FAILED: image edit changed-payload conflict'; END IF;
  SELECT * INTO edit_two FROM public.admit_image_edit(
    'f7f50000-0000-4000-8000-000000000001','f7f50000-0000-4000-8000-000000000011',
    'f7f50000-0000-4000-8000-000000000016','f7f50000-0000-4000-8000-000000000112',repeat('c',64));
  IF edit_two.outcome IS DISTINCT FROM 'admitted' THEN RAISE EXCEPTION 'ASSERTION FAILED: second image edit did not use available slot'; END IF;
  SELECT * INTO edit_three FROM public.admit_image_edit(
    'f7f50000-0000-4000-8000-000000000001','f7f50000-0000-4000-8000-000000000011',
    'f7f50000-0000-4000-8000-000000000016','f7f50000-0000-4000-8000-000000000113',repeat('d',64));
  IF edit_three.outcome IS DISTINCT FROM 'capacity' THEN RAISE EXCEPTION 'ASSERTION FAILED: image edit active limit of 2 was not enforced'; END IF;
  SELECT public.transition_image_edit_admission(edit_one.admission_id,edit_one.lease_token,edit_one.lease_version,'reconciliation_required') INTO decision;
  IF decision IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: image edit reconciliation transition'; END IF;
  SELECT * INTO edit_three FROM public.admit_image_edit(
    'f7f50000-0000-4000-8000-000000000001','f7f50000-0000-4000-8000-000000000011',
    'f7f50000-0000-4000-8000-000000000016','f7f50000-0000-4000-8000-000000000113',repeat('d',64));
  IF edit_three.outcome IS DISTINCT FROM 'capacity' THEN RAISE EXCEPTION 'ASSERTION FAILED: reconciliation-required edit was not counted active'; END IF;
  SELECT public.transition_image_edit_admission(edit_one.admission_id,gen_random_uuid(),edit_one.lease_version,'failed_pre_provider') INTO decision;
  IF decision IS DISTINCT FROM false THEN RAISE EXCEPTION 'ASSERTION FAILED: stale image-edit lease token transitioned state'; END IF;
  SELECT public.transition_image_edit_admission(edit_two.admission_id,edit_two.lease_token,edit_two.lease_version,'output_persisted') INTO decision;
  IF decision IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: output_persisted transition'; END IF;

  SELECT * INTO reanalysis_one FROM public.admit_product_reanalysis('f7f50000-0000-4000-8000-000000000001','f7f50000-0000-4000-8000-000000000013');
  IF reanalysis_one.outcome IS DISTINCT FROM 'admitted' THEN RAISE EXCEPTION 'ASSERTION FAILED: first reanalysis admission'; END IF;
  SELECT * INTO reanalysis_replay FROM public.admit_product_reanalysis('f7f50000-0000-4000-8000-000000000001','f7f50000-0000-4000-8000-000000000013');
  IF reanalysis_replay.outcome IS DISTINCT FROM 'replay' THEN RAISE EXCEPTION 'ASSERTION FAILED: reanalysis replay'; END IF;
  SELECT * INTO reanalysis_two FROM public.admit_product_reanalysis('f7f50000-0000-4000-8000-000000000001','f7f50000-0000-4000-8000-000000000015');
  IF reanalysis_two.outcome IS DISTINCT FROM 'capacity' THEN RAISE EXCEPTION 'ASSERTION FAILED: reanalysis active limit of 1'; END IF;
  SELECT public.transition_product_reanalysis_admission(reanalysis_one.admission_id,reanalysis_one.lease_token,reanalysis_one.lease_version,'possibly_submitted') INTO decision;
  IF decision IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: reanalysis possibly_submitted transition'; END IF;
  SELECT * INTO reanalysis_replay FROM public.admit_product_reanalysis('f7f50000-0000-4000-8000-000000000001','f7f50000-0000-4000-8000-000000000013');
  IF reanalysis_replay.outcome IS DISTINCT FROM 'replay' THEN RAISE EXCEPTION 'ASSERTION FAILED: ambiguous/possibly_submitted reanalysis was not replay-protected'; END IF;
  SELECT public.transition_product_reanalysis_admission(reanalysis_one.admission_id,reanalysis_one.lease_token,reanalysis_one.lease_version,'provider_responded') INTO decision;
  IF decision IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: reanalysis provider_responded transition'; END IF;
  SELECT public.transition_product_reanalysis_admission(reanalysis_one.admission_id,reanalysis_one.lease_token,reanalysis_one.lease_version,'completed') INTO decision;
  IF decision IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: reanalysis completed transition'; END IF;
  SELECT * INTO reanalysis_replay FROM public.admit_product_reanalysis('f7f50000-0000-4000-8000-000000000001','f7f50000-0000-4000-8000-000000000013');
  IF reanalysis_replay.outcome IS DISTINCT FROM 'cooldown' THEN RAISE EXCEPTION 'ASSERTION FAILED: reanalysis cooldown not enforced'; END IF;
  UPDATE public.product_reanalysis_admissions SET cooldown_until = clock_timestamp() - interval '1 second' WHERE id = reanalysis_one.admission_id;
  SELECT * INTO reanalysis_replay FROM public.admit_product_reanalysis('f7f50000-0000-4000-8000-000000000001','f7f50000-0000-4000-8000-000000000013');
  IF reanalysis_replay.outcome IS DISTINCT FROM 'admitted' OR reanalysis_replay.lease_version IS NULL OR reanalysis_replay.lease_version <= reanalysis_one.lease_version THEN RAISE EXCEPTION 'ASSERTION FAILED: expired cooldown did not issue a new fenced lease'; END IF;
  SELECT * INTO reanalysis_replay FROM public.admit_product_reanalysis('f7f50000-0000-4000-8000-000000000002','f7f50000-0000-4000-8000-000000000013');
  IF reanalysis_replay.outcome IS DISTINCT FROM 'unauthorized' THEN RAISE EXCEPTION 'ASSERTION FAILED: cross-owner reanalysis admission'; END IF;

  RAISE NOTICE 'PASS: image edit idempotency, payload conflict, active limit, transition fencing; reanalysis owner, active limit, ambiguity replay, cooldown and new lease';
END;
$admission_assertions$;
RESET ROLE;

ROLLBACK;
\echo KLAY_ADMISSIONS_PASS
