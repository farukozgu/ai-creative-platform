-- Read-only verification. Run manually after applying the UGC foundation migration.
-- Returns every check together as (check_name, status).
with
expected_tables(table_name) as (
  values ('ugc_projects'), ('ugc_video_jobs')
),
table_checks as (
  select 'table_and_rls:' || e.table_name as check_name,
    case when c.oid is not null and c.relrowsecurity then 'PASS' else 'FAIL' end as status
  from expected_tables e
  left join pg_class c on c.oid = to_regclass(format('public.%I', e.table_name))
),
required_policies(table_name, policy_name, command_name) as (
  values
    ('ugc_projects', 'UGC owners read their projects', 'SELECT'),
    ('ugc_projects', 'UGC owners create their projects', 'INSERT'),
    ('ugc_projects', 'UGC owners update their projects', 'UPDATE'),
    ('ugc_video_jobs', 'UGC owners read their video jobs', 'SELECT')
),
policy_checks as (
  select 'ownership_policy:' || r.table_name || ':' || r.command_name as check_name,
    case when p.policyname is not null and r.command_name = p.cmd
      and p.roles @> array['authenticated']::name[]
      and case when r.command_name = 'INSERT'
        then coalesce(p.with_check, '') like '%auth.uid()%'
        else coalesce(p.qual, '') like '%auth.uid()%'
          and (r.command_name <> 'UPDATE' or coalesce(p.with_check, '') like '%auth.uid()%')
        end
      then 'PASS' else 'FAIL' end as status
  from required_policies r
  left join pg_policies p on p.schemaname = 'public'
    and p.tablename = r.table_name and p.policyname = r.policy_name
),
required_service_privileges(table_name, privilege_name) as (
  values
    ('ugc_projects', 'SELECT'), ('ugc_projects', 'INSERT'), ('ugc_projects', 'UPDATE'),
    ('ugc_video_jobs', 'SELECT'), ('ugc_video_jobs', 'INSERT'), ('ugc_video_jobs', 'UPDATE')
),
service_privilege_checks as (
  select 'service_role:' || e.table_name || ':' || e.privilege_name as check_name,
    case when exists (
      select 1 from information_schema.role_table_grants g
      where g.table_schema = 'public' and g.grantee = 'service_role'
        and g.table_name = e.table_name and g.privilege_type = e.privilege_name
    ) then 'PASS' else 'FAIL' end as status
  from required_service_privileges e
),
expected_buckets(bucket_id, expected_size, expected_mime_types) as (
  values
    ('ugc-product-assets', 10485760::bigint, array['image/jpeg', 'image/png', 'image/webp']::text[]),
    ('ugc-generated-videos', 536870912::bigint, array['video/mp4']::text[])
),
bucket_checks as (
  select 'private_bucket:' || e.bucket_id as check_name,
    case when b.id is not null and b.public = false and b.file_size_limit = e.expected_size
      and b.allowed_mime_types = e.expected_mime_types then 'PASS' else 'FAIL' end as status
  from expected_buckets e
  left join storage.buckets b on b.id = e.bucket_id
),
integrity_checks as (
  select 'ugc_video_jobs_result_check' as check_name,
    case when exists (
      select 1 from pg_constraint c
      where c.conrelid = to_regclass('public.ugc_video_jobs')
        and c.conname = 'ugc_video_jobs_result_check' and c.contype = 'c'
        and pg_get_constraintdef(c.oid) like '%ugc-generated-videos%'
        and pg_get_constraintdef(c.oid) like '%succeeded%'
        and pg_get_constraintdef(c.oid) like '%video/mp4%'
        and pg_get_constraintdef(c.oid) like '%output_byte_size%'
        and pg_get_constraintdef(c.oid) like '%duration_seconds%'
    ) then 'PASS' else 'FAIL' end as status
  union all
  select 'ugc_video_jobs_owner_idempotency_unique' as check_name,
    case when exists (
      select 1 from pg_indexes
      where schemaname = 'public' and tablename = 'ugc_video_jobs'
        and indexname = 'ugc_video_jobs_owner_idempotency_unique'
        and indexdef like '%UNIQUE%' and indexdef like '%owner_id, idempotency_key%'
    ) then 'PASS' else 'FAIL' end as status
  union all
  select 'ugc_video_jobs_snapshot_immutable_trigger' as check_name,
    case when exists (
      select 1 from pg_trigger
      where tgrelid = to_regclass('public.ugc_video_jobs')
        and tgname = 'ugc_video_jobs_set_timestamps' and not tgisinternal
    ) and exists (
      select 1 from pg_proc p join pg_trigger t on t.tgfoid = p.oid
      where t.tgrelid = to_regclass('public.ugc_video_jobs')
        and t.tgname = 'ugc_video_jobs_set_timestamps'
        and pg_get_functiondef(p.oid) like '%request_snapshot%'
        and pg_get_functiondef(p.oid) like '%request_hash%'
        and pg_get_functiondef(p.oid) like '%idempotency_key%'
    ) then 'PASS' else 'FAIL' end as status
)
select check_name, status from (
  select * from table_checks
  union all select * from policy_checks
  union all select * from service_privilege_checks
  union all select * from bucket_checks
  union all select * from integrity_checks
) checks
order by check_name;
