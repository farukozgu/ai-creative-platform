create table public.credit_accounts (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  available_credits bigint not null default 0 check (available_credits >= 0),
  reserved_credits bigint not null default 0 check (reserved_credits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.video_credit_reservations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  submission_id uuid not null,
  quote_id text not null check (char_length(btrim(quote_id)) between 1 and 128),
  required_credits bigint not null check (required_credits > 0),
  settled_credits bigint null check (settled_credits is null or settled_credits >= 0),
  provider_actual_cost_usd numeric(12, 6) null check (provider_actual_cost_usd is null or provider_actual_cost_usd >= 0),
  status text not null check (status in ('reserved', 'finalized', 'released', 'reconciliation_required')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz null,
  released_at timestamptz null,
  unique (owner_id, submission_id)
);

create table public.credit_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  reservation_id uuid null references public.video_credit_reservations (id) on delete restrict,
  event_type text not null check (event_type in ('video_reservation', 'video_settlement', 'video_release')),
  available_delta bigint not null,
  reserved_delta bigint not null,
  created_at timestamptz not null default now(),
  unique (reservation_id, event_type)
);

create index video_credit_reservations_owner_created_idx on public.video_credit_reservations (owner_id, created_at desc);
create index credit_ledger_entries_owner_created_idx on public.credit_ledger_entries (owner_id, created_at desc);

alter table public.credit_accounts enable row level security;
alter table public.video_credit_reservations enable row level security;
alter table public.credit_ledger_entries enable row level security;

revoke all on table public.credit_accounts, public.video_credit_reservations, public.credit_ledger_entries from anon, authenticated, service_role;
grant select on table public.credit_accounts to authenticated;

create policy "Users can read their own credit account" on public.credit_accounts
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Users can read their own video credit reservations" on public.video_credit_reservations
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Users can read their own credit ledger entries" on public.credit_ledger_entries
  for select to authenticated using ((select auth.uid()) = owner_id);

create function public.reserve_video_credits(p_owner_id uuid, p_submission_id uuid, p_quote_id text, p_required_credits bigint)
returns table(outcome text, reservation_id uuid)
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare account public.credit_accounts%rowtype; reservation public.video_credit_reservations%rowtype;
begin
  if p_owner_id is null or p_submission_id is null or p_required_credits is null or p_required_credits <= 0 or char_length(btrim(coalesce(p_quote_id, ''))) = 0 then
    return query select 'invalid_request'::text, null::uuid; return;
  end if;
  select * into account from public.credit_accounts where owner_id = p_owner_id for update;
  if not found then return query select 'account_unavailable'::text, null::uuid; return; end if;
  select * into reservation from public.video_credit_reservations where owner_id = p_owner_id and submission_id = p_submission_id;
  if found then
    if reservation.status = 'reserved' then return query select 'existing_reserved'::text, reservation.id; else return query select 'existing_non_reservable'::text, reservation.id; end if;
    return;
  end if;
  if account.available_credits < p_required_credits then return query select 'insufficient_balance'::text, null::uuid; return; end if;
  update public.credit_accounts set available_credits = available_credits - p_required_credits, reserved_credits = reserved_credits + p_required_credits, updated_at = clock_timestamp() where owner_id = p_owner_id;
  insert into public.video_credit_reservations (owner_id, submission_id, quote_id, required_credits, status)
    values (p_owner_id, p_submission_id, p_quote_id, p_required_credits, 'reserved') returning * into reservation;
  insert into public.credit_ledger_entries (owner_id, reservation_id, event_type, available_delta, reserved_delta)
    values (p_owner_id, reservation.id, 'video_reservation', -p_required_credits, p_required_credits);
  return query select 'reserved'::text, reservation.id;
end;
$$;

create function public.settle_video_credit_reservation(p_reservation_id uuid, p_actual_provider_cost_usd numeric, p_generation_id uuid, p_lease_token uuid, p_lease_version bigint)
returns table(outcome text)
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare reservation public.video_credit_reservations%rowtype; generation public.generations%rowtype;
begin
  select * into reservation from public.video_credit_reservations where id = p_reservation_id for update;
  if not found then return query select 'not_found'::text; return; end if;
  if p_generation_id is not null then
    select * into generation from public.generations where id = p_generation_id;
    if not found or generation.billing_reservation_id is distinct from p_reservation_id::text or generation.reconciliation_lease_token is distinct from p_lease_token or generation.reconciliation_lease_version is distinct from p_lease_version or generation.reconciliation_lease_expires_at <= clock_timestamp() then
      return query select 'stale_lease'::text; return;
    end if;
  end if;
  if reservation.status = 'finalized' then return query select 'finalized'::text; return; end if;
  if reservation.status not in ('reserved', 'reconciliation_required') then return query select 'not_settleable'::text; return; end if;
  update public.credit_accounts set reserved_credits = reserved_credits - reservation.required_credits, updated_at = clock_timestamp() where owner_id = reservation.owner_id;
  update public.video_credit_reservations set status = 'finalized', settled_credits = required_credits, provider_actual_cost_usd = p_actual_provider_cost_usd, finalized_at = clock_timestamp(), updated_at = clock_timestamp() where id = reservation.id;
  insert into public.credit_ledger_entries (owner_id, reservation_id, event_type, available_delta, reserved_delta)
    values (reservation.owner_id, reservation.id, 'video_settlement', 0, -reservation.required_credits) on conflict (reservation_id, event_type) do nothing;
  return query select 'finalized'::text;
end;
$$;

create function public.release_video_credit_reservation(p_reservation_id uuid)
returns table(outcome text)
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare reservation public.video_credit_reservations%rowtype;
begin
  select * into reservation from public.video_credit_reservations where id = p_reservation_id for update;
  if not found then return query select 'not_found'::text; return; end if;
  if reservation.status = 'released' then return query select 'released'::text; return; end if;
  if reservation.status <> 'reserved' then return query select 'not_releasable'::text; return; end if;
  update public.credit_accounts set available_credits = available_credits + reservation.required_credits, reserved_credits = reserved_credits - reservation.required_credits, updated_at = clock_timestamp() where owner_id = reservation.owner_id;
  update public.video_credit_reservations set status = 'released', released_at = clock_timestamp(), updated_at = clock_timestamp() where id = reservation.id;
  insert into public.credit_ledger_entries (owner_id, reservation_id, event_type, available_delta, reserved_delta)
    values (reservation.owner_id, reservation.id, 'video_release', reservation.required_credits, -reservation.required_credits) on conflict (reservation_id, event_type) do nothing;
  return query select 'released'::text;
end;
$$;

create function public.mark_video_credit_reconciliation(p_reservation_id uuid)
returns table(outcome text)
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare reservation public.video_credit_reservations%rowtype;
begin
  select * into reservation from public.video_credit_reservations where id = p_reservation_id for update;
  if not found then return query select 'not_found'::text; return; end if;
  if reservation.status = 'reconciliation_required' then return query select 'reconciliation_required'::text; return; end if;
  if reservation.status <> 'reserved' then return query select 'not_markable'::text; return; end if;
  update public.video_credit_reservations set status = 'reconciliation_required', updated_at = clock_timestamp() where id = reservation.id;
  return query select 'reconciliation_required'::text;
end;
$$;

revoke all on function public.reserve_video_credits(uuid, uuid, text, bigint) from public, anon, authenticated;
revoke all on function public.settle_video_credit_reservation(uuid, numeric, uuid, uuid, bigint) from public, anon, authenticated;
revoke all on function public.release_video_credit_reservation(uuid) from public, anon, authenticated;
revoke all on function public.mark_video_credit_reconciliation(uuid) from public, anon, authenticated;
grant execute on function public.reserve_video_credits(uuid, uuid, text, bigint) to service_role;
grant execute on function public.settle_video_credit_reservation(uuid, numeric, uuid, uuid, bigint) to service_role;
grant execute on function public.release_video_credit_reservation(uuid) to service_role;
grant execute on function public.mark_video_credit_reconciliation(uuid) to service_role;
