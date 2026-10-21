-- Phase 5G: source-aware accounting. Additive tables; canonical account/reservation tables remain authoritative.
alter table public.verified_billing_events add column owner_id uuid null references auth.users (id) on delete restrict;

create table public.credit_source_balances (
  grant_id uuid primary key references public.credit_grants (id) on delete restrict,
  owner_id uuid not null references auth.users (id) on delete cascade,
  source_kind text not null check (source_kind in ('subscription_period', 'top_up', 'administrative', 'promotional')),
  granted_credits bigint not null check (granted_credits > 0),
  available_credits bigint not null check (available_credits >= 0),
  reserved_credits bigint not null default 0 check (reserved_credits >= 0),
  consumed_credits bigint not null default 0 check (consumed_credits >= 0),
  expired_credits bigint not null default 0 check (expired_credits >= 0),
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (available_credits + reserved_credits + consumed_credits + expired_credits = granted_credits),
  check ((source_kind = 'subscription_period' and expires_at is not null) or source_kind <> 'subscription_period'),
  check (source_kind <> 'top_up' or expires_at is null)
);

create table public.credit_reservation_allocations (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.video_credit_reservations (id) on delete restrict,
  grant_id uuid not null references public.credit_grants (id) on delete restrict,
  owner_id uuid not null references auth.users (id) on delete cascade,
  allocated_credits bigint not null check (allocated_credits > 0),
  source_expires_at timestamptz null,
  created_at timestamptz not null default now(),
  unique (reservation_id, grant_id)
);

create table public.credit_refunds (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references public.video_credit_reservations (id) on delete restrict,
  owner_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key text not null unique check (char_length(btrim(idempotency_key)) between 1 and 160),
  reason text not null check (reason in ('confirmed_provider_failure', 'delivery_failure', 'internal_failure', 'confirmed_cancellation')),
  restored_available_credits bigint not null check (restored_available_credits >= 0),
  returned_expired_credits bigint not null check (returned_expired_credits >= 0),
  created_at timestamptz not null default now()
);

create table public.credit_source_movements (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.credit_grants (id) on delete restrict,
  reservation_id uuid null references public.video_credit_reservations (id) on delete restrict,
  refund_id uuid null references public.credit_refunds (id) on delete restrict,
  owner_id uuid not null references auth.users (id) on delete cascade,
  movement_type text not null check (movement_type in ('grant', 'reservation', 'settlement', 'release', 'refund_available', 'refund_expired', 'expiration')),
  available_delta bigint not null,
  reserved_delta bigint not null,
  consumed_delta bigint not null,
  expired_delta bigint not null,
  created_at timestamptz not null default now(),
  unique nulls not distinct (grant_id, reservation_id, refund_id, movement_type)
);

create index credit_source_spending_order_idx on public.credit_source_balances (owner_id, expires_at, created_at, grant_id) where available_credits > 0;
create index credit_source_expiration_idx on public.credit_source_balances (expires_at, owner_id) where expires_at is not null and available_credits > 0;
create index credit_reservation_allocations_reservation_idx on public.credit_reservation_allocations (reservation_id);

alter table public.credit_ledger_entries drop constraint if exists credit_ledger_entries_event_type_check;
alter table public.credit_ledger_entries add constraint credit_ledger_entries_event_type_check check (event_type in ('video_reservation', 'video_settlement', 'video_release', 'video_refund', 'subscription_grant', 'top_up_grant', 'administrative_grant', 'grant_reversal', 'credit_expiration'));
drop index if exists public.credit_ledger_entries_grant_unique;
create unique index credit_ledger_entries_grant_event_unique on public.credit_ledger_entries (grant_id, event_type) where grant_id is not null and reservation_id is null;

