-- Read-only verification after the Kling rollout. Each row should pass.
with routes(tier, model_id, endpoint_id) as (values
  ('standard', 'kling-v3-standard-image', 'fal-ai/kling-video/v3/standard/image-to-video'),
  ('premium', 'kling-v3-pro-image', 'fal-ai/kling-video/v3/pro/image-to-video')
), fixtures as (
  select tier, jsonb_build_object('version', 4, 'modelId', model_id, 'endpointId', endpoint_id,
    'model', jsonb_build_object('tier', tier, 'provider', 'fal', 'endpointId', endpoint_id, 'version', 1)) as plan
  from routes
)
select tier || '_snapshot_route' as check_name,
  public.ugc_pipeline_plan_matches_snapshot(plan, jsonb_build_object('model', plan->'model'))
  and not public.ugc_pipeline_plan_matches_snapshot(plan, jsonb_build_object('model', (plan->'model') || '{"endpointId":"removed-provider"}'::jsonb)) as passed
from fixtures
union all
select 'new_claim_versions', position('not in (''1'', ''4'')' in pg_get_functiondef(
  'public.claim_ugc_submission(uuid,uuid,text,jsonb)'::regprocedure)) > 0;
