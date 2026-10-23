\set ON_ERROR_STOP on
\pset pager off
\pset tuples_only on
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '8s';
\ir fixture-base.sql

INSERT INTO public.verified_billing_events (
  id, owner_id, provider, event_reference, event_kind, payload_digest,
  verification_method, verified_at
) VALUES
  ('f7f50000-0000-4000-8000-000000000201', 'f7f50000-0000-4000-8000-000000000001', 'synthetic', 'klay-fixture-grant-1', 'administrative_grant', repeat('a',64), 'administrative_authorization', clock_timestamp()),
  ('f7f50000-0000-4000-8000-000000000202', 'f7f50000-0000-4000-8000-000000000001', 'synthetic', 'klay-fixture-grant-2', 'administrative_grant', repeat('b',64), 'administrative_authorization', clock_timestamp()),
  ('f7f50000-0000-4000-8000-000000000203', 'f7f50000-0000-4000-8000-000000000001', 'synthetic', 'klay-fixture-grant-expiring', 'subscription_activated', repeat('c',64), 'administrative_authorization', clock_timestamp());

INSERT INTO public.billing_subscriptions (
  id, owner_id, provider, provider_subscription_reference, catalog_version,
  plan_id, monthly_price_cents, monthly_credits, status,
  current_period_start, current_period_end
) VALUES (
  'f7f50000-0000-4000-8000-000000000204','f7f50000-0000-4000-8000-000000000001',
  'synthetic','klay-fixture-subscription','fixture-v1','creator',1,8,'active',
  clock_timestamp() - interval '1 day',clock_timestamp() + interval '3 seconds'
);