alter table public.credit_source_balances enable row level security;
alter table public.credit_reservation_allocations enable row level security;
alter table public.credit_refunds enable row level security;
alter table public.credit_source_movements enable row level security;
revoke all on table public.credit_source_balances, public.credit_reservation_allocations, public.credit_refunds, public.credit_source_movements from anon, authenticated, service_role;
grant select on table public.credit_source_balances, public.credit_reservation_allocations, public.credit_refunds, public.credit_source_movements to authenticated;
create policy "Users can read their own credit sources" on public.credit_source_balances for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Users can read their own reservation allocations" on public.credit_reservation_allocations for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Users can read their own credit refunds" on public.credit_refunds for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Users can read their own source movements" on public.credit_source_movements for select to authenticated using ((select auth.uid()) = owner_id);

-- Phase 5F was closed to live grants. Refuse an unsafe automatic attribution if manual grants exist.
do $$ begin
  if exists (select 1 from public.credit_grants)
    or exists (select 1 from public.verified_billing_events)
    or exists (select 1 from public.credit_accounts where available_credits <> 0 or reserved_credits <> 0)
    or exists (select 1 from public.video_credit_reservations where status in ('reserved', 'reconciliation_required')) then
    raise exception 'Phase 5G requires an audited source backfill for existing financial state; automatic attribution is unsafe';
  end if;
end $$;
alter table public.verified_billing_events alter column owner_id set not null;

create or replace function public.apply_verified_credit_grant(
  p_owner_id uuid, p_billing_event_id uuid, p_subscription_id uuid, p_grant_kind text,
  p_catalog_version text, p_catalog_item_id text, p_credits bigint,
  p_period_start timestamptz default null, p_period_end timestamptz default null
) returns table(outcome text, grant_id uuid)
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare event_row public.verified_billing_events%rowtype; subscription public.billing_subscriptions%rowtype; account public.credit_accounts%rowtype; existing public.credit_grants%rowtype; created public.credit_grants%rowtype; source_expiry timestamptz;
begin
  if p_owner_id is null or p_credits <= 0 or p_grant_kind not in ('subscription_period', 'top_up', 'administrative') then return query select 'invalid_request'::text, null::uuid; return; end if;
  select * into event_row from public.verified_billing_events where id = p_billing_event_id for update;
  if not found or event_row.owner_id <> p_owner_id then return query select 'unverified_event'::text, null::uuid; return; end if;
  select * into existing from public.credit_grants where billing_event_id = p_billing_event_id;
  if found then return query select 'already_applied'::text, existing.id; return; end if;
  if p_grant_kind = 'subscription_period' and (p_subscription_id is null or p_period_start is null or p_period_end is null or p_period_end <= p_period_start) then return query select 'invalid_period'::text, null::uuid; return; end if;
  if p_grant_kind = 'top_up' and (p_subscription_id is not null or p_period_start is not null or p_period_end is not null) then return query select 'invalid_top_up'::text, null::uuid; return; end if;
  if p_grant_kind = 'subscription_period' then
    select * into subscription from public.billing_subscriptions where id = p_subscription_id for update;
    if not found or subscription.owner_id <> p_owner_id or subscription.catalog_version <> p_catalog_version or subscription.plan_id <> p_catalog_item_id or subscription.monthly_credits <> p_credits or subscription.current_period_start <> p_period_start or subscription.current_period_end <> p_period_end then return query select 'subscription_mismatch'::text, null::uuid; return; end if;
  end if;
  source_expiry := case when p_grant_kind = 'subscription_period' then p_period_end else null end;
  select * into account from public.credit_accounts where owner_id = p_owner_id for update;
  if not found then insert into public.credit_accounts (owner_id) values (p_owner_id) returning * into account; end if;
  begin
    insert into public.credit_grants (owner_id, billing_event_id, subscription_id, grant_kind, catalog_version, catalog_item_id, credits, period_start, period_end, expires_at)
      values (p_owner_id, p_billing_event_id, p_subscription_id, p_grant_kind, p_catalog_version, p_catalog_item_id, p_credits, p_period_start, p_period_end, null) returning * into created;
  exception when unique_violation then
    select * into existing from public.credit_grants where billing_event_id = p_billing_event_id or (subscription_id = p_subscription_id and period_start = p_period_start and period_end = p_period_end) limit 1;
    return query select 'already_applied'::text, existing.id; return;
  end;
  insert into public.credit_source_balances (grant_id, owner_id, source_kind, granted_credits, available_credits, expires_at)
    values (created.id, p_owner_id, p_grant_kind, p_credits, p_credits, source_expiry);
  insert into public.credit_source_movements (grant_id, owner_id, movement_type, available_delta, reserved_delta, consumed_delta, expired_delta)
    values (created.id, p_owner_id, 'grant', p_credits, 0, 0, 0);
  update public.credit_accounts set available_credits = available_credits + p_credits, updated_at = clock_timestamp() where owner_id = p_owner_id;
  insert into public.credit_ledger_entries (owner_id, grant_id, event_type, available_delta, reserved_delta)
    values (p_owner_id, created.id, case p_grant_kind when 'subscription_period' then 'subscription_grant' when 'top_up' then 'top_up_grant' else 'administrative_grant' end, p_credits, 0);
  return query select 'applied'::text, created.id;
