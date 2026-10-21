-- Phase 5H.1: make existing read contracts effective without broadening mutation access.
grant select on table public.billing_subscriptions to service_role;
grant select on table public.credit_ledger_entries, public.video_credit_reservations to authenticated;
