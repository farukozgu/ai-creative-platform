\set ON_ERROR_STOP on
\pset pager off
\pset tuples_only on
\pset format unaligned

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

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'f7f50000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"f7f50000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.projects WHERE id = 'f7f50000-0000-4000-8000-000000000011'), 'user A reads own project');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.projects WHERE id = 'f7f50000-0000-4000-8000-000000000012'), 'user A cannot read user B project');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.assets WHERE id = 'f7f50000-0000-4000-8000-000000000013'), 'user A reads own asset');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.assets WHERE id = 'f7f50000-0000-4000-8000-000000000014'), 'user A cannot read user B asset');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.generations WHERE id = 'f7f50000-0000-4000-8000-000000000016'), 'user A reads own generation');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.generations WHERE id = 'f7f50000-0000-4000-8000-000000000018'), 'user A cannot read user B generation');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.model_profiles WHERE id = 'f7f50000-0000-4000-8000-000000000021'), 'user A reads own model');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.model_profiles WHERE id = 'f7f50000-0000-4000-8000-000000000022'), 'user A cannot read user B model');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.model_candidate_jobs WHERE id = 'f7f50000-0000-4000-8000-000000000031'), 'user A reads own candidate job');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.model_candidate_jobs WHERE id = 'f7f50000-0000-4000-8000-000000000032'), 'user A cannot read user B candidate job');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.model_candidates WHERE id = 'f7f50000-0000-4000-8000-000000000061'), 'user A reads own candidate');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.model_candidates WHERE id = 'f7f50000-0000-4000-8000-000000000062'), 'user A cannot read user B candidate');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.model_reference_assets WHERE id = 'f7f50000-0000-4000-8000-000000000051'), 'user A reads own model reference metadata');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.model_reference_assets WHERE id = 'f7f50000-0000-4000-8000-000000000052'), 'user A cannot read user B model reference metadata');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.model_identity_versions v JOIN public.model_profiles p ON p.current_identity_version_id = v.id WHERE p.id = 'f7f50000-0000-4000-8000-000000000021'), 'user A reads own identity version');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.model_identity_versions v JOIN public.model_profiles p ON p.current_identity_version_id = v.id WHERE p.id = 'f7f50000-0000-4000-8000-000000000022'), 'user A cannot read user B identity version');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.model_identity_version_references r JOIN public.model_profiles p ON p.current_identity_version_id = r.identity_version_id WHERE p.id = 'f7f50000-0000-4000-8000-000000000021'), 'user A reads own identity-version reference');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.model_identity_version_references r JOIN public.model_profiles p ON p.current_identity_version_id = r.identity_version_id WHERE p.id = 'f7f50000-0000-4000-8000-000000000022'), 'user A cannot read user B identity-version reference');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.notifications WHERE id = 'f7f50000-0000-4000-8000-000000000071'), 'user A reads own notification');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.notifications WHERE id = 'f7f50000-0000-4000-8000-000000000072'), 'user A cannot read user B notification');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.video_source_assets WHERE id = 'f7f50000-0000-4000-8000-000000000081'), 'user A reads own video source registration');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.video_source_assets WHERE id = 'f7f50000-0000-4000-8000-000000000082'), 'user A cannot read user B video source registration');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.credit_accounts WHERE owner_id = 'f7f50000-0000-4000-8000-000000000001'), 'user A reads own credit account');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.credit_accounts WHERE owner_id = 'f7f50000-0000-4000-8000-000000000002'), 'user A cannot read user B credit account');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.video_credit_reservations WHERE id = 'f7f50000-0000-4000-8000-000000000227'), 'user A reads own reservation');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.video_credit_reservations WHERE id = 'f7f50000-0000-4000-8000-000000000228'), 'user A cannot read user B reservation');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.credit_ledger_entries WHERE id = 'f7f50000-0000-4000-8000-000000000235'), 'user A reads own ledger entry');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.credit_ledger_entries WHERE id = 'f7f50000-0000-4000-8000-000000000236'), 'user A cannot read user B ledger entry');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.billing_subscriptions WHERE id = 'f7f50000-0000-4000-8000-000000000223'), 'user A reads own subscription');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.billing_subscriptions WHERE id = 'f7f50000-0000-4000-8000-000000000224'), 'user A cannot read user B subscription');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.credit_grants WHERE id = 'f7f50000-0000-4000-8000-000000000225'), 'user A reads own credit grant');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.credit_grants WHERE id = 'f7f50000-0000-4000-8000-000000000226'), 'user A cannot read user B credit grant');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.credit_source_balances WHERE grant_id = 'f7f50000-0000-4000-8000-000000000225'), 'user A reads own credit source');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.credit_source_balances WHERE grant_id = 'f7f50000-0000-4000-8000-000000000226'), 'user A cannot read user B credit source');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.credit_reservation_allocations WHERE id = 'f7f50000-0000-4000-8000-000000000229'), 'user A reads own credit allocation');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.credit_reservation_allocations WHERE id = 'f7f50000-0000-4000-8000-000000000230'), 'user A cannot read user B credit allocation');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.credit_refunds WHERE id = 'f7f50000-0000-4000-8000-000000000231'), 'user A reads own refund record');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.credit_refunds WHERE id = 'f7f50000-0000-4000-8000-000000000232'), 'user A cannot read user B refund record');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.credit_source_movements WHERE id = 'f7f50000-0000-4000-8000-000000000233'), 'user A reads own source movement');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.credit_source_movements WHERE id = 'f7f50000-0000-4000-8000-000000000234'), 'user A cannot read user B source movement');

SELECT set_config('request.jwt.claim.sub', 'f7f50000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"sub":"f7f50000-0000-4000-8000-000000000002","role":"authenticated"}', true);
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.projects WHERE id = 'f7f50000-0000-4000-8000-000000000012'), 'user B reads own project');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.projects WHERE id = 'f7f50000-0000-4000-8000-000000000011'), 'user B cannot read user A project');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.model_profiles WHERE id = 'f7f50000-0000-4000-8000-000000000022'), 'user B reads own model');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.model_profiles WHERE id = 'f7f50000-0000-4000-8000-000000000021'), 'user B cannot read user A model');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.credit_accounts WHERE owner_id = 'f7f50000-0000-4000-8000-000000000002'), 'user B reads own credit account');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.credit_accounts WHERE owner_id = 'f7f50000-0000-4000-8000-000000000001'), 'user B cannot read user A credit account');
RESET ROLE;

SET LOCAL ROLE anon;
DO $anonymous_denied$
BEGIN
  BEGIN
    PERFORM 1 FROM public.projects LIMIT 1;
    RAISE EXCEPTION 'ASSERTION FAILED: anon can read private project rows';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon cannot select private project rows';
  END;
END;
$anonymous_denied$;
RESET ROLE;

ROLLBACK;