end;
$$;

create or replace function public.reserve_video_credits(p_owner_id uuid, p_submission_id uuid, p_quote_id text, p_required_credits bigint)
returns table(outcome text, reservation_id uuid)
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare account public.credit_accounts%rowtype; reservation public.video_credit_reservations%rowtype; source public.credit_source_balances%rowtype; remaining bigint; take_credits bigint;
begin
  if p_owner_id is null or p_submission_id is null or p_required_credits <= 0 or char_length(btrim(coalesce(p_quote_id, ''))) = 0 then return query select 'invalid_request'::text, null::uuid; return; end if;
  select * into account from public.credit_accounts where owner_id = p_owner_id for update;
  if not found then return query select 'account_unavailable'::text, null::uuid; return; end if;
  select * into reservation from public.video_credit_reservations where owner_id = p_owner_id and submission_id = p_submission_id;
  if found then return query select case when reservation.status = 'reserved' then 'existing_reserved' else 'existing_non_reservable' end, reservation.id; return; end if;
  if account.available_credits < p_required_credits or (select coalesce(sum(available_credits), 0) from public.credit_source_balances where owner_id = p_owner_id and available_credits > 0 and (expires_at is null or expires_at > clock_timestamp())) < p_required_credits then return query select 'insufficient_balance'::text, null::uuid; return; end if;
  insert into public.video_credit_reservations (owner_id, submission_id, quote_id, required_credits, status) values (p_owner_id, p_submission_id, p_quote_id, p_required_credits, 'reserved') returning * into reservation;
  remaining := p_required_credits;
  for source in select * from public.credit_source_balances where owner_id = p_owner_id and available_credits > 0 and (expires_at is null or expires_at > clock_timestamp()) order by expires_at asc nulls last, created_at, grant_id for update loop
    exit when remaining = 0; take_credits := least(remaining, source.available_credits);
    update public.credit_source_balances set available_credits = available_credits - take_credits, reserved_credits = reserved_credits + take_credits, updated_at = clock_timestamp() where grant_id = source.grant_id;
    insert into public.credit_reservation_allocations (reservation_id, grant_id, owner_id, allocated_credits, source_expires_at) values (reservation.id, source.grant_id, p_owner_id, take_credits, source.expires_at);
    insert into public.credit_source_movements (grant_id, reservation_id, owner_id, movement_type, available_delta, reserved_delta, consumed_delta, expired_delta) values (source.grant_id, reservation.id, p_owner_id, 'reservation', -take_credits, take_credits, 0, 0);
    remaining := remaining - take_credits;
  end loop;
  update public.credit_accounts set available_credits = available_credits - p_required_credits, reserved_credits = reserved_credits + p_required_credits, updated_at = clock_timestamp() where owner_id = p_owner_id;
  insert into public.credit_ledger_entries (owner_id, reservation_id, event_type, available_delta, reserved_delta) values (p_owner_id, reservation.id, 'video_reservation', -p_required_credits, p_required_credits);
  return query select 'reserved'::text, reservation.id;
end;
$$;

