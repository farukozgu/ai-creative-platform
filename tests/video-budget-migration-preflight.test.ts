import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('budget migration preflight reads history and catalogs without exposing admin identities', () => {
  const sql = readFileSync('database/verification/video_studio_budget_migration_preflight.sql', 'utf8');
  assert.match(sql, /supabase_migrations\.schema_migrations/);
  assert.match(sql, /20261027131744/);
  assert.match(sql, /reserve_video_studio_budget_once/);
  assert.match(sql, /reserve_video_beta_budget_once/);
  assert.match(sql, /beta_has_local_admin_exception/);
  assert.doesNotMatch(sql, /\b(insert|update|delete|alter|create|drop|grant|revoke)\b/i);
  assert.doesNotMatch(sql, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
});
