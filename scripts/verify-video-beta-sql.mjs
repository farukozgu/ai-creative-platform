/** The only database here is a disposable, in-memory PGlite instance. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const requirePackage = createRequire(import.meta.url);
const { PGlite } = requirePackage(process.env.VIDEO_QA_PGLITE_MODULE ?? "@electric-sql/pglite");
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create table public.generations(id uuid primary key,owner_id uuid,generation_type text,billing_reservation_id text,
      status text,reconciliation_lease_token uuid,reconciliation_lease_version bigint,reconciliation_lease_expires_at timestamptz,
      provider_request_id text,created_at timestamptz,error_code text,billing_status text,next_reconciliation_at timestamptz);`);
  await db.exec(readFileSync("database/migrations/20261026132015_prepare_video_beta.sql", "utf8"));
  await db.exec(readFileSync("database/migrations/20261026221424_video_beta_submission_once.sql", "utf8"));
  const owner = "10000000-0000-4000-8000-000000000001", other = "20000000-0000-4000-8000-000000000002", third = "30000000-0000-4000-8000-000000000003";
  await db.query("insert into auth.users(id) values($1),($2),($3)", [owner, other, third]);
  const reserve = (user, id, cost) => db.query("select public.reserve_video_beta_budget_once($1::uuid,$2::uuid,$3::numeric,'standard',5) as id", [user, id, cost]);
  const firstId = "40000000-0000-4000-8000-000000000004";
  assert.ok((await reserve(owner, firstId, 0.7)).rows[0].id);
  assert.equal((await reserve(owner, firstId, 0.7)).rows[0].id, null);
  assert.equal((await reserve(owner, firstId, 0.5)).rows[0].id, null);
  assert.ok((await reserve(owner, "50000000-0000-4000-8000-000000000005", 0.7)).rows[0].id);
  await assert.rejects(reserve(owner, "60000000-0000-4000-8000-000000000006", 0.7), /budget exhausted/);
  for (const id of ["70000000-0000-4000-8000-000000000007", "80000000-0000-4000-8000-000000000008", "90000000-0000-4000-8000-000000000009"]) {
    assert.ok((await reserve(other, id, 0.1)).rows[0].id);
  }
  await assert.rejects(reserve(other, "a0000000-0000-4000-8000-00000000000a", 0.1), /budget exhausted/);
  const privileges = await db.query("select has_function_privilege('anon','public.reserve_video_beta_budget_once(uuid,uuid,numeric,text,integer)','EXECUTE') a, has_function_privilege('authenticated','public.reserve_video_beta_budget_once(uuid,uuid,numeric,text,integer)','EXECUTE') b, has_function_privilege('service_role','public.reserve_video_beta_budget_once(uuid,uuid,numeric,text,integer)','EXECUTE') c");
  assert.deepEqual(privileges.rows[0], { a: false, b: false, c: true });
  await db.query("insert into public.video_beta_reservations(owner_id,submission_id,tier,duration,cost_usd) values($1,gen_random_uuid(),'standard',5,2),($1,gen_random_uuid(),'standard',5,2),($1,gen_random_uuid(),'standard',5,2),($1,gen_random_uuid(),'standard',5,2)", [third]);
  await assert.rejects(reserve(third, "b0000000-0000-4000-8000-00000000000b", 0.4), /budget exhausted/);
  await db.exec(readFileSync("database/migrations/20261027131744_configure_video_studio_budget.sql", "utf8"));
  const studioReserve = (user, id, cost) => db.query("select public.reserve_video_studio_budget_once($1::uuid,$2::uuid,$3::numeric,'pro',10) as id", [user, id, cost]);
  await assert.rejects(db.exec("update public.video_studio_budget_settings set max_request_usd = 5"), /check constraint/);
  await assert.rejects(db.exec("update public.video_studio_budget_settings set max_request_usd = null"), /check constraint/);
  // Existing reservations count against the new policy; no historical reset.
  const fourthId = "c0000000-0000-4000-8000-00000000000c";
  assert.ok((await studioReserve(owner, fourthId, 0.1)).rows[0].id);
  assert.equal((await studioReserve(owner, fourthId, 0.1)).rows[0].id, null);
  await assert.rejects(studioReserve(owner, "d0000000-0000-4000-8000-00000000000d", 0.1), /budget exhausted/);
  const settingsPrivilege = await db.query("select has_table_privilege('service_role','public.video_studio_budget_settings','UPDATE') writable, has_table_privilege('authenticated','public.video_studio_budget_settings','SELECT') readable, (select relrowsecurity from pg_class where oid = 'public.video_studio_budget_settings'::regclass) rls");
  assert.deepEqual(settingsPrivilege.rows[0], { writable: false, readable: false, rls: true });
  const rpcPrivilege = await db.query("select has_function_privilege('anon','public.reserve_video_studio_budget_once(uuid,uuid,numeric,text,integer)','EXECUTE') a, has_function_privilege('authenticated','public.reserve_video_studio_budget_once(uuid,uuid,numeric,text,integer)','EXECUTE') b, has_function_privilege('service_role','public.reserve_video_studio_budget_once(uuid,uuid,numeric,text,integer)','EXECUTE') c");
  assert.deepEqual(rpcPrivilege.rows[0], { a: false, b: false, c: true });
  const functionSecurity = await db.query("select prosecdef, proconfig from pg_proc where oid = 'public.reserve_video_studio_budget_once(uuid,uuid,numeric,text,integer)'::regprocedure");
  assert.equal(functionSecurity.rows[0].prosecdef, true);
  assert.ok(functionSecurity.rows[0].proconfig.some(value => value === 'search_path=\"\"'));
  await db.exec("update public.video_studio_budget_settings set allow_high_limits=true, max_request_usd=5,user_daily_usd=20,user_daily_count=20,global_daily_usd=100,global_lifetime_usd=100");
  assert.ok((await studioReserve(third, "d0000000-0000-4000-8000-00000000000d", 3)).rows[0].id);
  for (const limit of ["max_request_usd=2", "user_daily_usd=2", "user_daily_count=1", "global_daily_usd=1", "global_lifetime_usd=1"]) {
    await db.exec("update public.video_studio_budget_settings set max_request_usd=null,user_daily_usd=null,user_daily_count=null,global_daily_usd=null,global_lifetime_usd=null");
    await db.exec(`update public.video_studio_budget_settings set ${limit}`);
    await assert.rejects(studioReserve(third, "e0000000-0000-4000-8000-00000000000e", 3), /budget exhausted/);
    await assert.rejects(reserve(third, "e0000000-0000-4000-8000-00000000000e", 3), /budget exhausted/);
  }
  await db.exec("update public.video_studio_budget_settings set max_request_usd=null,user_daily_usd=null,user_daily_count=null,global_daily_usd=null,global_lifetime_usd=null");
  const before = (await db.query("select count(*)::integer as count from public.video_beta_reservations")).rows[0].count;
  const attempts = await Promise.all([studioReserve(third, "e0000000-0000-4000-8000-00000000000e", 5), studioReserve(third, "e0000000-0000-4000-8000-00000000000e", 5)]);
  assert.equal(attempts.filter(result => result.rows[0].id !== null).length, 1);
  assert.equal((await db.query("select count(*)::integer as count from public.video_beta_reservations")).rows[0].count, before + 1);
  await db.exec("set role anon");
  await assert.rejects(studioReserve(owner, "f0000000-0000-4000-8000-00000000000f", 0.1), /permission denied/);
  await db.exec("reset role; set role authenticated");
  await assert.rejects(studioReserve(owner, "f0000000-0000-4000-8000-00000000000f", 0.1), /permission denied/);
  await db.exec("reset role; set role service_role");
  assert.ok((await studioReserve(owner, "f0000000-0000-4000-8000-00000000000f", 0.1)).rows[0].id);
  await db.exec("reset role");
  console.log("In-memory PostgreSQL: legacy + configurable budgets, preserved ledger, duplicate denial, explicit elevated/unlimited limits, RLS and privileges passed. Independent network sessions not tested.");
} finally { await db.close(); }
