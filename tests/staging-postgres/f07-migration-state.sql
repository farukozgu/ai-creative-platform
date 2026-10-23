\set ON_ERROR_STOP on
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '5s';
-- No fixtures, DDL, DML, approval RPC invocation, or migration history repair.
SELECT set_config('klay.inspection_expected_versions', :'expected_versions', true);
DO $history$
DECLARE expected text[]; actual text[];
BEGIN
  IF current_setting('transaction_read_only') <> 'on' THEN
    RAISE EXCEPTION 'State inspection must be read only';
  END IF;
  expected := string_to_array(current_setting('klay.inspection_expected_versions'), ',');
  IF cardinality(expected) <> 40 OR
    (SELECT count(DISTINCT v) FROM unnest(expected) v WHERE v ~ '^[0-9]{14}$') <> 40 OR
    NOT ('20261101030000' = ANY(expected)) THEN
    RAISE EXCEPTION 'Invalid expected migration manifest';
  END IF;
  SELECT array_agg(version::text ORDER BY version::text) INTO actual
    FROM supabase_migrations.schema_migrations;
  IF actual IS DISTINCT FROM expected AND
    actual IS DISTINCT FROM array_remove(expected, '20261101030000') THEN
    RAISE EXCEPTION 'History differs from exact local manifest with or without pending F07';
  END IF;
END;
$history$;
SELECT count(*) AS history_count,
  count(*) FILTER (WHERE version='20261101030000') AS f07_history_rows
FROM supabase_migrations.schema_migrations;
SELECT to_regnamespace('klay_model_security') IS NOT NULL AS private_schema_exists,
  to_regclass('klay_model_security.approval_context') IS NOT NULL AS context_table_exists;
SELECT p.oid::regprocedure AS function_name, pg_get_userbyid(p.proowner) AS owner,
  p.prosecdef, p.proconfig, p.proacl,
  encode(sha256(convert_to(replace(p.prosrc, chr(13), ''),'UTF8')),'hex') AS normalized_body_sha256,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
WHERE p.oid IN (to_regprocedure('public.enforce_model_profile_transition()'),
  to_regprocedure('public.approve_model_candidate(uuid,uuid)'));
SELECT tgrelid::regclass AS relation, tgname, tgtype, tgenabled,
  pg_get_triggerdef(oid) AS definition
FROM pg_trigger WHERE NOT tgisinternal AND
  (tgfoid=to_regprocedure('public.enforce_model_profile_transition()') OR
   tgname='model_identity_versions_immutable');
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
  pg_get_userbyid(c.relowner) AS owner, c.relacl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='klay_model_security';
SELECT nspname, pg_get_userbyid(nspowner) AS owner, nspacl
FROM pg_namespace WHERE nspname='klay_model_security';
SELECT a.attname, format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull
FROM pg_attribute a
WHERE a.attrelid=to_regclass('klay_model_security.approval_context')
  AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum;
SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
WHERE conrelid=to_regclass('klay_model_security.approval_context');
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname='klay_model_security';
-- Fingerprints are SHA256 of the complete prosrc body with CR removed ONLY.
-- Test-KlayF07StateContracts.ps1 independently checks these against source files.
-- Unknown definitions are drift, never evidence that the repair is absent.
DO $classify$
DECLARE
  old_guard constant text := 'dc63c0aa436b90f64f26405a1855eb3841208b4afc921a5c830cbac406905109';
  old_approval constant text := '0abde1de1ac2a90a3e37dea85ec6ba2c6c4a81909d61e54b367f63daa84566e7';
  new_guard constant text := '81d004b7e2c7cbc777cb434f4cdaec48400ed4ea737bba8e6e842f799dcfd875';
  new_approval constant text := '83f178ebb525b6e71c68269aeb6ebdcb401657decd030e727c15f165beacd93e';
  immutable constant text := '653260d07f074fd2a6c7f8b2616f0d8294e1eaec9455d23be70f7857b86b67c1';
  g pg_catalog.pg_proc%ROWTYPE;
  a pg_catalog.pg_proc%ROWTYPE;
  i pg_catalog.pg_proc%ROWTYPE;
  gh text; ah text; ih text;
  common_ok boolean := false;
  old_trigger boolean := false; new_trigger boolean := false;
  private_ok boolean := false;
  ns oid := to_regnamespace('klay_model_security');
  ctx oid := to_regclass('klay_model_security.approval_context');
  context_count bigint;
  recorded boolean;
  state text := 'INCONCLUSIVE';
