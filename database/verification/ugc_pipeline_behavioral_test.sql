-- UGC pipeline behavioral test for Supabase SQL Editor.
-- Run only in a disposable/non-production project with the UGC Foundation and
-- Pipeline migrations installed. Uses synthetic auth users and rows only.
-- No provider is contacted. The test fixture subtransaction is intentionally
-- aborted, and the enclosing transaction is explicitly rolled back.

begin;

-- Match the application's recursively key-sorted JSON serialization so the
-- request_hash values below are valid SHA-256 hashes of request_snapshot.
create or replace function pg_temp.ugc_test_canonical_json(p_value jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_result text;
begin
  case jsonb_typeof(p_value)
    when 'object' then
      select '{' || coalesce(string_agg(
        to_json(e.key)::text || ':' || pg_temp.ugc_test_canonical_json(e.value),
        ',' order by e.key collate "C"
      ), '') || '}'
      into v_result
      from jsonb_each(p_value) as e(key, value);
      return v_result;
    when 'array' then
      select '[' || coalesce(string_agg(
        pg_temp.ugc_test_canonical_json(e.value), ',' order by e.ordinality
      ), '') || ']'
      into v_result
      from jsonb_array_elements(p_value) with ordinality as e(value, ordinality);
      return v_result;
    else
      return p_value::text;
  end case;
end;
$$;

create or replace function pg_temp.run_ugc_pipeline_behavioral_test()
returns table (check_name text, result_status text, details text)
language plpgsql
set search_path = ''
as $$
declare
  v_checks jsonb := '[]'::jsonb;
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_project_standard uuid := gen_random_uuid();
  v_project_premium uuid := gen_random_uuid();
  v_project_no_task uuid := gen_random_uuid();
  v_project_other uuid := gen_random_uuid();
  v_job_standard uuid := gen_random_uuid();
  v_job_premium uuid := gen_random_uuid();
  v_job_no_task uuid := gen_random_uuid();
  v_job_other uuid := gen_random_uuid();
  v_key_standard uuid := gen_random_uuid();
  v_key_premium uuid := gen_random_uuid();
  v_key_no_task uuid := gen_random_uuid();
  v_key_other uuid := gen_random_uuid();
  v_snapshot_standard jsonb;
  v_snapshot_premium jsonb;
  v_hash_standard text;
  v_hash_premium text;
  v_plan_standard jsonb;
  v_plan_premium jsonb;
  v_claim public.ugc_video_jobs%rowtype;
  v_claim_old_token uuid;
  v_claim_old_version bigint;
  v_claim_current_token uuid;
  v_claim_current_version bigint;
  v_claim_no_task_token uuid;
  v_claim_no_task_version bigint;
  v_valid boolean;
  v_expected boolean;
  v_rolled_back boolean := false;
  v_own_projects bigint;
  v_foreign_projects bigint;
  v_own_jobs bigint;
  v_foreign_jobs bigint;
  v_fixture_error text;
  v_output jsonb;
  v_rpc_result boolean;
  v_rpc_state text;
  v_rpc_message text;
  v_observed_status text;
  v_observed_task text;
  v_observed_lease_version bigint;
  v_observed_bucket text;
  v_observed_path text;
  v_observed_content_type text;
  v_observed_byte_size bigint;
  v_observed_duration numeric;
  v_check_detail text;
  v_premium_ambiguous_result boolean;
  v_premium_ambiguous_state text;
  v_premium_ambiguous_message text;
begin
  begin
    -- Two synthetic users let the test exercise owner isolation. Their auth
    -- rows, profile-trigger side effects, projects and jobs are all rolled back.
    insert into auth.users (
      id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values
      (v_owner_a, 'authenticated', 'authenticated', v_owner_a::text || '@ugc-test.invalid', '', clock_timestamp(), '{}'::jsonb, '{}'::jsonb, clock_timestamp(), clock_timestamp()),
      (v_owner_b, 'authenticated', 'authenticated', v_owner_b::text || '@ugc-test.invalid', '', clock_timestamp(), '{}'::jsonb, '{}'::jsonb, clock_timestamp(), clock_timestamp());

    insert into public.ugc_projects (id, owner_id, title, creator_concept, configuration)
    values
      (v_project_standard, v_owner_a, 'Synthetic Standard UGC test',
        '{"selection_id":"ada","reference_type":"placeholder_visual"}'::jsonb,
        '{"modelTier":"standard","format":"testimonial","script":"Synthetic rollback test","settings":{"language":"en","tone":"natural","voice":"warm","environment":"home","lighting":"daylight","framing":"medium","duration":"15","aspectRatio":"9:16","subtitles":false}}'::jsonb),
      (v_project_premium, v_owner_a, 'Synthetic Premium UGC test',
        '{"selection_id":"deniz","reference_type":"placeholder_visual"}'::jsonb,
        '{"modelTier":"premium","format":"review","script":"Synthetic rollback test","settings":{"language":"en","tone":"professional","voice":"calm","environment":"studio","lighting":"soft","framing":"close","duration":"15","aspectRatio":"9:16","subtitles":false}}'::jsonb),
      (v_project_no_task, v_owner_a, 'Synthetic expired claim test',
        '{"selection_id":"maya","reference_type":"placeholder_visual"}'::jsonb,
        '{"modelTier":"standard","format":"demo","script":"Synthetic rollback test","settings":{"language":"tr","tone":"energetic","voice":"bright","environment":"outdoor","lighting":"warm","framing":"wide","duration":"15","aspectRatio":"9:16","subtitles":true}}'::jsonb),
      (v_project_other, v_owner_b, 'Synthetic other-owner UGC test',
        '{"selection_id":"ada","reference_type":"placeholder_visual"}'::jsonb,
        '{"modelTier":"standard","format":"story","script":"Synthetic rollback test","settings":{"language":"en","tone":"natural","voice":"warm","environment":"home","lighting":"daylight","framing":"medium","duration":"15","aspectRatio":"9:16","subtitles":false}}'::jsonb);

    v_snapshot_standard := jsonb_build_object(
      'model', jsonb_build_object('tier', 'standard', 'provider', 'fal', 'endpointId', 'fal-ai/kling-video/v3/standard/image-to-video', 'version', 1),
      'creatorConcept', jsonb_build_object('selectionId', 'ada', 'referenceType', 'placeholder_visual'),
      'format', 'testimonial', 'script', 'Synthetic rollback test', 'spokenDialogue', '', 'sceneDirection', 'Neutral indoor setting',
      'settings', jsonb_build_object('language', 'en', 'tone', 'natural', 'voice', 'warm', 'environment', 'home', 'lighting', 'daylight', 'framing', 'medium', 'duration', '15', 'aspectRatio', '9:16', 'subtitles', false)
    );
    v_snapshot_premium := jsonb_build_object(
      'model', jsonb_build_object('tier', 'premium', 'provider', 'fal', 'endpointId', 'fal-ai/kling-video/v3/pro/image-to-video', 'version', 1),
      'creatorConcept', jsonb_build_object('selectionId', 'deniz', 'referenceType', 'placeholder_visual'),
      'format', 'review', 'script', 'Synthetic rollback test', 'spokenDialogue', '', 'sceneDirection', 'Neutral studio setting',
      'settings', jsonb_build_object('language', 'en', 'tone', 'professional', 'voice', 'calm', 'environment', 'studio', 'lighting', 'soft', 'framing', 'close', 'duration', '15', 'aspectRatio', '9:16', 'subtitles', false)
    );
    v_hash_standard := encode(extensions.digest(convert_to(pg_temp.ugc_test_canonical_json(v_snapshot_standard), 'UTF8'), 'sha256'), 'hex');
    v_hash_premium := encode(extensions.digest(convert_to(pg_temp.ugc_test_canonical_json(v_snapshot_premium), 'UTF8'), 'sha256'), 'hex');
    v_plan_standard := jsonb_build_object(
      'version', 4, 'snapshotDigest', v_hash_standard, 'provider', 'fal',
      'modelId', 'kling-v3-standard-image',
      'endpointId', 'fal-ai/kling-video/v3/standard/image-to-video',
      'durationSeconds', 15, 'aspectRatio', '9:16', 'resolution', '720p', 'generateAudio', false,
      'model', v_snapshot_standard->'model'
    );
    v_plan_premium := jsonb_build_object(
      'version', 4, 'snapshotDigest', v_hash_premium, 'provider', 'fal',
      'modelId', 'kling-v3-pro-image',
      'endpointId', 'fal-ai/kling-video/v3/pro/image-to-video',
      'durationSeconds', 15, 'aspectRatio', '9:16', 'resolution', '720p', 'generateAudio', false,
      'model', v_snapshot_premium->'model'
    );

    insert into public.ugc_video_jobs (id, project_id, owner_id, idempotency_key, request_hash, request_snapshot)
    values
      (v_job_standard, v_project_standard, v_owner_a, v_key_standard, v_hash_standard, v_snapshot_standard),
      (v_job_premium, v_project_premium, v_owner_a, v_key_premium, v_hash_premium, v_snapshot_premium),
      (v_job_no_task, v_project_no_task, v_owner_a, v_key_no_task, v_hash_standard, v_snapshot_standard),
      (v_job_other, v_project_other, v_owner_b, v_key_other, v_hash_standard, v_snapshot_standard);

    -- Hashes are computed from the same canonical snapshot inserted above.
    v_checks := v_checks || jsonb_build_array(jsonb_build_object(
      'check_name', 'synthetic request hashes match snapshots',
      'status', case when v_hash_standard = encode(extensions.digest(convert_to(pg_temp.ugc_test_canonical_json(v_snapshot_standard), 'UTF8'), 'sha256'), 'hex')
        and v_hash_premium = encode(extensions.digest(convert_to(pg_temp.ugc_test_canonical_json(v_snapshot_premium), 'UTF8'), 'sha256'), 'hex') then 'PASS' else 'FAIL' end
    ));

    -- A v4 Premium plan cannot claim a Standard snapshot, and v4 Standard
    -- cannot claim a Premium snapshot. Both failures must leave drafts intact.
    v_expected := false;
    begin
      perform 1 from public.claim_ugc_submission(v_owner_a, v_job_standard, v_hash_standard,
        v_plan_premium || jsonb_build_object('snapshotDigest', v_hash_standard));
    exception when raise_exception then
      v_expected := sqlerrm = 'UGC provider route does not match immutable request';
    end;
    v_expected := v_expected and (select j.status = 'draft' from public.ugc_video_jobs as j where j.id = v_job_standard);
    v_checks := v_checks || jsonb_build_array(jsonb_build_object('check_name', 'Premium plan rejected for Standard snapshot', 'status', case when v_expected then 'PASS' else 'FAIL' end));

    v_expected := false;
    begin
      perform 1 from public.claim_ugc_submission(v_owner_a, v_job_premium, v_hash_premium,
        v_plan_standard || jsonb_build_object('snapshotDigest', v_hash_premium));
    exception when raise_exception then
      v_expected := sqlerrm = 'UGC provider route does not match immutable request';
    end;
    v_expected := v_expected and (select j.status = 'draft' from public.ugc_video_jobs as j where j.id = v_job_premium);
    v_checks := v_checks || jsonb_build_array(jsonb_build_object('check_name', 'Standard plan rejected for Premium snapshot', 'status', case when v_expected then 'PASS' else 'FAIL' end));

    -- Invoke the actual SECURITY DEFINER claim RPC as service_role.
    execute 'set local role service_role';
    select * into v_claim from public.claim_ugc_submission(v_owner_a, v_job_standard, v_hash_standard, v_plan_standard);
    v_valid := found and v_claim.status = 'queued'
      and v_claim.provider = 'fal' and v_claim.provider_plan = v_plan_standard
      and v_claim.lease_token is not null and v_claim.lease_version = 1;
    v_claim_old_token := v_claim.lease_token;
    v_claim_old_version := v_claim.lease_version;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object('check_name', 'Standard Kling 3.0 submission claim', 'status', case when v_valid then 'PASS' else 'FAIL' end));

    -- Repeating the same claim sequentially must not return a second claim.
    select * into v_claim from public.claim_ugc_submission(v_owner_a, v_job_standard, v_hash_standard, v_plan_standard);
    v_valid := not found and (select j.status = 'queued' from public.ugc_video_jobs as j where j.id = v_job_standard);
    v_checks := v_checks || jsonb_build_array(jsonb_build_object('check_name', 'sequential duplicate claim returns no second claim', 'status', case when v_valid then 'PASS' else 'FAIL' end));

    -- Service RPC can identify its live lease; a wrong token/version is fenced.
    v_valid := public.is_ugc_claim_current(v_owner_a, v_job_standard, v_claim_old_token, v_claim_old_version)
      and not public.is_ugc_claim_current(v_owner_a, v_job_standard, gen_random_uuid(), v_claim_old_version)
      and not public.is_ugc_claim_current(v_owner_a, v_job_standard, v_claim_old_token, v_claim_old_version - 1);
    v_checks := v_checks || jsonb_build_array(jsonb_build_object('check_name', 'live lease token/version fencing', 'status', case when v_valid then 'PASS' else 'FAIL' end));

    -- Direct attempts to reroute or rewrite an immutable request are rejected.
    v_expected := false;
    begin
      update public.ugc_video_jobs set provider_plan = provider_plan || jsonb_build_object('route_override', true) where id = v_job_standard;
    exception when raise_exception then
      v_expected := sqlerrm = 'UGC provider plan is immutable';
    end;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object('check_name', 'provider route is immutable after claim', 'status', case when v_expected and (select j.provider_plan = v_plan_standard from public.ugc_video_jobs as j where j.id = v_job_standard) then 'PASS' else 'FAIL' end));

    v_expected := false;
    begin
      update public.ugc_video_jobs set request_snapshot = request_snapshot || jsonb_build_object('edited_after_claim', true) where id = v_job_standard;
    exception when raise_exception then
      v_expected := sqlerrm = 'UGC generation request snapshots are immutable';
    end;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object('check_name', 'request snapshot remains immutable', 'status', case when v_expected then 'PASS' else 'FAIL' end));

    -- Record the provider task as an ambiguous accepted submission, then
    -- reconcile it without submitting a second provider request.
    v_valid := public.finish_ugc_claim(v_owner_a, v_job_standard, v_claim_old_token, v_claim_old_version,
      'provider_submission_ambiguous', 'synthetic-standard-task', 'provider_submission_ambiguous', null, 0);
    v_valid := v_valid and (select j.status = 'provider_submission_ambiguous' and j.provider_request_id = 'synthetic-standard-task'
      from public.ugc_video_jobs as j where j.id = v_job_standard);
    v_checks := v_checks || jsonb_build_array(jsonb_build_object('check_name', 'ambiguous submission task ID is recorded', 'status', case when v_valid then 'PASS' else 'FAIL' end));

    v_expected := false;
    begin
      update public.ugc_video_jobs set provider_request_id = 'synthetic-replacement-task' where id = v_job_standard;
    exception when raise_exception then
      v_expected := sqlerrm = 'UGC provider task identity is immutable';
    end;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object('check_name', 'provider task ID is immutable', 'status', case when v_expected and (select j.provider_request_id = 'synthetic-standard-task' from public.ugc_video_jobs as j where j.id = v_job_standard) then 'PASS' else 'FAIL' end));

    -- The current lease is clear after finish; make polling due and acquire a
    -- new lease. The prior token must fail, and the new token can advance state.
    update public.ugc_video_jobs set next_poll_at = clock_timestamp() - interval '1 second', lease_expires_at = clock_timestamp() - interval '1 second'
      where id = v_job_standard;
    select * into v_claim from public.claim_ugc_reconciliation(v_owner_a, v_job_standard);
    v_claim_current_token := v_claim.lease_token;
    v_claim_current_version := v_claim.lease_version;
    v_valid := found and v_claim.status = 'provider_submission_ambiguous'
      and v_claim.provider_request_id = 'synthetic-standard-task'
      and v_claim.lease_version > v_claim_old_version and v_claim.lease_token is distinct from v_claim_old_token;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object('check_name', 'ambiguous task reconciliation rotates lease', 'status', case when v_valid then 'PASS' else 'FAIL' end));

    -- Keep each mutating RPC and its observed-state SELECT in separate SQL
    -- commands: a command's snapshot cannot observe its own side effects.
    v_rpc_result := null;
    v_rpc_state := null;
    v_rpc_message := null;
    begin
      v_rpc_result := public.finish_ugc_claim(v_owner_a, v_job_standard, v_claim_old_token, v_claim_old_version,
        'processing', null, null, null, 0);
    exception when others then
      get stacked diagnostics v_rpc_state = returned_sqlstate, v_rpc_message = message_text;
    end;
    v_valid := v_rpc_result is false;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object('check_name', 'stale lease cannot advance status', 'status', case when v_valid then 'PASS' else 'FAIL' end));
    -- This separate statement observes the row after the RPC command finishes.
    v_rpc_result := null;
    v_rpc_state := null;
    v_rpc_message := null;
    begin
      v_rpc_result := public.finish_ugc_claim(v_owner_a, v_job_standard, v_claim_current_token, v_claim_current_version,
        'processing', null, null, null, 0);
    exception when others then
      get stacked diagnostics v_rpc_state = returned_sqlstate, v_rpc_message = message_text;
    end;
    select j.status, j.provider_request_id, j.lease_version
      into v_observed_status, v_observed_task, v_observed_lease_version
      from public.ugc_video_jobs as j where j.id = v_job_standard;
    v_valid := coalesce(v_rpc_result, false) and v_observed_status = 'processing'
      and v_observed_task = 'synthetic-standard-task';
    v_check_detail := format('rpc_return=%s; sqlstate=%s; message=%s; observed_status=%s; task_id=%s; lease_version=%s',
      coalesce(v_rpc_result::text, 'NULL'), coalesce(v_rpc_state, 'none'), coalesce(v_rpc_message, 'none'),
      coalesce(v_observed_status, 'NULL'), coalesce(v_observed_task, 'NULL'), coalesce(v_observed_lease_version::text, 'NULL'));
    v_checks := v_checks || jsonb_build_array(jsonb_build_object('check_name', 'ambiguous task transitions to processing',
      'status', case when v_valid then 'PASS' else 'FAIL' end, 'details', v_check_detail));

    -- Polling returns a new lease. Invalid result metadata must be rejected
    -- without changing the processing row; valid output then completes it.
    update public.ugc_video_jobs set next_poll_at = clock_timestamp() - interval '1 second', lease_expires_at = clock_timestamp() - interval '1 second'
      where id = v_job_standard;
    select * into v_claim from public.claim_ugc_reconciliation(v_owner_a, v_job_standard);
    v_claim_current_token := v_claim.lease_token;
    v_claim_current_version := v_claim.lease_version;
    v_output := jsonb_build_object('bucketId', 'ugc-generated-videos',
      'objectPath', v_owner_a::text || '/' || v_project_standard::text || '/' || v_job_standard::text || '.mp4',
      'contentType', 'video/quicktime', 'byteSize', 1000, 'durationSeconds', 15);
    v_expected := false;
    begin
      perform public.finish_ugc_claim(v_owner_a, v_job_standard, v_claim_current_token, v_claim_current_version,
        'succeeded', 'synthetic-standard-task', null, v_output, 0);
    exception when invalid_parameter_value then
      v_expected := true;
    end;
    v_expected := v_expected and (select j.status = 'processing' and j.output_bucket_id is null and j.output_object_path is null
      from public.ugc_video_jobs as j where j.id = v_job_standard);
    v_checks := v_checks || jsonb_build_array(jsonb_build_object('check_name', 'invalid MP4 metadata is rejected without mutation', 'status', case when v_expected then 'PASS' else 'FAIL' end));

    v_output := jsonb_build_object('bucketId', 'ugc-generated-videos',
      'objectPath', v_owner_a::text || '/' || v_project_standard::text || '/' || v_job_standard::text || '.mp4',
      'contentType', 'video/mp4', 'byteSize', 1000, 'durationSeconds', 15);
    -- As above, observe the asynchronous status transition in a later command.
    v_rpc_result := null;
    v_rpc_state := null;
    v_rpc_message := null;
    begin
      v_rpc_result := public.finish_ugc_claim(v_owner_a, v_job_standard, v_claim_current_token, v_claim_current_version,
        'succeeded', 'synthetic-standard-task', null, v_output, 0);
    exception when others then
      get stacked diagnostics v_rpc_state = returned_sqlstate, v_rpc_message = message_text;
    end;
    select j.status, j.output_bucket_id, j.output_object_path, j.output_content_type,
      j.output_byte_size, j.duration_seconds
      into v_observed_status, v_observed_bucket, v_observed_path, v_observed_content_type,
        v_observed_byte_size, v_observed_duration
      from public.ugc_video_jobs as j where j.id = v_job_standard;
    v_valid := coalesce(v_rpc_result, false) and v_observed_status = 'succeeded'
      and v_observed_bucket = 'ugc-generated-videos'
      and v_observed_path = v_owner_a::text || '/' || v_project_standard::text || '/' || v_job_standard::text || '.mp4'
      and v_observed_content_type = 'video/mp4' and v_observed_byte_size = 1000 and v_observed_duration = 15;
    v_check_detail := format('rpc_return=%s; sqlstate=%s; message=%s; observed_status=%s; bucket=%s; path=%s; content_type=%s; byte_size=%s; duration=%s',
      coalesce(v_rpc_result::text, 'NULL'), coalesce(v_rpc_state, 'none'), coalesce(v_rpc_message, 'none'),
      coalesce(v_observed_status, 'NULL'), coalesce(v_observed_bucket, 'NULL'), coalesce(v_observed_path, 'NULL'),
      coalesce(v_observed_content_type, 'NULL'), coalesce(v_observed_byte_size::text, 'NULL'), coalesce(v_observed_duration::text, 'NULL'));
    v_checks := v_checks || jsonb_build_array(jsonb_build_object('check_name', 'valid private MP4 result completes job',
      'status', case when v_valid then 'PASS' else 'FAIL' end, 'details', v_check_detail));

    v_expected := false;
    begin
      update public.ugc_video_jobs set output_object_path = 'wrong-owner/wrong-project/fake.mp4' where id = v_job_standard;
    exception when raise_exception then
      v_expected := sqlerrm = 'Terminal UGC output is immutable';
    end;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object('check_name', 'terminal output metadata is immutable', 'status', case when v_expected and (select j.output_object_path = v_owner_a::text || '/' || v_project_standard::text || '/' || v_job_standard::text || '.mp4' from public.ugc_video_jobs as j where j.id = v_job_standard) then 'PASS' else 'FAIL' end));

    -- Exercise the Premium claim's accepted-task ambiguity and asynchronous
    -- polling transition, independently from the Standard route.
    select * into v_claim from public.claim_ugc_submission(v_owner_a, v_job_premium, v_hash_premium, v_plan_premium);
    v_valid := found and v_claim.provider_plan = v_plan_premium and v_claim.status = 'queued';
    v_claim_old_token := v_claim.lease_token;
    v_claim_old_version := v_claim.lease_version;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object('check_name', 'Premium Kling 3.0 Pro submission claim', 'status', case when v_valid then 'PASS' else 'FAIL' end));
    v_premium_ambiguous_result := null;
    v_premium_ambiguous_state := null;
    v_premium_ambiguous_message := null;
    begin
      v_premium_ambiguous_result := public.finish_ugc_claim(v_owner_a, v_job_premium, v_claim_old_token, v_claim_old_version,
        'provider_submission_ambiguous', 'synthetic-premium-task', 'provider_submission_ambiguous', null, 0);
    exception when others then
      get stacked diagnostics v_premium_ambiguous_state = returned_sqlstate, v_premium_ambiguous_message = message_text;
    end;
    v_valid := v_valid and coalesce(v_premium_ambiguous_result, false);
    update public.ugc_video_jobs set next_poll_at = clock_timestamp() - interval '1 second', lease_expires_at = clock_timestamp() - interval '1 second'
      where id = v_job_premium;
    select * into v_claim from public.claim_ugc_reconciliation(v_owner_a, v_job_premium);
    v_valid := v_valid and found and v_claim.provider_request_id = 'synthetic-premium-task'
      and v_claim.provider_plan = v_plan_premium and v_claim.reconciliation_attempts = 1;
    v_claim_current_token := v_claim.lease_token;
    v_claim_current_version := v_claim.lease_version;
    v_rpc_result := null;
    v_rpc_state := null;
    v_rpc_message := null;
    begin
      v_rpc_result := public.finish_ugc_claim(v_owner_a, v_job_premium, v_claim_current_token, v_claim_current_version,
        'processing', null, null, null, 0);
    exception when others then
      get stacked diagnostics v_rpc_state = returned_sqlstate, v_rpc_message = message_text;
    end;
    select j.status, j.provider_request_id, j.lease_version
      into v_observed_status, v_observed_task, v_observed_lease_version
      from public.ugc_video_jobs as j where j.id = v_job_premium;
    v_valid := v_valid and coalesce(v_rpc_result, false) and v_observed_status = 'processing'
      and v_observed_task = 'synthetic-premium-task';
    v_check_detail := format('ambiguous_finish_return=%s; ambiguous_sqlstate=%s; ambiguous_message=%s; reconcile_claim_status=%s; reconcile_claim_version=%s; attempts=%s; processing_finish_return=%s; processing_sqlstate=%s; processing_message=%s; observed_status=%s; task_id=%s; lease_version=%s',
      coalesce(v_premium_ambiguous_result::text, 'NULL'), coalesce(v_premium_ambiguous_state, 'none'), coalesce(v_premium_ambiguous_message, 'none'),
      coalesce(v_claim.status, 'NULL'), coalesce(v_claim.lease_version::text, 'NULL'), coalesce(v_claim.reconciliation_attempts::text, 'NULL'),
      coalesce(v_rpc_result::text, 'NULL'), coalesce(v_rpc_state, 'none'), coalesce(v_rpc_message, 'none'),
      coalesce(v_observed_status, 'NULL'), coalesce(v_observed_task, 'NULL'), coalesce(v_observed_lease_version::text, 'NULL'));
    v_checks := v_checks || jsonb_build_array(jsonb_build_object('check_name', 'Premium ambiguous task reconciles through polling',
      'status', case when v_valid then 'PASS' else 'FAIL' end, 'details', v_check_detail));

    -- Expire a claim before any task ID was recorded. Reconciliation can own
    -- and mark it ambiguous, but neither submission nor polling can retry it.
    select * into v_claim from public.claim_ugc_submission(v_owner_a, v_job_no_task, v_hash_standard, v_plan_standard);
    v_claim_no_task_token := v_claim.lease_token;
    v_claim_no_task_version := v_claim.lease_version;
    update public.ugc_video_jobs set next_poll_at = clock_timestamp() - interval '1 second', lease_expires_at = clock_timestamp() - interval '1 second'
      where id = v_job_no_task;
    v_valid := not public.is_ugc_claim_current(v_owner_a, v_job_no_task, v_claim_no_task_token, v_claim_no_task_version);
    select * into v_claim from public.claim_ugc_reconciliation(v_owner_a, v_job_no_task);
    v_valid := v_valid and found and v_claim.lease_version > v_claim_no_task_version
      and v_claim.lease_token is distinct from v_claim_no_task_token;
    v_valid := v_valid and public.finish_ugc_claim(v_owner_a, v_job_no_task, v_claim.lease_token, v_claim.lease_version,
      'provider_submission_ambiguous', null, 'provider_submission_ambiguous', null, 0);
    v_checks := v_checks || jsonb_build_array(jsonb_build_object('check_name', 'expired no-task lease becomes ambiguous and is fenced', 'status', case when v_valid then 'PASS' else 'FAIL' end));

    select * into v_claim from public.claim_ugc_submission(v_owner_a, v_job_no_task, v_hash_standard, v_plan_standard);
    v_valid := not found;
    select * into v_claim from public.claim_ugc_reconciliation(v_owner_a, v_job_no_task);
    v_valid := v_valid and not found and (select j.status = 'provider_submission_ambiguous' and j.provider_request_id is null from public.ugc_video_jobs as j where j.id = v_job_no_task);
    v_checks := v_checks || jsonb_build_array(jsonb_build_object('check_name', 'ambiguous submission without task cannot be resubmitted', 'status', case when v_valid then 'PASS' else 'FAIL' end));

    -- A second connection is required to hold one row lock while another
    -- contender calls SKIP LOCKED. Sequential duplicate protection is above.
    v_checks := v_checks || jsonb_build_array(jsonb_build_object('check_name', 'genuine two-session concurrent claim race', 'status', 'NOT PROVEN'));

    -- Run real queries as authenticated with synthetic JWT claims. Verify row
    -- visibility and attempted ownership/RPC/job-write violations.
    execute 'reset role';
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub', v_owner_a::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_owner_a::text, 'role', 'authenticated')::text, true);
    select count(*) filter (where id in (v_project_standard, v_project_premium, v_project_no_task)),
      count(*) filter (where id = v_project_other)
      into v_own_projects, v_foreign_projects
      from public.ugc_projects where id in (v_project_standard, v_project_premium, v_project_no_task, v_project_other);
    select count(*) filter (where id in (v_job_standard, v_job_premium, v_job_no_task)),
      count(*) filter (where id = v_job_other)
      into v_own_jobs, v_foreign_jobs
      from public.ugc_video_jobs where id in (v_job_standard, v_job_premium, v_job_no_task, v_job_other);
    v_valid := v_own_projects = 3 and v_foreign_projects = 0 and v_own_jobs = 3 and v_foreign_jobs = 0;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object('check_name', 'authenticated RLS owner isolation', 'status', case when v_valid then 'PASS' else 'FAIL' end));

    v_expected := false;
    begin
      insert into public.ugc_projects (owner_id, title, creator_concept, configuration)
      values (v_owner_b, 'Synthetic forbidden cross-owner insert',
        '{"selection_id":"ada","reference_type":"placeholder_visual"}'::jsonb,
        '{"format":"testimonial","script":"denied","settings":{"language":"en","tone":"natural","voice":"warm","environment":"home","lighting":"daylight","framing":"medium","duration":"15","aspectRatio":"9:16","subtitles":false}}'::jsonb);
    exception when insufficient_privilege then
      v_expected := true;
    end;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object('check_name', 'authenticated cannot create another owner project', 'status', case when v_expected then 'PASS' else 'FAIL' end));

    v_expected := false;
    begin
      perform 1 from public.claim_ugc_submission(v_owner_a, v_job_no_task, v_hash_standard, v_plan_standard);
    exception when insufficient_privilege then
      v_expected := true;
    end;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object('check_name', 'authenticated cannot execute submission RPC', 'status', case when v_expected then 'PASS' else 'FAIL' end));

    v_expected := false;
    begin
      update public.ugc_video_jobs set error_code = 'invalid_input' where id = v_job_no_task;
    exception when insufficient_privilege then
      v_expected := true;
    end;
    v_checks := v_checks || jsonb_build_array(jsonb_build_object('check_name', 'authenticated cannot directly update jobs', 'status', case when v_expected then 'PASS' else 'FAIL' end));

    execute 'reset role';
    v_valid := has_function_privilege('service_role', 'public.claim_ugc_submission(uuid,uuid,text,jsonb)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.claim_ugc_submission(uuid,uuid,text,jsonb)', 'EXECUTE')
      and has_function_privilege('service_role', 'public.finish_ugc_claim(uuid,uuid,uuid,bigint,text,text,text,jsonb,integer)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.finish_ugc_claim(uuid,uuid,uuid,bigint,text,text,text,jsonb,integer)', 'EXECUTE')
      and has_column_privilege('authenticated', 'public.ugc_video_jobs', 'status', 'SELECT')
      and not has_column_privilege('authenticated', 'public.ugc_video_jobs', 'request_snapshot', 'SELECT')
      and not has_table_privilege('authenticated', 'public.ugc_video_jobs', 'UPDATE');
    v_checks := v_checks || jsonb_build_array(jsonb_build_object('check_name', 'RPC and table privilege boundaries', 'status', case when v_valid then 'PASS' else 'FAIL' end));

    -- Deliberately abort this savepoint. PL/pgSQL retains v_checks while every
    -- synthetic auth/project/job mutation is rolled back to this block start.
    raise exception using errcode = 'ZX001', message = 'intentional rollback of synthetic UGC behavioral fixtures';
  exception
    when sqlstate 'ZX001' then
      v_rolled_back := true;
    when others then
      -- PostgreSQL has rolled this block's writes back to its implicit
      -- subtransaction savepoint. Later assertions are deliberately marked
      -- NOT RUN rather than being omitted or treated as successful.
      v_rolled_back := true;
      v_fixture_error := sqlstate || ': ' || sqlerrm;
      v_checks := v_checks || jsonb_build_array(jsonb_build_object(
        'check_name', 'behavioral test harness completed', 'status', 'FAIL'
      ));
      v_checks := v_checks || jsonb_build_array(jsonb_build_object(
        'check_name', 'assertions after unhandled SQL error', 'status', 'NOT RUN'
      ));
  end;

  v_valid := v_rolled_back
    and not exists (select 1 from auth.users where id in (v_owner_a, v_owner_b))
    and not exists (select 1 from public.ugc_projects where id in (v_project_standard, v_project_premium, v_project_no_task, v_project_other))
    and not exists (select 1 from public.ugc_video_jobs where id in (v_job_standard, v_job_premium, v_job_no_task, v_job_other));
  v_checks := v_checks || jsonb_build_array(jsonb_build_object('check_name', 'synthetic fixture transaction rolled back', 'status', case when v_valid then 'PASS' else 'FAIL' end));
  if v_fixture_error is not null then
    v_checks := v_checks || jsonb_build_array(jsonb_build_object('check_name', 'harness error detail: ' || v_fixture_error, 'status', 'FAIL'));
  end if;

  return query
    select c.check_name, c.status, c.details
    from jsonb_to_recordset(v_checks) as c(check_name text, status text, details text);
end;
$$;

select check_name, result_status as status, details
from pg_temp.run_ugc_pipeline_behavioral_test()
order by check_name;

rollback;
