// Controlled operator tool. Never reads or prints credentials or admin identities.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const historicalPath = 'database/migrations/20261027131744_configure_video_studio_budget.sql';
const correctionPath = 'database/migrations/20261029135559_preserve_video_budget_policy.sql';

export function isAllowedConnection(env) {
  const direct = env.PGHOST === 'db.fnzrnlvpkzwztccqzyzf.supabase.co';
  const pooler = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.pooler\.supabase\.com$/.test(env.PGHOST ?? '')
    && env.PGUSER === 'postgres.fnzrnlvpkzwztccqzyzf';
  return env.VIDEO_BUDGET_TRANSITION_CONFIRM === 'creative-ai-dev'
    && (direct || pooler)
    && (env.PGPORT ?? '5432') === '5432'
    && env.PGDATABASE === 'postgres'
    && env.PGSSLMODE === 'verify-full'
    && !env.PGHOSTADDR && !env.PGSERVICE && !env.PGSERVICEFILE && !env.PGOPTIONS;
}

export function buildTransitionSql() {
  const historical = readFileSync(historicalPath, 'utf8');
  const correction = readFileSync(correctionPath, 'utf8');
  const prepare = readFileSync('database/verification/video_studio_budget_transition_prepare.sql', 'utf8');
  if ((historical.match(/^begin;\s*$/gim) || []).length !== 1 || (historical.match(/^commit;\s*$/gim) || []).length !== 1) {
    throw new Error('Historical transaction markers have changed');
  }
  const body = historical.replace(/^begin;\s*$/im, '').replace(/^commit;\s*$/im, '');
  if (historical.includes('$migration_record$') || correction.includes('$migration_record$')) throw new Error('Unsafe migration delimiter');
  // Both actual migration bodies and their history rows commit together. This
  // is not migration repair: neither history row is written without its SQL.
  return `begin;\n${prepare}\n${body}\n${correction}\n
    insert into supabase_migrations.schema_migrations(version,name,statements) values
      ('20261027131744','configure_video_studio_budget',array[$migration_record$${historical}$migration_record$]),
      ('20261029135559','preserve_video_budget_policy',array[$migration_record$${correction}$migration_record$]);
    commit;`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!isAllowedConnection(process.env)) {
    throw new Error('Explicit development target and verified TLS are required');
  }
  const result = spawnSync('psql', ['--no-psqlrc', '--quiet', '--set', 'ON_ERROR_STOP=1'], {
    input: buildTransitionSql(), encoding: 'utf8', env: { ...process.env, PGCONNECT_TIMEOUT: '10', PGGSSENCMODE: 'disable' },
  });
  if (result.error || result.status !== 0) {
    // SQL error details can contain privileged function definitions.
    throw new Error('Transition failed; transaction was not committed. Check the connection and database logs securely.');
  }
  console.log('Development video budget transition committed. Run isolated verification before enabling Studio.');
}
