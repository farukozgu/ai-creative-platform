\set ON_ERROR_STOP on
\pset pager off
\pset tuples_only on
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

DO $storage_policy_assertions$
BEGIN
  IF NOT (SELECT count(*) = 5 AND bool_and(public = false) FROM storage.buckets
    WHERE id IN ('product-assets','generated-assets','model-reference-assets','video-source-images','generated-videos')) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: expected five configured private buckets';
  END IF;
  RAISE NOTICE 'PASS: all five configured storage buckets are private';

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'storage.objects'::regclass) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: storage.objects RLS is disabled';
  END IF;
  RAISE NOTICE 'PASS: storage.objects RLS is enabled';

  IF NOT (SELECT count(*) = 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
    AND policyname='Authenticated users can upload product assets to owned projects'
    AND cmd='INSERT' AND roles @> ARRAY['authenticated']::name[]
    AND position('auth.uid' in coalesce(with_check,'')) > 0
    AND position('foldername' in coalesce(with_check,'')) > 0) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: product upload policy missing owner/path scope';
  END IF;
  RAISE NOTICE 'PASS: product upload policy scopes authenticated owner and path';

  IF NOT (SELECT count(*) = 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
    AND policyname='Authenticated users can read their own product assets'
    AND cmd='SELECT' AND roles @> ARRAY['authenticated']::name[]
    AND position('owner_id' in coalesce(qual,'')) > 0
    AND position('auth.uid' in coalesce(qual,'')) > 0) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: product read policy missing object-owner scope';
  END IF;
  RAISE NOTICE 'PASS: product read policy checks Storage object ownership';

  IF NOT (SELECT count(*) = 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
    AND policyname='Authenticated users can read generated assets for their own projects'
    AND cmd='SELECT' AND position('projects' in coalesce(qual,'')) > 0
    AND position('auth.uid' in coalesce(qual,'')) > 0) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: generated read policy missing owned-project scope';
  END IF;
  RAISE NOTICE 'PASS: generated asset read policy is tied to owned project';

  IF NOT (SELECT count(*) = 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
    AND policyname='Owners read model reference objects' AND cmd='SELECT'
    AND position('model_reference_assets' in coalesce(qual,'')) > 0
    AND position('auth.uid' in coalesce(qual,'')) > 0) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: model reference read policy missing ownership join';
  END IF;
  RAISE NOTICE 'PASS: model reference read policy requires owned reference metadata';

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
    AND cmd='INSERT' AND position('model-reference-assets' in coalesce(with_check,'')) > 0
    AND roles @> ARRAY['authenticated']::name[]) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: authenticated model-reference upload policy unexpectedly exists';
  END IF;
  RAISE NOTICE 'PASS: authenticated role has no model-reference upload policy';

  IF NOT (SELECT count(*) = 2 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
    AND policyname IN ('Users can read their registered video source images','Users can read their generated videos')
    AND cmd='SELECT' AND position('auth.uid' in coalesce(qual,'')) > 0) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: video object read policy owner checks missing';
  END IF;
  RAISE NOTICE 'PASS: video object read policies are owner-scoped';
END;
$storage_policy_assertions$;

ROLLBACK;
