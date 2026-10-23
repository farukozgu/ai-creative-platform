\set ON_ERROR_STOP on
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '5s';
SELECT current_setting('server_version_num') AS server_version_num, current_user AS migration_role;
SELECT attname, format_type(atttypid,atttypmod) AS type, attnotnull
FROM pg_attribute WHERE attrelid='supabase_migrations.schema_migrations'::regclass
  AND attnum>0 AND NOT attisdropped ORDER BY attnum;
DO $compatibility$
BEGIN
  IF current_setting('transaction_read_only') <> 'on' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Expected read-only inspection as postgres';
  END IF;
  IF current_setting('server_version_num')::integer < 140000 THEN
    RAISE EXCEPTION 'F07 requires PostgreSQL 14 or newer for CREATE OR REPLACE TRIGGER';
  END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 39 OR
    EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261101030000') THEN
    RAISE EXCEPTION 'Expected 39 recorded migrations and pending F07';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='supabase_migrations.schema_migrations'::regclass
      AND attname='version' AND atttypid='text'::regtype AND attnotnull AND NOT attisdropped)
    OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='supabase_migrations.schema_migrations'::regclass
      AND attname='name' AND atttypid='text'::regtype AND NOT attisdropped)
    OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='supabase_migrations.schema_migrations'::regclass
      AND attname='statements' AND atttypid='text[]'::regtype AND NOT attisdropped)
    OR (SELECT count(*) FROM pg_attribute WHERE attrelid='supabase_migrations.schema_migrations'::regclass
      AND attnum>0 AND NOT attisdropped) <> 3 THEN
    RAISE EXCEPTION 'History table does not match pinned CLI version/name/statements contract';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='supabase_migrations.schema_migrations'::regclass
      AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (version)' AND convalidated AND NOT condeferrable)
    OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='supabase_migrations.schema_migrations'::regclass AND NOT tgisinternal)
    OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class='supabase_migrations.schema_migrations'::regclass)
    OR EXISTS(SELECT 1 FROM pg_class WHERE oid='supabase_migrations.schema_migrations'::regclass
      AND (relkind<>'r' OR relrowsecurity OR relforcerowsecurity OR pg_get_userbyid(relowner)<>'postgres'))
    OR NOT has_table_privilege(current_user,'supabase_migrations.schema_migrations','INSERT') THEN
    RAISE EXCEPTION 'History table owner, constraints, privileges, rules, triggers or RLS need separate review';
  END IF;
END;
$compatibility$;
ROLLBACK;
\echo KLAY_F07_CLI_COMPATIBILITY_PREFLIGHT_COMPLETE
