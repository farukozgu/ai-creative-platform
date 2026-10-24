-- Read-only catalog preflight for the proposed Model Studio candidate repair.
-- Run in Supabase SQL Editor. This emits one result table and performs no DDL/DML.
WITH
expected_columns(table_name, column_name, data_type, not_null) AS (
  VALUES
    ('model_profiles','id','uuid',true), ('model_profiles','user_id','uuid',true),
    ('model_profiles','name','text',true), ('model_profiles','status','text',true),
    ('model_profiles','appearance','jsonb',true), ('model_profiles','notes','text',false),
    ('model_profiles','created_at','timestamp with time zone',true),
    ('model_profiles','updated_at','timestamp with time zone',true),
    ('model_profiles','archived_at','timestamp with time zone',false),
    ('model_identity_versions','id','uuid',true), ('model_identity_versions','model_id','uuid',true),
    ('model_identity_versions','user_id','uuid',true),
    ('model_identity_versions','version_number','integer',true),
    ('model_identity_versions','appearance','jsonb',true),
    ('model_identity_versions','created_at','timestamp with time zone',true),
    ('model_reference_assets','id','uuid',true), ('model_reference_assets','model_id','uuid',true),
    ('model_reference_assets','user_id','uuid',true), ('model_reference_assets','bucket_id','text',true),
    ('model_reference_assets','object_path','text',true), ('model_reference_assets','source','text',true),
    ('model_reference_assets','mime_type','text',true), ('model_reference_assets','byte_size','integer',true),
    ('model_reference_assets','created_at','timestamp with time zone',true),
    ('model_identity_version_references','identity_version_id','uuid',true),
    ('model_identity_version_references','reference_asset_id','uuid',true),
    ('model_identity_version_references','view','text',true),
    ('model_candidate_jobs','id','uuid',true), ('model_candidate_jobs','model_id','uuid',true),
    ('model_candidate_jobs','user_id','uuid',true), ('model_candidate_jobs','idempotency_key','uuid',true),
    ('model_candidate_jobs','status','text',true), ('model_candidate_jobs','provider','text',true),
    ('model_candidate_jobs','model','text',true), ('model_candidate_jobs','appearance_snapshot','jsonb',true),
    ('model_candidate_jobs','provider_metadata','jsonb',true), ('model_candidate_jobs','error_code','text',false),
    ('model_candidate_jobs','lease_token','uuid',false),
    ('model_candidate_jobs','lease_expires_at','timestamp with time zone',false),
    ('model_candidate_jobs','lease_version','bigint',true),
    ('model_candidate_jobs','provider_submitted_at','timestamp with time zone',false),
    ('model_candidate_jobs','submission_state','text',true),
    ('model_candidate_jobs','reconciliation_required_at','timestamp with time zone',false),
    ('model_candidate_jobs','created_at','timestamp with time zone',true),
    ('model_candidate_jobs','updated_at','timestamp with time zone',true),
    ('model_candidates','id','uuid',true), ('model_candidates','job_id','uuid',true),
    ('model_candidates','model_id','uuid',true), ('model_candidates','user_id','uuid',true),
    ('model_candidates','status','text',true), ('model_candidates','appearance_snapshot','jsonb',true),
    ('model_candidates','primary_reference_asset_id','uuid',false),
    ('model_candidates','created_at','timestamp with time zone',true),
    ('model_candidates','finalized_at','timestamp with time zone',false),
    ('model_profiles','current_identity_version_id','uuid',false),
    ('model_profiles','approved_candidate_id','uuid',false)
),
tables(table_name) AS (
  VALUES ('model_profiles'),('model_identity_versions'),('model_reference_assets'),
         ('model_identity_version_references'),('model_candidate_jobs'),('model_candidates')
),
column_checks AS (
  SELECT 'column:'||e.table_name||'.'||e.column_name AS check_name,
    CASE WHEN c.oid IS NULL OR a.attnum IS NULL THEN 'FAIL'
         WHEN format_type(a.atttypid,a.atttypmod)<>e.data_type OR a.attnotnull<>e.not_null THEN 'FAIL'
         ELSE 'PASS' END AS status,
    CASE WHEN c.oid IS NULL THEN 'table missing'
         WHEN a.attnum IS NULL THEN 'column missing'
         ELSE 'expected '||e.data_type||' NOT NULL='||e.not_null||'; actual '
           ||format_type(a.atttypid,a.atttypmod)||' NOT NULL='||a.attnotnull END AS details
  FROM expected_columns e
  LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||e.table_name)
  LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname=e.column_name
    AND a.attnum>0 AND NOT a.attisdropped
),
table_checks AS (
  SELECT 'table_rls:'||t.table_name AS check_name,
    CASE WHEN c.oid IS NULL THEN 'FAIL' WHEN c.relrowsecurity THEN 'PASS' ELSE 'FAIL' END AS status,
    CASE WHEN c.oid IS NULL THEN 'table missing'
      ELSE 'RLS='||c.relrowsecurity||'; FORCE RLS='||c.relforcerowsecurity END AS details
  FROM tables t LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||t.table_name)
),
constraint_checks AS (
  SELECT 'constraints:'||t.table_name AS check_name,
    CASE WHEN c.oid IS NULL THEN 'FAIL' WHEN count(k.oid)=0 THEN 'FAIL' ELSE 'REVIEW' END AS status,
    CASE WHEN c.oid IS NULL THEN 'table missing'
      ELSE coalesce(string_agg(k.conname||' ['||k.contype||']: '||pg_get_constraintdef(k.oid),
        ' | ' ORDER BY k.conname),'no constraints found') END AS details
  FROM tables t LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||t.table_name)
  LEFT JOIN pg_constraint k ON k.conrelid=c.oid
  GROUP BY t.table_name,c.oid
),
trigger_checks AS (
  SELECT 'triggers:'||t.table_name AS check_name,
    CASE WHEN c.oid IS NULL THEN 'FAIL' WHEN count(g.oid)=0 THEN 'FAIL' ELSE 'REVIEW' END AS status,
    CASE WHEN c.oid IS NULL THEN 'table missing'
      ELSE coalesce(string_agg(pg_get_triggerdef(g.oid),' | ' ORDER BY g.tgname),'no triggers found') END AS details
  FROM tables t LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||t.table_name)
  LEFT JOIN pg_trigger g ON g.tgrelid=c.oid AND NOT g.tgisinternal
  GROUP BY t.table_name,c.oid
),
policy_checks AS (
  SELECT 'policies:'||t.table_name AS check_name,
    CASE WHEN c.oid IS NULL THEN 'FAIL' WHEN count(p.oid)=0 THEN 'FAIL' ELSE 'REVIEW' END AS status,
    CASE WHEN c.oid IS NULL THEN 'table missing'
      ELSE coalesce(string_agg(p.polname||' cmd='||p.polcmd||' roles={'||
        (SELECT string_agg(r.rolname,', ' ORDER BY r.rolname) FROM pg_roles r WHERE r.oid=ANY(p.polroles))||
        '} using='||coalesce(pg_get_expr(p.polqual,p.polrelid),'(none)')||
        ' check='||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'(none)'),
        ' | ' ORDER BY p.polname),'no policies found') END AS details
  FROM tables t LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||t.table_name)
  LEFT JOIN pg_policy p ON p.polrelid=c.oid
  GROUP BY t.table_name,c.oid
),
function_expectations(signature, security_definer, service_only) AS (
  VALUES ('public.approve_model_candidate(uuid,uuid)',true,true),
    ('public.claim_queued_model_candidate_jobs(integer,integer)',true,true),
    ('public.renew_model_candidate_lease(uuid,uuid,bigint,integer)',true,true),
    ('public.enforce_model_candidate_ownership()',false,false),
    ('public.enforce_model_profile_transition()',true,false),
    ('public.enforce_model_version_ownership()',false,false),
    ('public.enforce_model_version_reference_ownership()',false,false),
    ('public.prevent_model_version_mutation()',false,false),
    ('public.set_model_candidate_job_timestamps()',false,false)
),
function_checks AS (
  SELECT 'function:'||f.signature AS check_name,
    CASE WHEN p.oid IS NULL THEN 'FAIL'
      WHEN p.prosecdef<>f.security_definer THEN 'FAIL'
      WHEN f.service_only AND (has_function_privilege('anon',p.oid,'EXECUTE')
        OR has_function_privilege('authenticated',p.oid,'EXECUTE')
        OR NOT has_function_privilege('service_role',p.oid,'EXECUTE')) THEN 'FAIL'
      ELSE 'REVIEW' END AS status,
    CASE WHEN p.oid IS NULL THEN 'function missing'
      ELSE 'owner='||pg_get_userbyid(p.proowner)||'; SECURITY DEFINER='||p.prosecdef||
        '; config='||coalesce(p.proconfig::text,'(default)')||'; anon/authenticated/service_role EXECUTE='||
        has_function_privilege('anon',p.oid,'EXECUTE')||'/'||
        has_function_privilege('authenticated',p.oid,'EXECUTE')||'/'||
        has_function_privilege('service_role',p.oid,'EXECUTE')||'; review body and ACL against migrations' END AS details
  FROM function_expectations f LEFT JOIN pg_proc p ON p.oid=to_regprocedure(f.signature)
),
grant_checks AS (
  SELECT 'authenticated_table_grants:'||t.table_name AS check_name,
    CASE WHEN c.oid IS NULL THEN 'FAIL' ELSE 'REVIEW' END AS status,
    CASE WHEN c.oid IS NULL THEN 'table missing'
      ELSE 'SELECT/INSERT/UPDATE/DELETE='||has_table_privilege('authenticated',c.oid,'SELECT')||'/'||
        has_table_privilege('authenticated',c.oid,'INSERT')||'/'||
        has_table_privilege('authenticated',c.oid,'UPDATE')||'/'||
        has_table_privilege('authenticated',c.oid,'DELETE')||'; compare intended table grants and RLS policies' END AS details
  FROM tables t LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||t.table_name)
),
storage_check AS (
  SELECT 'storage:model-reference-assets' AS check_name,
    CASE WHEN b.id IS NULL THEN 'FAIL' WHEN b.public THEN 'FAIL' ELSE 'PASS' END AS status,
    CASE WHEN b.id IS NULL THEN 'bucket missing'
      ELSE 'public='||b.public||'; size_limit='||coalesce(b.file_size_limit::text,'NULL')||
        '; allowed_mime_types='||coalesce(b.allowed_mime_types::text,'NULL') END AS details
  FROM (SELECT 1) seed LEFT JOIN storage.buckets b ON b.id='model-reference-assets'
),
storage_policy_check AS (
  SELECT 'storage_policy:model-reference-assets' AS check_name,
    CASE WHEN count(*)=0 THEN 'FAIL' ELSE 'REVIEW' END AS status,
    coalesce(string_agg(policyname||' cmd='||cmd||' roles='||roles::text||
      ' using='||coalesce(qual,'(none)')||' check='||coalesce(with_check,'(none)'),
      ' | ' ORDER BY policyname),'no bucket policies found; verify private owner-read boundary and no client write policy') AS details
  FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
    AND (qual ILIKE '%model-reference-assets%' OR with_check ILIKE '%model-reference-assets%')
)
SELECT check_name,status,details FROM column_checks
UNION ALL SELECT check_name,status,details FROM table_checks
UNION ALL SELECT check_name,status,details FROM constraint_checks
UNION ALL SELECT check_name,status,details FROM trigger_checks
UNION ALL SELECT check_name,status,details FROM policy_checks
UNION ALL SELECT check_name,status,details FROM function_checks
UNION ALL SELECT check_name,status,details FROM grant_checks
UNION ALL SELECT check_name,status,details FROM storage_check
UNION ALL SELECT check_name,status,details FROM storage_policy_check
ORDER BY check_name;