create or replace function public.settle_video_credit_reservation(p_reservation_id uuid, p_actual_provider_cost_usd numeric, p_generation_id uuid, p_lease_token uuid, p_lease_version bigint)
returns table(outcome text) language plpgsql security definer set search_path = pg_catalog, public
as $$
declare reservation public.video_credit_reservations%rowtype; generation public.generations%rowtype; allocation public.credit_reservation_allocations%rowtype;
begin
  select * into reservation from public.video_credit_reservations where id = p_reservation_id for update;
  if not found then return query select 'not_found'::text; return; end if;
  if p_generation_id is not null then select * into generation from public.generations where id = p_generation_id; if not found or generation.owner_id <> reservation.owner_id or generation.billing_reservation_id is distinct from p_reservation_id::text or generation.reconciliation_lease_token is distinct from p_lease_token or generation.reconciliation_lease_version is distinct from p_lease_version or generation.reconciliation_lease_expires_at <= clock_timestamp() then return query select 'stale_lease'::text; return; end if; end if;
  if reservation.status = 'finalized' then return query select 'finalized'::text; return; end if;
  if reservation.status not in ('reserved', 'reconciliation_required') then return query select 'not_settleable'::text; return; end if;
  for allocation in select * from public.credit_reservation_allocations where reservation_id = reservation.id order by grant_id for update loop
    update public.credit_source_balances set reserved_credits = reserved_credits - allocation.allocated_credits, consumed_credits = consumed_credits + allocation.allocated_credits, updated_at = clock_timestamp() where grant_id = allocation.grant_id and owner_id = reservation.owner_id;
    insert into public.credit_source_movements (grant_id, reservation_id, owner_id, movement_type, available_delta, reserved_delta, consumed_delta, expired_delta) values (allocation.grant_id, reservation.id, reservation.owner_id, 'settlement', 0, -allocation.allocated_credits, allocation.allocated_credits, 0);
  end loop;
  update public.credit_accounts set reserved_credits = reserved_credits - reservation.required_credits, updated_at = clock_timestamp() where owner_id = reservation.owner_id and reserved_credits >= reservation.required_credits;
  if not found then raise exception 'credit account invariant violation'; end if;
  update public.video_credit_reservations set status = 'finalized', settled_credits = required_credits, provider_actual_cost_usd = p_actual_provider_cost_usd, finalized_at = clock_timestamp(), updated_at = clock_timestamp() where id = reservation.id;
  insert into public.credit_ledger_entries (owner_id, reservation_id, event_type, available_delta, reserved_delta) values (reservation.owner_id, reservation.id, 'video_settlement', 0, -reservation.required_credits) on conflict (reservation_id, event_type) do nothing;
  return query select 'finalized'::text;
end;
$$;

-- Used only when non-submission is known. Expired subscription allocations stay expired.
create or replace function public.release_video_credit_reservation(p_reservation_id uuid)
returns table(outcome text) language plpgsql security definer set search_path = pg_catalog, public
as $$
declare reservation public.video_credit_reservations%rowtype; allocation public.credit_reservation_allocations%rowtype; restored bigint := 0; expired_return bigint := 0; usable boolean;
begin
  select * into reservation from public.video_credit_reservations where id = p_reservation_id for update;
  if not found then return query select 'not_found'::text; return; end if;
  if reservation.status = 'released' then return query select 'released'::text; return; end if;
  if reservation.status <> 'reserved' then return query select 'not_releasable'::text; return; end if;
  for allocation in select * from public.credit_reservation_allocations where reservation_id = reservation.id order by grant_id for update loop
    usable := allocation.source_expires_at is null or allocation.source_expires_at > clock_timestamp();
    update public.credit_source_balances set reserved_credits = reserved_credits - allocation.allocated_credits, available_credits = available_credits + case when usable then allocation.allocated_credits else 0 end, expired_credits = expired_credits + case when usable then 0 else allocation.allocated_credits end, updated_at = clock_timestamp() where grant_id = allocation.grant_id and owner_id = reservation.owner_id;
    insert into public.credit_source_movements (grant_id, reservation_id, owner_id, movement_type, available_delta, reserved_delta, consumed_delta, expired_delta) values (allocation.grant_id, reservation.id, reservation.owner_id, 'release', case when usable then allocation.allocated_credits else 0 end, -allocation.allocated_credits, 0, case when usable then 0 else allocation.allocated_credits end);
    restored := restored + case when usable then allocation.allocated_credits else 0 end; expired_return := expired_return + case when usable then 0 else allocation.allocated_credits end;
  end loop;
  update public.credit_accounts set available_credits = available_credits + restored, reserved_credits = reserved_credits - reservation.required_credits, updated_at = clock_timestamp() where owner_id = reservation.owner_id and reserved_credits >= reservation.required_credits;
  if not found then raise exception 'credit account invariant violation'; end if;
  update public.video_credit_reservations set status = 'released', released_at = clock_timestamp(), updated_at = clock_timestamp() where id = reservation.id;
  insert into public.credit_ledger_entries (owner_id, reservation_id, event_type, available_delta, reserved_delta) values (reservation.owner_id, reservation.id, 'video_release', restored, -reservation.required_credits) on conflict (reservation_id, event_type) do nothing;
  return query select 'released'::text;
