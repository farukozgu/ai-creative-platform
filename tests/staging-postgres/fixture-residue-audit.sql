\set ON_ERROR_STOP on
\pset pager off
-- Read-only, opt-in. Use only after the staging connection isolation gate.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '5s';

-- Prints only reserved synthetic identity IDs and their test markers.
SELECT id, raw_user_meta_data->>'klay_test_run' AS test_marker
FROM auth.users
WHERE id IN (
  'f7f50000-0000-4000-8000-000000000001',
  'f7f50000-0000-4000-8000-000000000002',
  'f7f50000-0000-4000-8000-000000000901',
  'f7f70000-0000-4000-8000-000000000001',
  'f7f70000-0000-4000-8000-000000000002',
  'f7100000-0000-4000-8000-000000000001',
  'f7100000-0000-4000-8000-000000000002',
  'f7100000-0000-4000-8000-000000000003'
);

DO $no_residue$
BEGIN
  IF EXISTS (
    SELECT 1 FROM auth.users WHERE id IN (
      'f7f50000-0000-4000-8000-000000000001',
      'f7f50000-0000-4000-8000-000000000002',
      'f7f50000-0000-4000-8000-000000000901',
      'f7f70000-0000-4000-8000-000000000001',
      'f7f70000-0000-4000-8000-000000000002',
      'f7100000-0000-4000-8000-000000000001',
      'f7100000-0000-4000-8000-000000000002',
      'f7100000-0000-4000-8000-000000000003'
    )
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: reserved synthetic identity exists; inspect its exact marker and dependencies before any cleanup';
  END IF;
  RAISE NOTICE 'PASS: no reserved synthetic identities remain';
END;
$no_residue$;
ROLLBACK;
\echo KLAY_FIXTURE_RESIDUE_AUDIT_PASS
