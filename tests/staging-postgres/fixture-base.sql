-- Caller must have opened a transaction. All identifiers are reserved synthetic fixtures.
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('f7f50000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'klay-staging-a@staging.invalid', '', clock_timestamp(), '{}', '{"klay_test_run":"phase-7f5"}', clock_timestamp(), clock_timestamp()),
  ('f7f50000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'klay-staging-b@staging.invalid', '', clock_timestamp(), '{}', '{"klay_test_run":"phase-7f5"}', clock_timestamp(), clock_timestamp());

INSERT INTO public.projects (id, user_id, title) VALUES
  ('f7f50000-0000-4000-8000-000000000011', 'f7f50000-0000-4000-8000-000000000001', 'Klay staging fixture A'),
  ('f7f50000-0000-4000-8000-000000000012', 'f7f50000-0000-4000-8000-000000000002', 'Klay staging fixture B');

INSERT INTO public.assets (id, user_id, project_id, bucket_id, object_path, asset_type) VALUES
  ('f7f50000-0000-4000-8000-000000000013', 'f7f50000-0000-4000-8000-000000000001', 'f7f50000-0000-4000-8000-000000000011', 'product-assets', 'f7f50000-0000-4000-8000-000000000001/f7f50000-0000-4000-8000-000000000011/a.png', 'product'),
  ('f7f50000-0000-4000-8000-000000000014', 'f7f50000-0000-4000-8000-000000000002', 'f7f50000-0000-4000-8000-000000000012', 'product-assets', 'f7f50000-0000-4000-8000-000000000002/f7f50000-0000-4000-8000-000000000012/b.png', 'product'),
  ('f7f50000-0000-4000-8000-000000000015', 'f7f50000-0000-4000-8000-000000000001', 'f7f50000-0000-4000-8000-000000000011', 'product-assets', 'f7f50000-0000-4000-8000-000000000001/f7f50000-0000-4000-8000-000000000011/reanalysis.png', 'product');

INSERT INTO public.generations (
  id, owner_id, project_id, generation_type, status, provider, model,
  creative_direction_snapshot, client_submission_id
) VALUES
  ('f7f50000-0000-4000-8000-000000000016', 'f7f50000-0000-4000-8000-000000000001', 'f7f50000-0000-4000-8000-000000000011', 'image', 'succeeded', 'synthetic', 'fixture-only', 'staging test fixture', 'f7f50000-0000-4000-8000-000000000017'),
  ('f7f50000-0000-4000-8000-000000000018', 'f7f50000-0000-4000-8000-000000000002', 'f7f50000-0000-4000-8000-000000000012', 'image', 'succeeded', 'synthetic', 'fixture-only', 'staging test fixture', 'f7f50000-0000-4000-8000-000000000019');

INSERT INTO public.model_profiles (id, user_id, name, status, appearance) VALUES
  ('f7f50000-0000-4000-8000-000000000021', 'f7f50000-0000-4000-8000-000000000001', 'Klay synthetic model A', 'draft', '{"fixture":true}'),
  ('f7f50000-0000-4000-8000-000000000022', 'f7f50000-0000-4000-8000-000000000002', 'Klay synthetic model B', 'draft', '{"fixture":true}'),
  ('f7f50000-0000-4000-8000-000000000023', 'f7f50000-0000-4000-8000-000000000001', 'Klay draft approval control', 'draft', '{"fixture":true}');

INSERT INTO public.model_candidate_jobs (
  id, model_id, user_id, idempotency_key, status, provider, model,
  appearance_snapshot, submission_state
) VALUES
  ('f7f50000-0000-4000-8000-000000000031', 'f7f50000-0000-4000-8000-000000000021', 'f7f50000-0000-4000-8000-000000000001', 'f7f50000-0000-4000-8000-000000000041', 'succeeded', 'synthetic', 'fixture-only', '{"fixture":true}', 'persisted'),
  ('f7f50000-0000-4000-8000-000000000032', 'f7f50000-0000-4000-8000-000000000022', 'f7f50000-0000-4000-8000-000000000002', 'f7f50000-0000-4000-8000-000000000042', 'succeeded', 'synthetic', 'fixture-only', '{"fixture":true}', 'persisted'),
  ('f7f50000-0000-4000-8000-000000000033', 'f7f50000-0000-4000-8000-000000000021', 'f7f50000-0000-4000-8000-000000000001', 'f7f50000-0000-4000-8000-000000000043', 'queued', 'synthetic', 'fixture-only', '{"fixture":true}', 'not_started');

INSERT INTO public.model_reference_assets (
  id, model_id, user_id, object_path, source, mime_type, byte_size
) VALUES
  ('f7f50000-0000-4000-8000-000000000051', 'f7f50000-0000-4000-8000-000000000021', 'f7f50000-0000-4000-8000-000000000001', 'f7f50000-0000-4000-8000-000000000001/f7f50000-0000-4000-8000-000000000021/synthetic.png', 'candidate_generated', 'image/png', 1),
  ('f7f50000-0000-4000-8000-000000000052', 'f7f50000-0000-4000-8000-000000000022', 'f7f50000-0000-4000-8000-000000000002', 'f7f50000-0000-4000-8000-000000000002/f7f50000-0000-4000-8000-000000000022/synthetic.png', 'candidate_generated', 'image/png', 1);

INSERT INTO public.model_candidates (
  id, job_id, model_id, user_id, status, appearance_snapshot,
  primary_reference_asset_id
) VALUES
  ('f7f50000-0000-4000-8000-000000000061', 'f7f50000-0000-4000-8000-000000000031', 'f7f50000-0000-4000-8000-000000000021', 'f7f50000-0000-4000-8000-000000000001', 'ready', '{"fixture":true}', 'f7f50000-0000-4000-8000-000000000051'),
  ('f7f50000-0000-4000-8000-000000000062', 'f7f50000-0000-4000-8000-000000000032', 'f7f50000-0000-4000-8000-000000000022', 'f7f50000-0000-4000-8000-000000000002', 'ready', '{"fixture":true}', 'f7f50000-0000-4000-8000-000000000052');

-- Approval is invoked only on these synthetic rows, using the actual RPC.
SET LOCAL ROLE service_role;
SELECT public.approve_model_candidate('f7f50000-0000-4000-8000-000000000061', 'f7f50000-0000-4000-8000-000000000001');
SELECT public.approve_model_candidate('f7f50000-0000-4000-8000-000000000062', 'f7f50000-0000-4000-8000-000000000002');
RESET ROLE;
SELECT set_config('app.model_approval', 'off', true);

INSERT INTO public.notifications (id, user_id, type, title, message, event_key)
VALUES
  ('f7f50000-0000-4000-8000-000000000071', 'f7f50000-0000-4000-8000-000000000001', 'security_event', 'Fixture', 'Synthetic test notification', 'klay-staging-a'),
  ('f7f50000-0000-4000-8000-000000000072', 'f7f50000-0000-4000-8000-000000000002', 'security_event', 'Fixture', 'Synthetic test notification', 'klay-staging-b');

INSERT INTO public.video_source_assets (
  id, owner_id, object_path, mime_type, size_bytes, width, height
) VALUES
  ('f7f50000-0000-4000-8000-000000000081', 'f7f50000-0000-4000-8000-000000000001', 'f7f50000-0000-4000-8000-000000000081/source.png', 'image/png', 1, 360, 360),
  ('f7f50000-0000-4000-8000-000000000082', 'f7f50000-0000-4000-8000-000000000002', 'f7f50000-0000-4000-8000-000000000082/source.png', 'image/png', 1, 360, 360);

-- Read-only RLS fixtures for the source-aware credit tables.
INSERT INTO public.verified_billing_events (
  id, owner_id, provider, event_reference, event_kind, payload_digest,
  verification_method, verified_at
) VALUES
  ('f7f50000-0000-4000-8000-000000000221','f7f50000-0000-4000-8000-000000000001','synthetic','rls-fixture-a','subscription_activated',repeat('a',64),'administrative_authorization',clock_timestamp()),
  ('f7f50000-0000-4000-8000-000000000222','f7f50000-0000-4000-8000-000000000002','synthetic','rls-fixture-b','subscription_activated',repeat('b',64),'administrative_authorization',clock_timestamp());
INSERT INTO public.billing_subscriptions (
  id,owner_id,provider,provider_subscription_reference,catalog_version,plan_id,
  monthly_price_cents,monthly_credits,status,current_period_start,current_period_end
) VALUES
  ('f7f50000-0000-4000-8000-000000000223','f7f50000-0000-4000-8000-000000000001','synthetic','rls-sub-a','fixture-v1','creator',100,10,'active',clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day'),
  ('f7f50000-0000-4000-8000-000000000224','f7f50000-0000-4000-8000-000000000002','synthetic','rls-sub-b','fixture-v1','creator',100,10,'active',clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day');
INSERT INTO public.credit_grants (
  id,owner_id,billing_event_id,subscription_id,grant_kind,catalog_version,catalog_item_id,
  credits,period_start,period_end
)
SELECT x.grant_id,s.owner_id,x.event_id,s.id,'subscription_period',s.catalog_version,s.plan_id,
  s.monthly_credits,s.current_period_start,s.current_period_end
FROM (VALUES
  ('f7f50000-0000-4000-8000-000000000225'::uuid,'f7f50000-0000-4000-8000-000000000221'::uuid,'f7f50000-0000-4000-8000-000000000223'::uuid),
  ('f7f50000-0000-4000-8000-000000000226'::uuid,'f7f50000-0000-4000-8000-000000000222'::uuid,'f7f50000-0000-4000-8000-000000000224'::uuid)
) AS x(grant_id,event_id,subscription_id)
JOIN public.billing_subscriptions s ON s.id=x.subscription_id;
INSERT INTO public.credit_accounts (owner_id,available_credits,reserved_credits) VALUES
  ('f7f50000-0000-4000-8000-000000000001',10,0),
  ('f7f50000-0000-4000-8000-000000000002',10,0);
INSERT INTO public.credit_source_balances (
  grant_id,owner_id,source_kind,granted_credits,available_credits,reserved_credits,
  consumed_credits,expired_credits,expires_at
)
SELECT g.id,g.owner_id,'subscription_period',10,10,0,0,0,s.current_period_end
FROM public.credit_grants g JOIN public.billing_subscriptions s ON s.id=g.subscription_id;
INSERT INTO public.video_credit_reservations (
  id,owner_id,submission_id,quote_id,required_credits,status,released_at
) VALUES
  ('f7f50000-0000-4000-8000-000000000227','f7f50000-0000-4000-8000-000000000001','f7f50000-0000-4000-8000-000000000237','fixture','1','released',clock_timestamp()),
  ('f7f50000-0000-4000-8000-000000000228','f7f50000-0000-4000-8000-000000000002','f7f50000-0000-4000-8000-000000000238','fixture','1','released',clock_timestamp());
INSERT INTO public.credit_reservation_allocations (
  id,reservation_id,grant_id,owner_id,allocated_credits,source_expires_at
)
SELECT x.allocation_id,x.reservation_id,g.id,g.owner_id,1,s.current_period_end
FROM (VALUES
  ('f7f50000-0000-4000-8000-000000000229'::uuid,'f7f50000-0000-4000-8000-000000000227'::uuid,'f7f50000-0000-4000-8000-000000000225'::uuid),
  ('f7f50000-0000-4000-8000-000000000230'::uuid,'f7f50000-0000-4000-8000-000000000228'::uuid,'f7f50000-0000-4000-8000-000000000226'::uuid)
) AS x(allocation_id,reservation_id,grant_id)
JOIN public.credit_grants g ON g.id=x.grant_id
JOIN public.billing_subscriptions s ON s.id=g.subscription_id;
INSERT INTO public.credit_refunds (
  id,reservation_id,owner_id,idempotency_key,reason,restored_available_credits,returned_expired_credits
) VALUES
  ('f7f50000-0000-4000-8000-000000000231','f7f50000-0000-4000-8000-000000000227','f7f50000-0000-4000-8000-000000000001','rls-refund-a','internal_failure',1,0),
  ('f7f50000-0000-4000-8000-000000000232','f7f50000-0000-4000-8000-000000000228','f7f50000-0000-4000-8000-000000000002','rls-refund-b','internal_failure',1,0);
INSERT INTO public.credit_source_movements (
  id,grant_id,reservation_id,owner_id,movement_type,available_delta,reserved_delta,consumed_delta,expired_delta
) VALUES
  ('f7f50000-0000-4000-8000-000000000233','f7f50000-0000-4000-8000-000000000225','f7f50000-0000-4000-8000-000000000227','f7f50000-0000-4000-8000-000000000001','reservation',-1,1,0,0),
  ('f7f50000-0000-4000-8000-000000000234','f7f50000-0000-4000-8000-000000000226','f7f50000-0000-4000-8000-000000000228','f7f50000-0000-4000-8000-000000000002','reservation',-1,1,0,0);
INSERT INTO public.credit_source_movements (
  id,grant_id,owner_id,movement_type,available_delta,reserved_delta,consumed_delta,expired_delta
) VALUES
  ('f7f50000-0000-4000-8000-000000000245','f7f50000-0000-4000-8000-000000000225','f7f50000-0000-4000-8000-000000000001','grant',10,0,0,0),
  ('f7f50000-0000-4000-8000-000000000246','f7f50000-0000-4000-8000-000000000226','f7f50000-0000-4000-8000-000000000002','grant',10,0,0,0);
INSERT INTO public.credit_source_movements (
  id,grant_id,reservation_id,refund_id,owner_id,movement_type,available_delta,reserved_delta,consumed_delta,expired_delta
) VALUES
  ('f7f50000-0000-4000-8000-000000000239','f7f50000-0000-4000-8000-000000000225','f7f50000-0000-4000-8000-000000000227','f7f50000-0000-4000-8000-000000000231','f7f50000-0000-4000-8000-000000000001','refund_available',1,-1,0,0),
  ('f7f50000-0000-4000-8000-000000000240','f7f50000-0000-4000-8000-000000000226','f7f50000-0000-4000-8000-000000000228','f7f50000-0000-4000-8000-000000000232','f7f50000-0000-4000-8000-000000000002','refund_available',1,-1,0,0);
INSERT INTO public.credit_ledger_entries (
  id,owner_id,reservation_id,event_type,available_delta,reserved_delta
) VALUES
  ('f7f50000-0000-4000-8000-000000000235','f7f50000-0000-4000-8000-000000000001','f7f50000-0000-4000-8000-000000000227','video_reservation',-1,1),
  ('f7f50000-0000-4000-8000-000000000236','f7f50000-0000-4000-8000-000000000002','f7f50000-0000-4000-8000-000000000228','video_reservation',-1,1);
INSERT INTO public.credit_ledger_entries (
  id,owner_id,reservation_id,event_type,available_delta,reserved_delta
) VALUES
  ('f7f50000-0000-4000-8000-000000000241','f7f50000-0000-4000-8000-000000000001','f7f50000-0000-4000-8000-000000000227','video_refund',1,-1),
  ('f7f50000-0000-4000-8000-000000000242','f7f50000-0000-4000-8000-000000000002','f7f50000-0000-4000-8000-000000000228','video_refund',1,-1);
INSERT INTO public.credit_ledger_entries (
  id,owner_id,grant_id,event_type,available_delta,reserved_delta
) VALUES
  ('f7f50000-0000-4000-8000-000000000243','f7f50000-0000-4000-8000-000000000001','f7f50000-0000-4000-8000-000000000225','subscription_grant',10,0),
  ('f7f50000-0000-4000-8000-000000000244','f7f50000-0000-4000-8000-000000000002','f7f50000-0000-4000-8000-000000000226','subscription_grant',10,0);
