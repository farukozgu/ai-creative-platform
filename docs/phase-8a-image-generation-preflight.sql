-- Phase 8A read-only image-generation preflight.
-- In Supabase SQL Editor, first verify the selected project is
-- fnzrnlvpkzwztccqzyzf. This file runs catalog SELECTs only; it does not
-- inspect or modify migration history and must not be used with a staging ref.

-- Required application columns. A MISSING row or an unexpected type is a
-- blocker; compare actual type/nullable details before any later change.
with required_columns(table_name, column_name, expected_type) as (
  values
    ('projects', 'id', 'uuid'),
    ('projects', 'user_id', 'uuid'),
    ('projects', 'title', 'text'),
    ('projects', 'creative_direction', 'text'),
    ('assets', 'id', 'uuid'),
    ('assets', 'user_id', 'uuid'),
    ('assets', 'project_id', 'uuid'),
    ('assets', 'bucket_id', 'text'),
    ('assets', 'object_path', 'text'),
    ('assets', 'asset_type', 'text'),
    ('assets', 'product_profile', 'jsonb'),
    ('assets', 'product_role', 'text'),
    ('assets', 'sort_order', 'integer'),
    ('assets', 'reference_analysis_cache', 'jsonb'),
    ('generations', 'id', 'uuid'),
    ('generations', 'owner_id', 'uuid'),
    ('generations', 'client_submission_id', 'uuid'),
    ('generations', 'project_id', 'uuid'),
    ('generations', 'input_asset_id', 'uuid'),
    ('generations', 'generation_type', 'text'),
    ('generations', 'status', 'text'),
    ('generations', 'provider', 'text'),
    ('generations', 'model', 'text'),
    ('generations', 'quality', 'text'),
    ('generations', 'aspect_ratio', 'text'),
    ('generations', 'preservation_mode', 'text'),
    ('generations', 'fidelity_status', 'text'),
    ('generations', 'creative_direction_snapshot', 'text'),
    ('generations', 'provider_metadata', 'jsonb'),
    ('generations', 'provider_request_id', 'text'),
    ('generations', 'output_bucket_id', 'text'),
    ('generations', 'output_object_path', 'text'),
    ('generations', 'output_mime_type', 'text'),
    ('generations', 'processing_started_at', 'timestamp with time zone'),
    ('generations', 'processing_completed_at', 'timestamp with time zone'),
    ('generations', 'processing_duration_ms', 'integer'),
    ('generations', 'error_message', 'text'),
    ('generations', 'execution_lease_token', 'uuid'),
    ('generations', 'execution_lease_expires_at', 'timestamp with time zone'),
    ('generations', 'execution_lease_version', 'bigint'),
    ('generations', 'execution_attempts', 'integer'),
    ('generations', 'provider_submission_state', 'text'),
    ('generations', 'provider_submission_started_at', 'timestamp with time zone'),
    ('generations', 'provider_submission_phase', 'text'),
    ('generations', 'created_at', 'timestamp with time zone'),
    ('generations', 'updated_at', 'timestamp with time zone')
)
select r.table_name, r.column_name, r.expected_type,
       coalesce(c.data_type, 'MISSING') as actual_type,
       c.is_nullable
from required_columns r
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = r.table_name
 and c.column_name = r.column_name
order by r.table_name, r.column_name;

-- Worker table privileges. The image worker reads projects/assets and inserts,
-- reads, and updates generations using SUPABASE_SECRET_KEY (service_role).
-- Migration 20260901001000 already grants projects SELECT to service_role;
-- verify actual deployment rather than assuming a missing grant.
select object_name, privilege, has_table_privilege('service_role', object_name, privilege) as granted
from (values
  ('public.projects', 'SELECT'),
  ('public.assets', 'SELECT'),
  ('public.assets', 'INSERT'),
  ('public.generations', 'SELECT'),
  ('public.generations', 'INSERT'),
  ('public.generations', 'UPDATE')
) required(object_name, privilege)
order by object_name, privilege;

-- Asset reference caching is only needed when a reference image is included.
select has_column_privilege('service_role', 'public.assets', 'reference_analysis_cache', 'UPDATE')
       as service_role_can_update_reference_analysis_cache;

-- RLS must remain enabled for user-facing reads. Return the relevant owner
-- policies so their predicates can be compared with the local migrations.
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       p.polname, pg_get_expr(p.polqual, p.polrelid) as using_expression,
       pg_get_expr(p.polwithcheck, p.polrelid) as check_expression
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relname in ('projects', 'assets', 'generations')
order by c.relname, p.polname;