CREATE FUNCTION pg_temp.assert_true(assertion boolean, label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF assertion IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'PASS: %', label;
END;
$$;

SET LOCAL ROLE service_role;
DO $credit_calls$
DECLARE outcome text; reservation uuid; existing_id uuid; expired bigint; period_start timestamptz; period_end timestamptz;
BEGIN
  SELECT g.outcome INTO outcome FROM public.apply_verified_credit_grant(
    'f7f50000-0000-4000-8000-000000000001','f7f50000-0000-4000-8000-000000000201',NULL,
    'administrative','fixture-v1','synthetic',100,NULL,NULL) AS g;
  IF outcome IS DISTINCT FROM 'applied' THEN RAISE EXCEPTION 'ASSERTION FAILED: synthetic credit grant: %', outcome; END IF;
  SELECT g.outcome INTO outcome FROM public.apply_verified_credit_grant(
    'f7f50000-0000-4000-8000-000000000001','f7f50000-0000-4000-8000-000000000201',NULL,
    'administrative','fixture-v1','synthetic',100,NULL,NULL) AS g;
  IF outcome IS DISTINCT FROM 'already_applied' THEN RAISE EXCEPTION 'ASSERTION FAILED: grant idempotency: %', outcome; END IF;

  SELECT r.outcome, r.reservation_id INTO outcome, reservation
  FROM public.reserve_video_credits('f7f50000-0000-4000-8000-000000000001','f7f50000-0000-4000-8000-000000000211','fixture-quote',30) AS r;
  IF outcome IS DISTINCT FROM 'reserved' THEN RAISE EXCEPTION 'ASSERTION FAILED: reserve credits: %', outcome; END IF;
  SELECT r.outcome, r.reservation_id INTO outcome, existing_id
  FROM public.reserve_video_credits('f7f50000-0000-4000-8000-000000000001','f7f50000-0000-4000-8000-000000000211','fixture-quote',30) AS r;
  IF outcome IS DISTINCT FROM 'existing_reserved' OR existing_id IS DISTINCT FROM reservation THEN RAISE EXCEPTION 'ASSERTION FAILED: reservation idempotency'; END IF;
  SELECT s.outcome INTO outcome FROM public.settle_video_credit_reservation(reservation,0,NULL,NULL,NULL) AS s;
  IF outcome IS DISTINCT FROM 'finalized' THEN RAISE EXCEPTION 'ASSERTION FAILED: reservation settlement: %', outcome; END IF;
  SELECT s.outcome INTO outcome FROM public.settle_video_credit_reservation(reservation,0,NULL,NULL,NULL) AS s;
  IF outcome IS DISTINCT FROM 'finalized' THEN RAISE EXCEPTION 'ASSERTION FAILED: settlement replay: %', outcome; END IF;

  SELECT r.outcome, r.reservation_id INTO outcome, reservation
  FROM public.reserve_video_credits('f7f50000-0000-4000-8000-000000000001','f7f50000-0000-4000-8000-000000000212','fixture-quote',20) AS r;
  IF outcome IS DISTINCT FROM 'reserved' THEN RAISE EXCEPTION 'ASSERTION FAILED: release reservation'; END IF;
  SELECT s.outcome INTO outcome FROM public.release_video_credit_reservation(reservation) AS s;
  IF outcome IS DISTINCT FROM 'released' THEN RAISE EXCEPTION 'ASSERTION FAILED: release outcome: %', outcome; END IF;
  SELECT s.outcome INTO outcome FROM public.release_video_credit_reservation(reservation) AS s;
  IF outcome IS DISTINCT FROM 'released' THEN RAISE EXCEPTION 'ASSERTION FAILED: release replay: %', outcome; END IF;

  SELECT r.outcome, r.reservation_id INTO outcome, reservation
  FROM public.reserve_video_credits('f7f50000-0000-4000-8000-000000000001','f7f50000-0000-4000-8000-000000000213','fixture-quote',10) AS r;
  IF outcome IS DISTINCT FROM 'reserved' THEN RAISE EXCEPTION 'ASSERTION FAILED: refund reservation'; END IF;
  SELECT f.outcome INTO outcome FROM public.refund_video_credit_reservation(reservation,'klay-fixture-refund-1','internal_failure',NULL,NULL,NULL) AS f;
  IF outcome IS DISTINCT FROM 'refunded' THEN RAISE EXCEPTION 'ASSERTION FAILED: refund outcome: %', outcome; END IF;
  SELECT f.outcome INTO outcome FROM public.refund_video_credit_reservation(reservation,'klay-fixture-refund-1','internal_failure',NULL,NULL,NULL) AS f;
  IF outcome IS DISTINCT FROM 'already_refunded' THEN RAISE EXCEPTION 'ASSERTION FAILED: refund idempotency: %', outcome; END IF;

  SELECT r.outcome INTO outcome FROM public.reserve_video_credits('f7f50000-0000-4000-8000-000000000001','f7f50000-0000-4000-8000-000000000214','fixture-quote',999) AS r;
  IF outcome IS DISTINCT FROM 'insufficient_balance' THEN RAISE EXCEPTION 'ASSERTION FAILED: insufficient balance rejection: %', outcome; END IF;
  SELECT g.outcome INTO outcome FROM public.apply_verified_credit_grant(
    'f7f50000-0000-4000-8000-000000000001','f7f50000-0000-4000-8000-000000000202',NULL,
    'administrative','fixture-v1','synthetic-expiring',15,NULL,NULL) AS g;
  IF outcome IS DISTINCT FROM 'applied' THEN RAISE EXCEPTION 'ASSERTION FAILED: second grant for expiry test'; END IF;

  SELECT current_period_start,current_period_end INTO period_start,period_end
    FROM public.billing_subscriptions WHERE id='f7f50000-0000-4000-8000-000000000204';
  SELECT g.outcome INTO outcome FROM public.apply_verified_credit_grant(
    'f7f50000-0000-4000-8000-000000000001','f7f50000-0000-4000-8000-000000000203',
    'f7f50000-0000-4000-8000-000000000204','subscription_period','fixture-v1','creator',8,period_start,period_end) AS g;
  IF outcome IS DISTINCT FROM 'applied' THEN RAISE EXCEPTION 'ASSERTION FAILED: expiring subscription source grant'; END IF;
  SELECT r.outcome,r.reservation_id INTO outcome,reservation FROM public.reserve_video_credits(
    'f7f50000-0000-4000-8000-000000000001','f7f50000-0000-4000-8000-000000000215','fixture-quote',5) AS r;
  IF outcome IS DISTINCT FROM 'reserved' THEN RAISE EXCEPTION 'ASSERTION FAILED: expiring source reservation'; END IF;
  PERFORM pg_sleep(greatest(0,extract(epoch FROM (period_end - clock_timestamp())) + 0.2));
  SELECT f.outcome INTO outcome FROM public.refund_video_credit_reservation(
    reservation,'klay-fixture-refund-expired','confirmed_provider_failure',NULL,NULL,NULL) AS f;
  IF outcome IS DISTINCT FROM 'refunded' THEN RAISE EXCEPTION 'ASSERTION FAILED: expired-source refund'; END IF;
  RAISE NOTICE 'PASS: credit grant, reservation idempotency, settlement, release, refund and insufficient-balance outcomes';
END;
$credit_calls$;
RESET ROLE;

-- Simulate a grant source expiring without waiting. This row is synthetic and rolled back.
UPDATE public.credit_source_balances SET expires_at = clock_timestamp() - interval '1 second'
WHERE grant_id = (SELECT id FROM public.credit_grants WHERE billing_event_id = 'f7f50000-0000-4000-8000-000000000202');

SET LOCAL ROLE service_role;
DO $credit_expiry$
DECLARE expired bigint;
BEGIN
  SELECT e.expired_credits INTO expired FROM public.expire_due_credit_sources(10) AS e
  WHERE e.owner_id = 'f7f50000-0000-4000-8000-000000000001';
  IF expired IS DISTINCT FROM 18 THEN RAISE EXCEPTION 'ASSERTION FAILED: expected 18 available credits expired, got %', expired; END IF;
  RAISE NOTICE 'PASS: expiration RPC reports and expires synthetic source credits';
END;
$credit_expiry$;
RESET ROLE;

SELECT pg_temp.assert_true(
  (SELECT available_credits = 80 AND reserved_credits = 0 FROM public.credit_accounts WHERE owner_id = 'f7f50000-0000-4000-8000-000000000001'),
  'account totals reflect settled, released, refunded and expired credit movements'
);
SELECT pg_temp.assert_true(
  (SELECT sum(available_credits) = 80 AND sum(reserved_credits) = 0 AND sum(consumed_credits) = 30 AND sum(expired_credits) = 23
   FROM public.credit_source_balances WHERE owner_id = 'f7f50000-0000-4000-8000-000000000001'),
  'source balances conserve every granted credit across available/reserved/consumed/expired'
);
SELECT pg_temp.assert_true(
  (SELECT restored_available_credits = 0 AND returned_expired_credits = 5
   FROM public.credit_refunds WHERE idempotency_key='klay-fixture-refund-expired'),
  'refund after source expiry records expired credits without restoring spendable balance'
);
SELECT pg_temp.assert_true(
  (SELECT sum(available_delta) = (SELECT available_credits FROM public.credit_accounts WHERE owner_id = 'f7f50000-0000-4000-8000-000000000001')
     AND sum(reserved_delta) = (SELECT reserved_credits FROM public.credit_accounts WHERE owner_id = 'f7f50000-0000-4000-8000-000000000001')
   FROM public.credit_ledger_entries WHERE owner_id = 'f7f50000-0000-4000-8000-000000000001'),
  'ledger deltas reconcile to authoritative account totals'
);

ROLLBACK;
\echo KLAY_CREDIT_LIFECYCLE_PASS