end;
$$;

create function public.refund_video_credit_reservation(p_reservation_id uuid, p_idempotency_key text, p_reason text, p_generation_id uuid, p_lease_token uuid, p_lease_version bigint)
returns table(outcome text, refund_id uuid) language plpgsql security definer set search_path = pg_catalog, public
as $$
declare reservation public.video_credit_reservations%rowtype; generation public.generations%rowtype; allocation public.credit_reservation_allocations%rowtype; existing public.credit_refunds%rowtype; created public.credit_refunds%rowtype; restored bigint := 0; expired_return bigint := 0; usable boolean;
begin
  if p_reason not in ('confirmed_provider_failure', 'delivery_failure', 'internal_failure', 'confirmed_cancellation') or char_length(btrim(coalesce(p_idempotency_key, ''))) = 0 then return query select 'invalid_request'::text, null::uuid; return; end if;
  select * into reservation from public.video_credit_reservations where id = p_reservation_id for update;
  if not found then return query select 'not_found'::text, null::uuid; return; end if;
  select * into existing from public.credit_refunds where reservation_id = reservation.id or idempotency_key = p_idempotency_key limit 1;
  if found then return query select 'already_refunded'::text, existing.id; return; end if;
  if p_generation_id is not null then select * into generation from public.generations where id = p_generation_id; if not found or generation.owner_id <> reservation.owner_id or generation.billing_reservation_id is distinct from p_reservation_id::text or generation.reconciliation_lease_token is distinct from p_lease_token or generation.reconciliation_lease_version is distinct from p_lease_version or generation.reconciliation_lease_expires_at <= clock_timestamp() then return query select 'stale_lease'::text, null::uuid; return; end if; end if;
  if reservation.status not in ('reserved', 'reconciliation_required') then return query select 'not_refundable'::text, null::uuid; return; end if;
  for allocation in select * from public.credit_reservation_allocations where reservation_id = reservation.id order by grant_id for update loop
    usable := allocation.source_expires_at is null or allocation.source_expires_at > clock_timestamp();
    update public.credit_source_balances set reserved_credits = reserved_credits - allocation.allocated_credits, available_credits = available_credits + case when usable then allocation.allocated_credits else 0 end, expired_credits = expired_credits + case when usable then 0 else allocation.allocated_credits end, updated_at = clock_timestamp() where grant_id = allocation.grant_id and owner_id = reservation.owner_id;
    restored := restored + case when usable then allocation.allocated_credits else 0 end; expired_return := expired_return + case when usable then 0 else allocation.allocated_credits end;
  end loop;
  insert into public.credit_refunds (reservation_id, owner_id, idempotency_key, reason, restored_available_credits, returned_expired_credits) values (reservation.id, reservation.owner_id, p_idempotency_key, p_reason, restored, expired_return) returning * into created;
  insert into public.credit_source_movements (grant_id, reservation_id, refund_id, owner_id, movement_type, available_delta, reserved_delta, consumed_delta, expired_delta)
    select a.grant_id, reservation.id, created.id, reservation.owner_id, case when a.source_expires_at is null or a.source_expires_at > clock_timestamp() then 'refund_available' else 'refund_expired' end, case when a.source_expires_at is null or a.source_expires_at > clock_timestamp() then a.allocated_credits else 0 end, -a.allocated_credits, 0, case when a.source_expires_at is null or a.source_expires_at > clock_timestamp() then 0 else a.allocated_credits end from public.credit_reservation_allocations a where a.reservation_id = reservation.id;
  update public.credit_accounts set available_credits = available_credits + restored, reserved_credits = reserved_credits - reservation.required_credits, updated_at = clock_timestamp() where owner_id = reservation.owner_id and reserved_credits >= reservation.required_credits;
  if not found then raise exception 'credit account invariant violation'; end if;
  update public.video_credit_reservations set status = 'released', released_at = clock_timestamp(), updated_at = clock_timestamp() where id = reservation.id;
  insert into public.credit_ledger_entries (owner_id, reservation_id, event_type, available_delta, reserved_delta) values (reservation.owner_id, reservation.id, 'video_refund', restored, -reservation.required_credits) on conflict (reservation_id, event_type) do nothing;
  return query select 'refunded'::text, created.id;
