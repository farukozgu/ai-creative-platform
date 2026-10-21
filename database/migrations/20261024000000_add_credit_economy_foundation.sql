-- Phase 5F is additive and closed by default: no checkout, webhook, expiration, or debit activation.
create table public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  provider_subscription_reference text not null,
  catalog_version text not null,
  plan_id text not null check (plan_id in ('starter', 'creator', 'growth', 'business', 'studio')),
  monthly_price_cents bigint not null check (monthly_price_cents > 0),
  monthly_credits bigint not null check (monthly_credits > 0),
  status text not null check (status in ('active', 'past_due', 'canceled', 'expired')),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null check (current_period_end > current_period_start),
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_reference)
);

create table public.verified_billing_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_reference text not null,
  event_kind text not null check (event_kind in ('subscription_activated', 'subscription_renewed', 'subscription_upgraded', 'subscription_downgraded', 'subscription_canceled', 'subscription_payment_failed', 'subscription_expired', 'top_up_verified', 'administrative_grant', 'refund_or_reversal')),
  payload_digest text not null check (char_length(payload_digest) >= 32),
  verification_method text not null check (verification_method in ('provider_signature', 'administrative_authorization')),
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (provider, event_reference)
);

create table public.credit_grants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  billing_event_id uuid not null unique references public.verified_billing_events (id) on delete restrict,
  subscription_id uuid null references public.billing_subscriptions (id) on delete restrict,
  grant_kind text not null check (grant_kind in ('subscription_period', 'top_up', 'administrative', 'reversal')),
  catalog_version text not null,
  catalog_item_id text not null,
  credits bigint not null check (credits <> 0),
  period_start timestamptz null,
  period_end timestamptz null,
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  check ((grant_kind = 'subscription_period') = (subscription_id is not null and period_start is not null and period_end is not null)),
  check (expires_at is null),
  unique (subscription_id, period_start, period_end)
);

alter table public.credit_ledger_entries drop constraint if exists credit_ledger_entries_event_type_check;
alter table public.credit_ledger_entries
  add constraint credit_ledger_entries_event_type_check check (event_type in ('video_reservation', 'video_settlement', 'video_release', 'subscription_grant', 'top_up_grant', 'administrative_grant', 'grant_reversal'));
alter table public.credit_ledger_entries add column grant_id uuid null references public.credit_grants (id) on delete restrict;
create unique index credit_ledger_entries_grant_unique on public.credit_ledger_entries (grant_id) where grant_id is not null;

alter table public.billing_subscriptions enable row level security;
alter table public.verified_billing_events enable row level security;
alter table public.credit_grants enable row level security;
revoke all on table public.billing_subscriptions, public.verified_billing_events, public.credit_grants from anon, authenticated, service_role;
grant select on table public.billing_subscriptions, public.credit_grants to authenticated;
grant select on table public.billing_subscriptions to service_role;
create policy "Users can read their own subscription" on public.billing_subscriptions for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Users can read their own credit grants" on public.credit_grants for select to authenticated using ((select auth.uid()) = owner_id);

create function public.apply_verified_credit_grant(
  p_owner_id uuid, p_billing_event_id uuid, p_subscription_id uuid, p_grant_kind text,
  p_catalog_version text, p_catalog_item_id text, p_credits bigint,
  p_period_start timestamptz default null, p_period_end timestamptz default null
) returns table(outcome text, grant_id uuid)
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare event_row public.verified_billing_events%rowtype; account public.credit_accounts%rowtype; existing public.credit_grants%rowtype; created public.credit_grants%rowtype;
begin
  if p_owner_id is null or p_credits = 0 or p_grant_kind not in ('subscription_period', 'top_up', 'administrative', 'reversal') then
    return query select 'invalid_request'::text, null::uuid; return;
  end if;
  select * into event_row from public.verified_billing_events where id = p_billing_event_id for update;
  if not found then return query select 'unverified_event'::text, null::uuid; return; end if;
  select * into existing from public.credit_grants where billing_event_id = p_billing_event_id;
  if found then return query select 'already_applied'::text, existing.id; return; end if;
  if p_grant_kind = 'subscription_period' and (p_subscription_id is null or p_period_start is null or p_period_end is null or p_period_end <= p_period_start) then
    return query select 'invalid_period'::text, null::uuid; return;
  end if;
  select * into account from public.credit_accounts where owner_id = p_owner_id for update;
  if not found then
    insert into public.credit_accounts (owner_id) values (p_owner_id) returning * into account;
  end if;
  if account.available_credits + p_credits < 0 then return query select 'insufficient_balance'::text, null::uuid; return; end if;
  begin
    insert into public.credit_grants (owner_id, billing_event_id, subscription_id, grant_kind, catalog_version, catalog_item_id, credits, period_start, period_end, expires_at)
      values (p_owner_id, p_billing_event_id, p_subscription_id, p_grant_kind, p_catalog_version, p_catalog_item_id, p_credits, p_period_start, p_period_end, null)
      returning * into created;
  exception when unique_violation then
    select * into existing from public.credit_grants where billing_event_id = p_billing_event_id or (subscription_id = p_subscription_id and period_start = p_period_start and period_end = p_period_end) limit 1;
    return query select 'already_applied'::text, existing.id; return;
  end;
  update public.credit_accounts set available_credits = available_credits + p_credits, updated_at = clock_timestamp() where owner_id = p_owner_id;
  insert into public.credit_ledger_entries (owner_id, grant_id, event_type, available_delta, reserved_delta)
    values (p_owner_id, created.id, case p_grant_kind when 'subscription_period' then 'subscription_grant' when 'top_up' then 'top_up_grant' when 'administrative' then 'administrative_grant' else 'grant_reversal' end, p_credits, 0);
  return query select 'applied'::text, created.id;
end;
$$;

create function public.prevent_financial_record_mutation() returns trigger
language plpgsql set search_path = pg_catalog, public as $$ begin raise exception 'financial audit records are append-only'; end; $$;
create trigger verified_billing_events_immutable before update or delete on public.verified_billing_events for each row execute function public.prevent_financial_record_mutation();
create trigger credit_grants_immutable before update or delete on public.credit_grants for each row execute function public.prevent_financial_record_mutation();
create trigger credit_ledger_entries_immutable before update or delete on public.credit_ledger_entries for each row execute function public.prevent_financial_record_mutation();

revoke all on function public.apply_verified_credit_grant(uuid, uuid, uuid, text, text, text, bigint, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.apply_verified_credit_grant(uuid, uuid, uuid, text, text, text, bigint, timestamptz, timestamptz) to service_role;
