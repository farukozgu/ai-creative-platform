# UGC submission claim: two-session concurrency test

Run only against the disposable Supabase test project where the UGC Foundation
and Pipeline migrations are installed. This uses `psql`'s interactive variables
and two persistent database connections; it does not work as one SQL Editor
execution. Use the disposable project's direct PostgreSQL connection as its
`postgres` database role. Do not use a production connection string.

The test creates one synthetic auth user, project and Standard Kling 3.0 draft.
Session A claims the draft and holds its row lock in an open transaction. While
that transaction remains open, Session B attempts the same claim. The claim RPC
uses `FOR UPDATE SKIP LOCKED`, so B must return no row. There are no provider
calls.

## Setup — Session A

Open a persistent `psql` session (Terminal A) and run this setup. Keep the
session open; `owner_id`, `project_id`, `job_id` and `request_hash` are psql
variables used in later sections.

```sql
\set ON_ERROR_STOP on
SELECT pg_backend_pid() AS session_a_pid;
SELECT gen_random_uuid()::text AS owner_id,
       gen_random_uuid()::text AS project_id,
       gen_random_uuid()::text AS job_id,
       gen_random_uuid()::text AS idempotency_key \gset

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ugc_race_canonical_json(p_value jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_result text;
BEGIN
  CASE jsonb_typeof(p_value)
    WHEN 'object' THEN
      SELECT '{' || coalesce(string_agg(
        to_json(e.key)::text || ':' || pg_temp.ugc_race_canonical_json(e.value),
        ',' ORDER BY e.key COLLATE "C"
      ), '') || '}'
      INTO v_result
      FROM jsonb_each(p_value) AS e(key, value);
      RETURN v_result;
    WHEN 'array' THEN
      SELECT '[' || coalesce(string_agg(
        pg_temp.ugc_race_canonical_json(e.value), ',' ORDER BY e.ordinality
      ), '') || ']'
      INTO v_result
      FROM jsonb_array_elements(p_value) WITH ORDINALITY AS e(value, ordinality);
      RETURN v_result;
    ELSE
      RETURN p_value::text;
  END CASE;
END;
$$;

SELECT jsonb_build_object(
  'model', jsonb_build_object(
    'tier', 'standard', 'provider', 'fal',
    'endpointId', 'fal-ai/kling-video/v3/standard/image-to-video', 'version', 1
  ),
  'creatorConcept', jsonb_build_object('selectionId', 'ada', 'referenceType', 'placeholder_visual'),
  'format', 'testimonial', 'script', 'Synthetic two-session claim test',
  'spokenDialogue', '', 'sceneDirection', 'Neutral indoor setting',
  'settings', jsonb_build_object(
    'language', 'en', 'tone', 'natural', 'voice', 'warm',
    'environment', 'home', 'lighting', 'daylight', 'framing', 'medium',
    'duration', '15', 'aspectRatio', '9:16', 'subtitles', false
  )
)::text AS request_snapshot \gset

SELECT encode(extensions.digest(
  convert_to(pg_temp.ugc_race_canonical_json(:'request_snapshot'::jsonb), 'UTF8'), 'sha256'
), 'hex') AS request_hash \gset

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  :'owner_id'::uuid, 'authenticated', 'authenticated',
  :'owner_id' || '@ugc-race.invalid', '', clock_timestamp(),
  '{}'::jsonb, '{}'::jsonb, clock_timestamp(), clock_timestamp()
);

INSERT INTO public.ugc_projects (id, owner_id, title, creator_concept, configuration)
VALUES (
  :'project_id'::uuid, :'owner_id'::uuid, 'Synthetic UGC race test',
  '{"selection_id":"ada","reference_type":"placeholder_visual"}'::jsonb,
  '{"format":"testimonial","script":"Synthetic two-session claim test","settings":{"language":"en","tone":"natural","voice":"warm","environment":"home","lighting":"daylight","framing":"medium","duration":"15","aspectRatio":"9:16","subtitles":false}}'::jsonb
);

INSERT INTO public.ugc_video_jobs (
  id, project_id, owner_id, idempotency_key, request_hash, request_snapshot
) VALUES (
  :'job_id'::uuid, :'project_id'::uuid, :'owner_id'::uuid,
  :'idempotency_key'::uuid, :'request_hash', :'request_snapshot'::jsonb
);

COMMIT;

\echo Copy these values into Session B: owner_id=:owner_id job_id=:job_id request_hash=:request_hash
```

## Session A — first claim (leave transaction open)

Run this in Terminal A. Confirm it returns exactly one row, then **leave the
transaction open** while running Session B.

