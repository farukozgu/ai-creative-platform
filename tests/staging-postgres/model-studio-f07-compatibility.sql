-- Minimal, read-only checks still needed before preparing the candidate repair.
-- Run as the exact role intended to own/execute the forward migration.
WITH checks AS (
  SELECT 'migration_role_matches_profile_guard_owner'::text AS check_name,
    CASE WHEN p.oid IS NULL THEN 'FAIL'
         WHEN pg_get_userbyid(p.proowner)=current_user AND NOT p.prosecdef THEN 'PASS'
         ELSE 'FAIL' END AS status,
    'current_user='||current_user||'; guard_owner='||
      coalesce(pg_get_userbyid(p.proowner),'(function missing)')||
      '; security_definer='||coalesce(p.prosecdef::text,'(missing)') AS details
  FROM (SELECT to_regprocedure('public.enforce_model_profile_transition()') AS oid) f
  LEFT JOIN pg_proc p ON p.oid=f.oid

  UNION ALL

  SELECT 'profile_transition_trigger_contract',
    CASE WHEN count(*)=1 AND bool_and(t.tgtype=19 AND t.tgenabled IN ('O','A')
      AND t.tgnargs=0 AND t.tgqual IS NULL)
      AND bool_and(t.tgfoid=to_regprocedure('public.enforce_model_profile_transition()'))
      THEN 'PASS' ELSE 'FAIL' END,
    coalesce(string_agg(pg_get_triggerdef(t.oid),' | ' ORDER BY t.tgname),'trigger missing')
  FROM pg_trigger t
  WHERE t.tgrelid=to_regclass('public.model_profiles') AND NOT t.tgisinternal
    AND t.tgname='model_profiles_enforce_transition'

  UNION ALL

  SELECT 'profiles_compatible_with_f07_status_contract',
    CASE WHEN count(*) FILTER (WHERE status NOT IN ('draft','archived','approved'))=0
      AND count(*) FILTER (WHERE status='approved')=0 THEN 'PASS' ELSE 'FAIL' END,
    'total='||count(*)||'; draft='||count(*) FILTER (WHERE status='draft')||
      '; archived='||count(*) FILTER (WHERE status='archived')||
      '; approved='||count(*) FILTER (WHERE status='approved')||
      '; other_status='||count(*) FILTER (WHERE status NOT IN ('draft','archived','approved'))
  FROM public.model_profiles

  UNION ALL

  SELECT 'identity_versions_have_matching_profile_owner',
    CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END,
    'orphan_or_owner_mismatch_count='||count(*)
  FROM public.model_identity_versions v
  LEFT JOIN public.model_profiles p ON p.id=v.model_id AND p.user_id=v.user_id
  WHERE p.id IS NULL

  UNION ALL

  SELECT 'f07_private_schema_name_available',
    CASE WHEN to_regnamespace('klay_model_security') IS NULL THEN 'PASS' ELSE 'FAIL' END,
    'klay_model_security exists='||(to_regnamespace('klay_model_security') IS NOT NULL)
)
SELECT check_name,status,details FROM checks ORDER BY check_name;
