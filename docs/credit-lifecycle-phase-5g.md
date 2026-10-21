# Source-aware credit lifecycle (Phase 5G)

## Policy

Subscription grants expire at their provider-verified UTC `period_end`; no 30-day approximation is used. Top-ups have no expiration. Eligible expiring sources are spent by earliest expiration, then creation time and grant ID; non-expiring sources follow. Entitlement, subscription state, and balance remain separate checks.

Each reservation has immutable allocations back to its grants. Expiration moves only a source's available credits to expired credits. Reserved credits remain reserved across the boundary and can settle successfully later. A confirmed failure restores a still-eligible allocation. A top-up is therefore restored as non-expiring, while a refund from an already-expired subscription allocation moves to the source's expired bucket and is auditable but not spendable. A different compensation credit would require separate product approval.

Pre-submission failures use release. Confirmed provider failure, delivery/storage failure, supported cancellation, and internal non-delivery use an idempotent refund tied to the reservation. Unknown provider outcomes remain `reconciliation_required`; no age-based automatic refund exists. Unresolved requests require an operator to verify provider and delivery evidence, then invoke the fenced settle/refund path. Provider USD cost remains independent of customer credits.

The expiration RPC is bounded, locks accounts before sources, and is safe to rerun. No cron is installed or enabled.

## Safe read-only Supabase verification

Run these in the SQL Editor before deployment. They make no changes:

```sql
select to_regclass('public.credit_accounts') as credit_accounts,
       to_regclass('public.credit_ledger_entries') as credit_ledger_entries,
       to_regclass('public.video_credit_reservations') as video_credit_reservations,
       to_regclass('public.credit_grants') as credit_grants,
       to_regclass('public.billing_subscriptions') as billing_subscriptions;

select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name in
  ('credit_accounts','credit_ledger_entries','video_credit_reservations','credit_grants','billing_subscriptions')
order by table_name, ordinal_position;

select c.relname as table_name, c.relrowsecurity, c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in
  ('credit_accounts','credit_ledger_entries','video_credit_reservations','credit_grants','billing_subscriptions');

select schemaname, tablename, policyname, roles, cmd, qual
from pg_policies
where schemaname = 'public' and tablename like 'credit%' or schemaname = 'public' and tablename = 'billing_subscriptions'
order by tablename, policyname;

select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer, p.proacl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and (p.proname like '%credit%' or p.proname like '%billing%')
order by p.proname;

select count(*) as existing_grants from public.credit_grants;
select count(*) as existing_verified_events from public.verified_billing_events;
select count(*) as active_reservations from public.video_credit_reservations where status in ('reserved', 'reconciliation_required');
select owner_id, available_credits, reserved_credits
from public.credit_accounts where available_credits < 0 or reserved_credits < 0;
```

Because earlier migrations may have been applied manually, compare these results to migrations 5D–5F instead of relying on CLI history. Phase 5G intentionally aborts if pre-existing grants need attribution. If `existing_grants > 0`, do not deploy: export the grant/ledger/reservation rows, construct and review a one-off provenance backfill, test it on a staging clone, and obtain financial approval.

## Deployment and staging verification

1. Back up the database and capture the read-only results above.
2. Apply missing 5D, 5E, and 5F migrations individually in a staging clone; never replay an already-present object blindly.
3. Apply `20261025000000_add_source_aware_credit_lifecycle.sql` in staging only.
4. In separate database sessions, race reserve versus expiration and renewal versus expiration. Confirm account locks serialize mutations, totals equal source sums, and only one idempotency key wins.
5. Test RPCs as `anon` and `authenticated`; mutation calls must be denied. Test reads with two users and confirm no cross-owner rows.
6. Verify: account available equals eligible source available; account reserved equals source reserved; each reservation allocation sums to `required_credits`; every source satisfies granted = available + reserved + consumed + expired.
7. Test a reservation across its period end, then settle; repeat and refund. Test top-up restoration separately.
8. Run the application validation suite. Review results and migration SQL before a separately approved production deployment.

Live payment ingestion, image charging, video debit/submission, scheduler deployment, and cron activation remain disabled.