-- Storage buckets must exist and remain private. This flow downloads product
-- inputs and uploads generated PNGs through the Supabase Storage service API.
select expected.id,
       b.id is not null as exists,
       b.public,
       b.file_size_limit,
       b.allowed_mime_types
from (values ('product-assets'), ('generated-assets')) expected(id)
left join storage.buckets b on b.id = expected.id
order by expected.id;

-- Trigger presence and definitions for timestamp maintenance and product asset
-- shape/ordering relied on by the current application.
with expected_triggers(table_name, trigger_name) as (
  values
    ('generations', 'generations_set_timestamps'),
    ('projects', 'projects_set_timestamps'),
    ('assets', 'assets_limit_project_product_images'),
    ('assets', 'assets_limit_project_reference_images')
)
select e.table_name, e.trigger_name,
       coalesce(pg_get_triggerdef(t.oid, true), 'MISSING') as definition
from expected_triggers e
left join pg_trigger t
  on t.tgname = e.trigger_name
 and not t.tgisinternal
 and t.tgrelid = to_regclass('public.' || e.table_name)
order by e.table_name, e.trigger_name;

-- Idempotency and queue invariants. Definitions are returned for manual
-- comparison with migrations 20261027000000, 20261028000000 and 20261029000000.
with expected_indexes(index_name) as (
  values
    ('generations_image_owner_submission_unique'),
    ('generations_image_execution_claim_idx')
)
select e.index_name, i.indisunique,
       pg_get_expr(i.indpred, i.indrelid) as predicate,
       coalesce(pg_get_indexdef(i.indexrelid), 'MISSING') as definition
from expected_indexes e
left join pg_class idx on idx.relname = e.index_name
left join pg_namespace idx_ns on idx_ns.oid = idx.relnamespace and idx_ns.nspname = 'public'
left join pg_index i on i.indexrelid = idx.oid and idx_ns.oid is not null and i.indrelid = to_regclass('public.generations')
order by e.index_name;

-- Constraints that preserve the accepted image-job state and supported
-- provider inputs. Review each returned expression for compatibility.
with required_constraints(table_name, constraint_name) as (
  values
    ('generations', 'generations_type_check'),
    ('generations', 'generations_status_check'),
    ('generations', 'generations_quality_check'),
    ('generations', 'generations_aspect_ratio_check'),
    ('generations', 'generations_preservation_mode_check'),
    ('generations', 'generations_image_execution_attempts_check'),
    ('generations', 'generations_image_submission_state_check'),
    ('generations', 'generations_image_execution_lease_check'),
    ('generations', 'generations_reconciliation_type_check'),
    ('generations', 'generations_image_submission_phase_check')
)
select r.table_name, r.constraint_name,
       coalesce(pg_get_constraintdef(c.oid, true), 'MISSING') as definition
from required_constraints r
left join pg_constraint c
  on c.conname = r.constraint_name
 and c.conrelid = to_regclass('public.' || r.table_name)
order by r.constraint_name;

-- Both RPCs must be service_role-only. Confirm bodies enforce queue status,
-- bounded attempts, SKIP LOCKED claims, and token/version/expiry fencing.
with expected_functions(signature) as (
  values
    ('public.claim_queued_image_generations(integer,integer)'),
    ('public.renew_image_generation_lease(uuid,uuid,bigint,integer)')
)
select e.signature,
       p.oid::regprocedure as actual_signature,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
       pg_get_functiondef(p.oid) as definition
from expected_functions e
left join pg_proc p on p.oid = to_regprocedure(e.signature)
order by e.signature;

-- Service-role RLS bypass and Storage catalog evidence only. These SELECTs do
-- not prove Storage API credential routing or upload success at runtime.
select rolname, rolbypassrls from pg_roles where rolname = 'service_role';
select has_schema_privilege('service_role', 'public', 'USAGE') as public_usage;
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname = 'storage' and tablename = 'objects'
order by policyname;
select relname, relrowsecurity from pg_class
where oid in (to_regclass('storage.objects'), to_regclass('storage.buckets'));

-- Only after the columns query confirms public.generations exists, run this
-- separate read-only query before manual dispatch. Confirm it returns exactly
-- the intended queued image and no unrelated eligible work:
--
-- select id, project_id, status, provider, model, quality, aspect_ratio,
--        execution_attempts, provider_submission_state, created_at
-- from public.generations
-- where generation_type = 'image'
--   and status in ('queued', 'processing', 'reconciliation_required')
-- order by created_at, id;
