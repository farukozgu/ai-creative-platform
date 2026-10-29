import assert from 'node:assert/strict';
import test from 'node:test';
import { isAllowedConnection } from '../scripts/video-budget-dev-transition.mjs';

const pooler = {
  VIDEO_BUDGET_TRANSITION_CONFIRM: 'creative-ai-dev',
  PGHOST: 'aws-0-eu-west-2.pooler.supabase.com',
  PGPORT: '5432',
  PGUSER: 'postgres.fnzrnlvpkzwztccqzyzf',
  PGDATABASE: 'postgres',
  PGSSLMODE: 'verify-full',
};

test('development session pooler and existing direct connection are accepted', () => {
  assert.equal(isAllowedConnection(pooler), true);
  assert.equal(isAllowedConnection({ ...pooler, PGHOST: 'db.fnzrnlvpkzwztccqzyzf.supabase.co', PGUSER: 'postgres' }), true);
});

test('incorrect project, user, host, port, TLS and connection overrides are rejected', () => {
  for (const override of [
    { PGUSER: 'postgres.otherproject' }, { PGUSER: 'postgres' }, { PGUSER: '' },
    { PGHOST: 'db.otherproject.supabase.co' }, { PGHOST: 'pooler.supabase.com' },
    { PGHOST: 'aws-0.pooler.supabase.com.example.com' }, { PGHOST: 'aws-0.pooler.supabase.com,other' },
    { PGPORT: '6543' }, { PGPORT: '5433' }, { PGDATABASE: 'other' },
    { PGSSLMODE: 'require' }, { PGSSLMODE: 'verify-ca' }, { PGSSLMODE: 'disable' },
    { VIDEO_BUDGET_TRANSITION_CONFIRM: 'other' }, { PGHOSTADDR: '127.0.0.1' },
    { PGSERVICE: 'other' }, { PGSERVICEFILE: 'other' }, { PGOPTIONS: '-c something=1' },
  ]) assert.equal(isAllowedConnection({ ...pooler, ...override }), false, JSON.stringify(override));
});
