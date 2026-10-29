// Uses a disposable PGlite database only; never connects to Supabase.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildTransitionSql } from './video-budget-dev-transition.mjs';

const require = createRequire(import.meta.url);
const { PGlite } = require(process.env.VIDEO_QA_PGLITE_MODULE || '@electric-sql/pglite');
const read = name => readFileSync(`database/${name}`, 'utf8');
const historical = read('migrations/20261027131744_configure_video_studio_budget.sql');
const correction = read('migrations/20261029135559_preserve_video_budget_policy.sql');
const reconcile = read('migrations/20261029143322_reconcile_video_studio_development.sql');
const admin = '10000000-0000-4000-8000-000000000001';
const normal = '20000000-0000-4000-8000-000000000002';

async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
    create table public.generations(id uuid primary key,owner_id uuid,generation_type text,billing_reservation_id text,
      status text,reconciliation_lease_token uuid,reconciliation_lease_version bigint,reconciliation_lease_expires_at timestamptz,
      provider_request_id text,created_at timestamptz,error_code text,billing_status text,next_reconciliation_at timestamptz);`);
  await db.exec(read('migrations/20261026132015_prepare_video_beta.sql'));
  await db.exec(read('migrations/20261026221424_video_beta_submission_once.sql'));
  return db;
}

const db = await setup();
try {
  await db.exec(`alter table public.video_beta_reservations drop constraint video_beta_reservations_cost_usd_check;
    alter table public.video_beta_reservations add constraint video_beta_reservations_cost_usd_check check(cost_usd > 0 and cost_usd < 1000000);
    create or replace function public.reserve_video_beta_budget(p_owner uuid,p_submission uuid,p_cost numeric,p_tier text,p_duration integer)
    returns uuid language plpgsql security definer set search_path = '' as $$
    declare admin_owner constant uuid := '${admin}'; total numeric; today_total numeric; today_count integer; r uuid;
    begin
      if p_owner is distinct from admin_owner and p_cost > 2 then raise exception 'Invalid video beta request'; end if;
      perform pg_advisory_xact_lock(7246193086541);
      select coalesce(sum(cost_usd),0) into total from public.video_beta_reservations where owner_id <> admin_owner;
      select coalesce(sum(cost_usd),0),count(*) into today_total,today_count from public.video_beta_reservations where owner_id=p_owner;
      if p_owner is distinct from admin_owner and (total+p_cost>10 or today_total+p_cost>2 or today_count>=3) then raise exception 'Video beta budget exhausted'; end if;
      insert into public.video_beta_reservations(owner_id,submission_id,cost_usd,tier,duration) values(p_owner,p_submission,p_cost,p_tier,p_duration) returning id into r;
      return r;
    end $$;
    insert into auth.users(id) values('${admin}'),('${normal}');`);
  const before = (await db.query("select pg_get_functiondef('public.reserve_video_beta_budget(uuid,uuid,numeric,text,integer)'::regprocedure) def")).rows[0].def;
  await db.exec(reconcile);
  assert.equal((await db.query('select count(*)::integer n from supabase_migrations.schema_migrations')).rows[0].n, 2);
  const history = await db.query('select version,statements[1] as sql from supabase_migrations.schema_migrations order by version');
  assert.equal(history.rows[0].sql, historical);
  assert.equal(history.rows[1].sql, correction);
  await assert.rejects(db.exec(buildTransitionSql()), /not applicable/);
  await db.exec('rollback');
  await db.exec(reconcile);
  const after = (await db.query("select pg_get_functiondef('public.reserve_video_beta_budget(uuid,uuid,numeric,text,integer)'::regprocedure) def")).rows[0].def;
  assert.equal(after, before);
  const reserve = (owner, submission, cost) => db.query("select public.reserve_video_studio_budget_once($1::uuid,$2::uuid,$3::numeric,'standard',5) id", [owner, submission, cost]);
  const id = '30000000-0000-4000-8000-000000000003';
  assert.ok((await reserve(admin, id, 3)).rows[0].id);
  assert.equal((await reserve(admin, id, 3)).rows[0].id, null);
  assert.equal((await db.query("select public.reserve_video_beta_budget_once($1::uuid,$2::uuid,3,'standard',5) id", [admin, id])).rows[0].id, null);
  await assert.rejects(reserve(normal, id, 3), /Invalid video beta request/);
  for (let i = 4; i < 7; i++) assert.ok((await reserve(normal, `30000000-0000-4000-8000-00000000000${i}`, 0.1)).rows[0].id);
  await assert.rejects(reserve(normal, '30000000-0000-4000-8000-000000000007', 0.1), /budget exhausted/);
  const privileges = (await db.query("select has_function_privilege('anon','public.reserve_video_studio_budget_once(uuid,uuid,numeric,text,integer)','execute') a, has_function_privilege('authenticated','public.reserve_video_studio_budget_once(uuid,uuid,numeric,text,integer)','execute') b, has_function_privilege('service_role','public.reserve_video_studio_budget_once(uuid,uuid,numeric,text,integer)','execute') c")).rows[0];
  assert.deepEqual(privileges, { a: false, b: false, c: true });
  await db.exec(correction); // A later ordinary replay does not change the preserved function.
  assert.equal((await db.query("select pg_get_functiondef('public.reserve_video_beta_budget(uuid,uuid,numeric,text,integer)'::regprocedure) def")).rows[0].def, before);
} finally { await db.close(); }

const clean = await setup();
try {
  await clean.exec(historical);
  const before = (await clean.query("select pg_get_functiondef('public.reserve_video_studio_budget_once(uuid,uuid,numeric,text,integer)'::regprocedure) def")).rows[0].def;
  await clean.exec(correction);
  await clean.exec("insert into supabase_migrations.schema_migrations(version) values('20261027131744')");
  await clean.exec(reconcile);
  assert.equal((await clean.query("select pg_get_functiondef('public.reserve_video_studio_budget_once(uuid,uuid,numeric,text,integer)'::regprocedure) def")).rows[0].def, before);
} finally { await clean.close(); }
console.log('Disposable PostgreSQL: development transition and clean/staging-style replay passed.');
