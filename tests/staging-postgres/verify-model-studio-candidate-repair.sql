-- Read-only post-install verification. Returns one PASS/FAIL/REVIEW result table.
WITH checks AS (
  SELECT 'candidate tables and pointers'::text AS check_name,
    CASE WHEN to_regclass('public.model_candidate_jobs') IS NOT NULL
      AND to_regclass('public.model_candidates') IS NOT NULL
      AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.model_profiles'::regclass
        AND attname='current_identity_version_id' AND atttypid='uuid'::regtype AND NOT attnotnull AND NOT attisdropped)
      AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.model_profiles'::regclass
        AND attname='approved_candidate_id' AND atttypid='uuid'::regtype AND NOT attnotnull AND NOT attisdropped)
      THEN 'PASS' ELSE 'FAIL' END AS status,
    'jobs='||(to_regclass('public.model_candidate_jobs') IS NOT NULL)||
      '; candidates='||(to_regclass('public.model_candidates') IS NOT NULL)||
      '; profile pointers='||coalesce((SELECT string_agg(attname,', ' ORDER BY attname)
        FROM pg_attribute WHERE attrelid='public.model_profiles'::regclass
          AND attname IN ('current_identity_version_id','approved_candidate_id')
          AND attnum>0 AND NOT attisdropped),'(missing)') AS details

  UNION ALL
  SELECT 'trusted server-side candidate persistence grants',
    CASE WHEN (SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role')
      AND has_table_privilege('service_role','public.model_profiles','SELECT')
      AND has_table_privilege('service_role','public.model_candidate_jobs','SELECT')
      AND has_table_privilege('service_role','public.model_candidate_jobs','INSERT')
      AND has_table_privilege('service_role','public.model_candidate_jobs','UPDATE')
      AND NOT has_table_privilege('service_role','public.model_candidate_jobs','DELETE')
      AND has_table_privilege('service_role','public.model_candidates','SELECT')
      AND has_table_privilege('service_role','public.model_candidates','INSERT')
      AND has_table_privilege('service_role','public.model_candidates','UPDATE')
      AND NOT has_table_privilege('service_role','public.model_candidates','DELETE')
      AND has_table_privilege('service_role','public.model_reference_assets','SELECT')
      AND has_table_privilege('service_role','public.model_reference_assets','INSERT')
      AND NOT has_table_privilege('service_role','public.model_reference_assets','UPDATE')
      AND NOT has_table_privilege('service_role','public.model_reference_assets','DELETE')
      AND NOT has_table_privilege('authenticated','public.model_candidate_jobs','INSERT')
      AND NOT has_table_privilege('authenticated','public.model_candidate_jobs','UPDATE')
      AND NOT has_table_privilege('authenticated','public.model_candidate_jobs','DELETE')
      AND NOT has_table_privilege('authenticated','public.model_candidates','INSERT')
      AND NOT has_table_privilege('authenticated','public.model_candidates','UPDATE')
      AND NOT has_table_privilege('authenticated','public.model_candidates','DELETE')
      AND has_table_privilege('authenticated','public.model_candidate_jobs','SELECT')
      AND has_table_privilege('authenticated','public.model_candidates','SELECT')
      AND NOT has_table_privilege('authenticated','public.model_reference_assets','INSERT')
      AND NOT has_table_privilege('authenticated','public.model_reference_assets','UPDATE')
      AND NOT has_table_privilege('authenticated','public.model_reference_assets','DELETE')
      THEN 'PASS' ELSE 'FAIL' END,
    'service_role can read/create/update jobs and candidates, read/create reference metadata, and SELECT profile owners; no DELETE grant; authenticated users remain read-only'

  UNION ALL
  SELECT 'server-side private reference storage path',
    CASE WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id='model-reference-assets' AND NOT public)
      AND has_table_privilege('service_role','storage.objects','INSERT')
      AND has_table_privilege('service_role','storage.objects','SELECT')
      AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
        AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
        AND (coalesce(qual,'')||' '||coalesce(with_check,'')) ILIKE '%model-reference-assets%')
      THEN 'PASS' ELSE 'FAIL' END,
    'private bucket, service_role Storage API write/read privileges, and no authenticated bucket-specific write policy; metadata INSERT is checked above'

  UNION ALL
  SELECT 'candidate RLS and owner policies',
    CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE oid='public.model_candidate_jobs'::regclass)
      AND (SELECT relrowsecurity FROM pg_class WHERE oid='public.model_candidates'::regclass)
      AND EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.model_candidate_jobs'::regclass
        AND polname='Owners select model candidate jobs' AND polcmd='r')
      AND EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.model_candidates'::regclass
        AND polname='Owners select model candidates' AND polcmd='r')
      AND NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.model_candidate_jobs'::regclass
        AND polcmd='a' AND 'authenticated'::regrole=ANY(polroles)) THEN 'PASS' ELSE 'FAIL' END,
    'RLS enabled on both candidate tables; authenticated owner-read policies present; no authenticated enqueue policy'

  UNION ALL
  SELECT 'corrected ownership triggers',
    CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.enforce_model_candidate_ownership()')
        AND NOT prosecdef AND prosrc LIKE '%IF TG_TABLE_NAME=''model_candidate_jobs'' THEN%'
        AND prosrc LIKE '%ELSIF TG_TABLE_NAME=''model_candidates'' THEN%')
      AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.model_candidate_jobs'::regclass
        AND tgname='model_candidate_jobs_owner_guard' AND tgtype=23 AND tgenabled IN ('O','A')
        AND tgfoid=to_regprocedure('public.enforce_model_candidate_ownership()'))
      AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.model_candidates'::regclass
        AND tgname='model_candidates_owner_guard' AND tgtype=23 AND tgenabled IN ('O','A')
        AND tgfoid=to_regprocedure('public.enforce_model_candidate_ownership()'))
      AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.model_identity_version_references'::regclass
        AND tgname='model_identity_version_references_owner_guard' AND tgtype=7 AND tgenabled IN ('O','A'))
      THEN 'PASS' ELSE 'FAIL' END,
    coalesce((SELECT string_agg(pg_get_triggerdef(oid),' | ' ORDER BY tgname) FROM pg_trigger
      WHERE tgname IN ('model_candidate_jobs_owner_guard','model_candidates_owner_guard',
        'model_identity_version_references_owner_guard') AND NOT tgisinternal),'expected ownership trigger missing')

  UNION ALL
  SELECT 'approval/profile guard and protected context',
    CASE WHEN (SELECT prosecdef FROM pg_proc WHERE oid=to_regprocedure('public.enforce_model_profile_transition()'))
      AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.model_profiles'::regclass
        AND tgname='model_profiles_enforce_transition' AND tgtype=23 AND tgenabled IN ('O','A'))
      AND to_regclass('klay_model_security.approval_context') IS NOT NULL
      AND coalesce((SELECT relrowsecurity FROM pg_class WHERE oid='klay_model_security.approval_context'::regclass),false)
      AND NOT has_schema_privilege('anon','klay_model_security','USAGE')
      AND NOT has_schema_privilege('authenticated','klay_model_security','USAGE')
      AND NOT has_schema_privilege('service_role','klay_model_security','USAGE')
      AND NOT has_table_privilege('anon','klay_model_security.approval_context','SELECT')
      AND NOT has_table_privilege('authenticated','klay_model_security.approval_context','SELECT')
      AND NOT has_table_privilege('service_role','klay_model_security.approval_context','SELECT')
      AND (SELECT count(*) FROM klay_model_security.approval_context)=0
      THEN 'PASS' ELSE 'FAIL' END,
    'profile guard SECURITY DEFINER='||coalesce((SELECT prosecdef::text FROM pg_proc
      WHERE oid=to_regprocedure('public.enforce_model_profile_transition()')),'missing')||
      '; protected context rows='||coalesce((SELECT count(*)::text FROM klay_model_security.approval_context),'missing')

  UNION ALL
  SELECT 'privileged RPC signatures and grants',
    CASE WHEN to_regprocedure('public.approve_model_candidate(uuid,uuid)') IS NOT NULL
      AND to_regprocedure('public.claim_queued_model_candidate_jobs(integer,integer)') IS NOT NULL
      AND to_regprocedure('public.renew_model_candidate_lease(uuid,uuid,bigint,integer)') IS NOT NULL
      AND (SELECT prosecdef FROM pg_proc WHERE oid=to_regprocedure('public.approve_model_candidate(uuid,uuid)'))
      AND (SELECT prosecdef FROM pg_proc WHERE oid=to_regprocedure('public.claim_queued_model_candidate_jobs(integer,integer)'))
      AND (SELECT prosecdef FROM pg_proc WHERE oid=to_regprocedure('public.renew_model_candidate_lease(uuid,uuid,bigint,integer)'))
      AND (SELECT proconfig=ARRAY['search_path=""'] FROM pg_proc WHERE oid=to_regprocedure('public.approve_model_candidate(uuid,uuid)'))
      AND (SELECT proconfig=ARRAY['search_path=""'] FROM pg_proc WHERE oid=to_regprocedure('public.claim_queued_model_candidate_jobs(integer,integer)'))
      AND (SELECT proconfig=ARRAY['search_path=""'] FROM pg_proc WHERE oid=to_regprocedure('public.renew_model_candidate_lease(uuid,uuid,bigint,integer)'))
      AND NOT has_function_privilege('anon','public.approve_model_candidate(uuid,uuid)','EXECUTE')
      AND NOT has_function_privilege('authenticated','public.approve_model_candidate(uuid,uuid)','EXECUTE')
      AND has_function_privilege('service_role','public.approve_model_candidate(uuid,uuid)','EXECUTE')
      AND NOT has_function_privilege('anon','public.claim_queued_model_candidate_jobs(integer,integer)','EXECUTE')
      AND NOT has_function_privilege('authenticated','public.claim_queued_model_candidate_jobs(integer,integer)','EXECUTE')
      AND has_function_privilege('service_role','public.claim_queued_model_candidate_jobs(integer,integer)','EXECUTE')
      AND NOT has_function_privilege('anon','public.renew_model_candidate_lease(uuid,uuid,bigint,integer)','EXECUTE')
      AND NOT has_function_privilege('authenticated','public.renew_model_candidate_lease(uuid,uuid,bigint,integer)','EXECUTE')
      AND has_function_privilege('service_role','public.renew_model_candidate_lease(uuid,uuid,bigint,integer)','EXECUTE')
      THEN 'PASS' ELSE 'FAIL' END,
    'approval, claim and renewal are executable by service_role only among API roles'

  UNION ALL
  SELECT 'profile data remains compatible',
    CASE WHEN NOT EXISTS (SELECT 1 FROM public.model_profiles WHERE status NOT IN ('draft','archived','approved'))
      AND NOT EXISTS (SELECT 1 FROM public.model_profiles p WHERE p.status<>'approved'
        AND (p.current_identity_version_id IS NOT NULL OR p.approved_candidate_id IS NOT NULL))
      AND NOT EXISTS (SELECT 1 FROM public.model_identity_versions v LEFT JOIN public.model_profiles p
        ON p.id=v.model_id AND p.user_id=v.user_id WHERE p.id IS NULL)
      AND NOT EXISTS (SELECT 1 FROM public.model_profiles p WHERE p.status='approved' AND NOT EXISTS (
        SELECT 1 FROM public.model_identity_versions v
        JOIN public.model_candidates c ON c.id=p.approved_candidate_id
          AND c.model_id=p.id AND c.user_id=p.user_id AND c.status='ready'
        JOIN public.model_candidate_jobs j ON j.id=c.job_id AND j.model_id=p.id AND j.user_id=p.user_id
          AND j.status='succeeded' AND j.submission_state='persisted'
        JOIN public.model_reference_assets a ON a.id=c.primary_reference_asset_id
          AND a.model_id=p.id AND a.user_id=p.user_id AND a.source='candidate_generated'
        JOIN public.model_identity_version_references r ON r.identity_version_id=v.id
          AND r.reference_asset_id=a.id AND r.view='front'
        WHERE v.id=p.current_identity_version_id AND v.model_id=p.id AND v.user_id=p.user_id))
      THEN 'PASS' ELSE 'FAIL' END,
    'no unsupported statuses, pointer inconsistencies or identity owner mismatches'

  UNION ALL
  SELECT 'private Storage bucket preserved',
    CASE WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id='model-reference-assets' AND NOT public)
      THEN 'PASS' ELSE 'FAIL' END,
    'bucket must remain private; this migration does not modify Storage objects or policies'
)
SELECT check_name,status,details FROM checks ORDER BY check_name;