BEGIN
  SELECT * INTO g FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('public.enforce_model_profile_transition()');
  SELECT * INTO a FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('public.approve_model_candidate(uuid,uuid)');
  SELECT * INTO i FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('public.prevent_model_version_mutation()');
  IF g.oid IS NULL OR a.oid IS NULL OR i.oid IS NULL THEN
    PERFORM set_config('klay.inspection_state','PARTIAL/DRIFTED',true);
    RETURN;
  END IF;
  gh := encode(sha256(convert_to(replace(g.prosrc,chr(13),''),'UTF8')),'hex');
  ah := encode(sha256(convert_to(replace(a.prosrc,chr(13),''),'UTF8')),'hex');
  ih := encode(sha256(convert_to(replace(i.prosrc,chr(13),''),'UTF8')),'hex');
  common_ok := pg_get_userbyid(g.proowner)='postgres' AND a.proowner=g.proowner AND i.proowner=g.proowner
    AND g.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
    AND a.prolang=g.prolang AND i.prolang=g.prolang
    AND g.prorettype='trigger'::regtype AND i.prorettype='trigger'::regtype AND a.prorettype='uuid'::regtype
    AND NOT g.proretset AND NOT a.proretset AND NOT i.proretset
    AND g.prokind='f' AND a.prokind='f' AND i.prokind='f'
    AND g.proconfig=ARRAY['search_path=""'] AND a.proconfig=g.proconfig AND i.proconfig=g.proconfig
    AND a.prosecdef AND NOT i.prosecdef AND ih=immutable
    -- Supabase default ACLs can explicitly name API roles; NULL is not required.
    AND has_function_privilege('authenticated',g.oid,'EXECUTE')
    AND has_function_privilege('anon',g.oid,'EXECUTE')
    AND has_function_privilege('service_role',g.oid,'EXECUTE')
    AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(g.proacl,acldefault('f',g.proowner))) x
      WHERE x.grantee NOT IN (0,g.proowner,(SELECT oid FROM pg_roles WHERE rolname='anon'),
        (SELECT oid FROM pg_roles WHERE rolname='authenticated'),(SELECT oid FROM pg_roles WHERE rolname='service_role')))
    AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(i.proacl,acldefault('f',i.proowner))) x
      WHERE x.grantee NOT IN (0,i.proowner,(SELECT oid FROM pg_roles WHERE rolname='anon'),
        (SELECT oid FROM pg_roles WHERE rolname='authenticated'),(SELECT oid FROM pg_roles WHERE rolname='service_role')))
    AND NOT has_function_privilege('authenticated',a.oid,'EXECUTE')
    AND NOT has_function_privilege('anon',a.oid,'EXECUTE')
    AND has_function_privilege('service_role',a.oid,'EXECUTE')
    AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(a.proacl,acldefault('f',a.proowner))) x
      WHERE x.grantee NOT IN (a.proowner,(SELECT oid FROM pg_roles WHERE rolname='service_role'))
        OR (x.grantee<>a.proowner AND x.is_grantable))
    AND (SELECT count(*)=1 FROM pg_trigger WHERE tgfoid=g.oid AND NOT tgisinternal)
    AND (SELECT count(*)=1 FROM pg_trigger WHERE tgfoid=i.oid AND NOT tgisinternal)
    AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgfoid=i.oid
      AND tgrelid='public.model_identity_versions'::regclass AND tgname='model_identity_versions_immutable'
      AND tgtype=27 AND tgenabled IN ('O','A') AND tgnargs=0 AND tgqual IS NULL AND tgattr=''::int2vector)
    AND (SELECT count(*)=2 AND bool_and(relrowsecurity) FROM pg_class
      WHERE oid IN ('public.model_profiles'::regclass,'public.model_identity_versions'::regclass));
  SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgfoid=g.oid AND tgrelid='public.model_profiles'::regclass
    AND tgname='model_profiles_enforce_transition' AND tgtype=19 AND tgenabled IN ('O','A')
    AND tgnargs=0 AND tgqual IS NULL AND tgattr=''::int2vector) INTO old_trigger;
  SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgfoid=g.oid AND tgrelid='public.model_profiles'::regclass
    AND tgname='model_profiles_enforce_transition' AND tgtype=23 AND tgenabled IN ('O','A')
    AND tgnargs=0 AND tgqual IS NULL AND tgattr=''::int2vector) INTO new_trigger;
  IF ns IS NOT NULL AND ctx IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM pg_namespace n JOIN pg_class c ON c.relnamespace=n.oid
      WHERE n.oid=ns AND c.oid=ctx AND n.nspowner=g.proowner AND c.relowner=g.proowner
        AND c.relkind='r' AND c.relrowsecurity AND NOT c.relforcerowsecurity)
      AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','service_role']) AS api_roles(role_name)
        WHERE has_schema_privilege(role_name,ns,'USAGE') OR has_schema_privilege(role_name,ns,'CREATE'))
      AND NOT EXISTS(SELECT 1 FROM pg_namespace n,
        LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) x
        WHERE n.oid=ns AND x.grantee<>g.proowner)
      AND NOT EXISTS(SELECT 1 FROM pg_class c,
        LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x
        WHERE c.oid=ctx AND x.grantee<>g.proowner)
      AND NOT EXISTS(SELECT 1 FROM pg_attribute at,
        LATERAL aclexplode(at.attacl) x WHERE at.attrelid=ctx AND x.grantee<>g.proowner)
      AND NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=ctx)
      AND NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=ctx AND NOT tgisinternal)
      AND (SELECT array_agg(attname::text ORDER BY attnum)=ARRAY['backend_pid','transaction_id','model_id','owner_id','candidate_id','version_id']
        AND array_agg(atttypid ORDER BY attnum)=ARRAY['int4'::regtype::oid,'int8'::regtype::oid,'uuid'::regtype::oid,'uuid'::regtype::oid,'uuid'::regtype::oid,'uuid'::regtype::oid]
        AND array_agg(attnotnull ORDER BY attnum)=ARRAY[true,true,true,true,true,false]
        AND bool_and(atthasdef=false AND attidentity='' AND attgenerated='')
        FROM pg_attribute WHERE attrelid=ctx AND attnum>0 AND NOT attisdropped)
      AND (SELECT count(*)=1 AND bool_and(contype='p' AND convalidated AND NOT condeferrable
        AND pg_get_constraintdef(oid)='PRIMARY KEY (backend_pid, transaction_id, model_id)')
        FROM pg_constraint WHERE conrelid=ctx)
      INTO private_ok;
    IF private_ok IS TRUE THEN
      EXECUTE 'SELECT count(*) FROM klay_model_security.approval_context' INTO context_count;
      private_ok := context_count=0;
    END IF;
  END IF;
  SELECT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261101030000') INTO recorded;
  IF common_ok IS TRUE AND NOT recorded AND ns IS NULL AND ctx IS NULL
    AND NOT g.prosecdef AND gh=old_guard AND ah=old_approval AND old_trigger THEN
    state := 'ABSENT';
  ELSIF common_ok IS TRUE AND recorded AND private_ok IS TRUE
    AND g.prosecdef AND gh=new_guard AND ah=new_approval AND new_trigger THEN
    state := 'APPLIED';
  ELSE
    state := 'PARTIAL/DRIFTED';
  END IF;
  PERFORM set_config('klay.inspection_state',state,true);
END;
$classify$;
-- Emit a machine-readable result on stdout, independent of NOTICE verbosity or
-- psql's stderr filename/line prefixes. This GUC carries inspection output only.
\pset format unaligned
\pset tuples_only on
SELECT 'KLAY_F07_STATE=' || current_setting('klay.inspection_state');
ROLLBACK;
\echo KLAY_F07_STATE_INSPECTION_COMPLETE