```sql
BEGIN ISOLATION LEVEL READ COMMITTED;

SELECT id, status, provider, provider_plan->>'modelId' AS model_id,
       lease_version, lease_token IS NOT NULL AS has_lease
FROM public.claim_ugc_submission(
  :'owner_id'::uuid,
  :'job_id'::uuid,
  :'request_hash',
  jsonb_build_object(
    'version', 4,
    'snapshotDigest', :'request_hash',
    'provider', 'fal',
    'modelId', 'kling-v3-standard-image',
    'endpointId', 'fal-ai/kling-video/v3/standard/image-to-video',
    'durationSeconds', 15,
    'aspectRatio', '9:16',
    'resolution', '720p',
    'generateAudio', false,
    'model', '{"tier":"standard","provider":"fal","endpointId":"fal-ai/kling-video/v3/standard/image-to-video","version":1}'::jsonb
  )
);
```

The expected row has `status = queued`, `provider = fal`, the Standard Kling 3.0
model ID, `lease_version = 1`, and `has_lease = true`. Do not commit Session A
yet; its transaction holds the job row lock.

## Session B — overlapping claim

Open a second persistent `psql` session (Terminal B). First set the three values
copied from Setup. Confirm its backend PID differs from Session A's PID. Run
this while Session A's transaction is still open.

```sql
\set ON_ERROR_STOP on
\set owner_id PASTE_OWNER_ID
\set job_id PASTE_JOB_ID
\set request_hash PASTE_REQUEST_HASH

SELECT pg_backend_pid() AS session_b_pid;
BEGIN ISOLATION LEVEL READ COMMITTED;

SELECT count(*) AS claims_returned
FROM public.claim_ugc_submission(
  :'owner_id'::uuid,
  :'job_id'::uuid,
  :'request_hash',
  jsonb_build_object(
    'version', 4,
    'snapshotDigest', :'request_hash',
    'provider', 'fal',
    'modelId', 'kling-v3-standard-image',
    'endpointId', 'fal-ai/kling-video/v3/standard/image-to-video',
    'durationSeconds', 15,
    'aspectRatio', '9:16',
    'resolution', '720p',
    'generateAudio', false,
    'model', '{"tier":"standard","provider":"fal","endpointId":"fal-ai/kling-video/v3/standard/image-to-video","version":1}'::jsonb
  )
);

COMMIT;
```

`claims_returned` must be `0`. The aggregate produces one display row with zero;
the RPC itself returned no claim rows.

## Finish Session A and inspect the winner

Back in Terminal A, commit the first claim, then inspect the persisted job in a
new command.

```sql
COMMIT;

SELECT status, provider, provider_plan->>'modelId' AS model_id,
       lease_version, lease_token IS NOT NULL AS has_lease,
       provider_request_id
FROM public.ugc_video_jobs
WHERE id = :'job_id'::uuid AND owner_id = :'owner_id'::uuid;
```

Expected final row: exactly one job, still `queued`, Standard Kling 3.0 route,
`lease_version = 1`, a non-null lease token, and null `provider_request_id`.
No provider submission is made by this RPC test.

## Cleanup — Session A

Run only after Session B committed and Session A committed or rolled back. The
delete cascades are also backed by explicit child deletes. The final query must
return `no_fixture_rows = true`.

```sql
BEGIN;
DELETE FROM public.ugc_video_jobs WHERE id = :'job_id'::uuid;
DELETE FROM public.ugc_projects WHERE id = :'project_id'::uuid AND owner_id = :'owner_id'::uuid;
DELETE FROM auth.users WHERE id = :'owner_id'::uuid;
COMMIT;

SELECT
  NOT EXISTS (SELECT 1 FROM auth.users WHERE id = :'owner_id'::uuid)
  AND NOT EXISTS (SELECT 1 FROM public.ugc_projects WHERE id = :'project_id'::uuid)
  AND NOT EXISTS (SELECT 1 FROM public.ugc_video_jobs WHERE id = :'job_id'::uuid)
  AS no_fixture_rows;
```

If either session errors before completing, issue `ROLLBACK` in any open
transaction first, then run Cleanup. If cleanup reports `false`, repeat the
three deletes in a new transaction and investigate before ending the test.

## Success criteria and limitations

- Session A and B show different `pg_backend_pid()` values.
- A returns exactly one claimed row; B returns zero claims while A still holds
  its uncommitted claim transaction.
- After A commits, the job remains queued with one provider route and one lease
  version; no task ID or generated output is created.
- Cleanup returns `no_fixture_rows = true`.

This proves the same-job claim race for two overlapping PostgreSQL sessions.
It does not prove concurrent arbitration for different draft jobs in the same
project, external provider idempotency, or any video generation behavior.