end;
$$;

create function public.expire_due_credit_sources(p_batch_size integer)
returns table(owner_id uuid, expired_credits bigint) language plpgsql security definer set search_path = pg_catalog, public
as $$
declare account public.credit_accounts%rowtype; source public.credit_source_balances%rowtype; owner_expired bigint;
begin
  for account in select a.* from public.credit_accounts a where exists (select 1 from public.credit_source_balances s where s.owner_id = a.owner_id and s.expires_at <= clock_timestamp() and s.available_credits > 0) order by a.owner_id for update skip locked limit greatest(1, least(coalesce(p_batch_size, 10), 100)) loop
    owner_expired := 0;
    for source in select * from public.credit_source_balances where credit_source_balances.owner_id = account.owner_id and expires_at <= clock_timestamp() and available_credits > 0 order by expires_at, grant_id for update loop
      owner_expired := owner_expired + source.available_credits;
      update public.credit_source_balances set expired_credits = expired_credits + source.available_credits, available_credits = 0, updated_at = clock_timestamp() where grant_id = source.grant_id;
      insert into public.credit_source_movements (grant_id, owner_id, movement_type, available_delta, reserved_delta, consumed_delta, expired_delta) values (source.grant_id, account.owner_id, 'expiration', -source.available_credits, 0, 0, source.available_credits) on conflict do nothing;
      insert into public.credit_ledger_entries (owner_id, grant_id, event_type, available_delta, reserved_delta) values (account.owner_id, source.grant_id, 'credit_expiration', -source.available_credits, 0) on conflict do nothing;
    end loop;
    update public.credit_accounts set available_credits = available_credits - owner_expired, updated_at = clock_timestamp() where credit_accounts.owner_id = account.owner_id and available_credits >= owner_expired;
    if not found then raise exception 'credit account invariant violation'; end if;
    owner_id := account.owner_id; expired_credits := owner_expired; return next;
  end loop;
end;
$$;

create trigger credit_source_movements_immutable before update or delete on public.credit_source_movements for each row execute function public.prevent_financial_record_mutation();
create trigger credit_reservation_allocations_immutable before update or delete on public.credit_reservation_allocations for each row execute function public.prevent_financial_record_mutation();
create trigger credit_refunds_immutable before update or delete on public.credit_refunds for each row execute function public.prevent_financial_record_mutation();

revoke all on function public.refund_video_credit_reservation(uuid, text, text, uuid, uuid, bigint) from public, anon, authenticated;
revoke all on function public.expire_due_credit_sources(integer) from public, anon, authenticated;
grant execute on function public.refund_video_credit_reservation(uuid, text, text, uuid, uuid, bigint) to service_role;
grant execute on function public.expire_due_credit_sources(integer) to service_role;
