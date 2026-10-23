\set ON_ERROR_STOP on
\pset pager off
\pset tuples_only on
\pset format unaligned

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '5s';

DO $preflight$
DECLARE
  migration_count integer;
  distinct_versions integer;
BEGIN
  SELECT count(*), count(DISTINCT version)
  INTO migration_count, distinct_versions
  FROM supabase_migrations.schema_migrations;

  IF migration_count <> 40 OR distinct_versions <> 40 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: expected 40 distinct registered migrations, found % rows and % distinct versions', migration_count, distinct_versions;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261101020000') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: candidate ownership repair version is not registered';
  END IF;

  RAISE NOTICE 'PASS: % migration versions are registered', migration_count;
END;
$preflight$;

ROLLBACK;
\echo KLAY_MIGRATION_PREFLIGHT_PASS
