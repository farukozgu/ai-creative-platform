-- Phase 7F.7: repair the shared trigger's table-specific NEW field access.
-- Additive correction to 20261031030000; F-07 is a separate repair.
-- Prepared only. Apply through the reviewed, isolated staging migration flow.
-- The migration runner must execute this file transactionally.
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

DO $check_dependencies$
DECLARE
  guard_oid oid := pg_catalog.to_regprocedure('public.enforce_model_candidate_ownership()');
  expected_triggers integer;
  attached_triggers integer;
BEGIN
  IF guard_oid IS NULL THEN
    RAISE EXCEPTION 'Candidate ownership guard is missing; refusing a partial-schema repair';
  END IF;
  IF (SELECT p.prosecdef FROM pg_catalog.pg_proc AS p WHERE p.oid = guard_oid) THEN
    RAISE EXCEPTION 'Candidate ownership guard unexpectedly uses SECURITY DEFINER; review schema drift';
  END IF;

  SELECT count(*) INTO attached_triggers
  FROM pg_catalog.pg_trigger AS t
  WHERE t.tgfoid = guard_oid AND NOT t.tgisinternal;

  -- tgtype 23 = ROW (1) + BEFORE (2) + INSERT (4) + UPDATE (16).
  SELECT count(*) INTO expected_triggers
  FROM pg_catalog.pg_trigger AS t
  WHERE t.tgfoid = guard_oid AND NOT t.tgisinternal
    AND t.tgtype = 23 AND t.tgnargs = 0 AND t.tgenabled IN ('O', 'A')
    AND (
      (t.tgrelid = 'public.model_candidate_jobs'::pg_catalog.regclass
        AND t.tgname = 'model_candidate_jobs_owner_guard')
      OR
      (t.tgrelid = 'public.model_candidates'::pg_catalog.regclass
        AND t.tgname = 'model_candidates_owner_guard')
    );

  IF attached_triggers <> 2 OR expected_triggers <> 2 THEN
    RAISE EXCEPTION 'Unexpected candidate ownership trigger attachments; expected exactly two enabled BEFORE ROW INSERT/UPDATE guards';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.model_candidate_jobs AS j
    LEFT JOIN public.model_profiles AS p ON p.id = j.model_id AND p.user_id = j.user_id
    WHERE p.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.model_candidates AS c
    LEFT JOIN public.model_profiles AS p ON p.id = c.model_id AND p.user_id = c.user_id
    LEFT JOIN public.model_candidate_jobs AS j
      ON j.id = c.job_id AND j.model_id = c.model_id AND j.user_id = c.user_id
    WHERE p.id IS NULL OR j.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Existing candidate ownership inconsistency requires a separate data review';
  END IF;
END;
$check_dependencies$;

CREATE OR REPLACE FUNCTION public.enforce_model_candidate_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  -- Reject unsupported contexts before dereferencing either OLD or NEW.
  IF TG_TABLE_SCHEMA <> 'public' OR TG_LEVEL <> 'ROW' OR TG_WHEN <> 'BEFORE'
     OR TG_OP NOT IN ('INSERT', 'UPDATE') OR TG_NARGS <> 0 THEN
    RAISE EXCEPTION 'Unsupported candidate ownership trigger context';
  END IF;

  IF TG_TABLE_NAME = 'model_candidate_jobs' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.model_profiles AS p
      WHERE p.id = NEW.model_id AND p.user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'Model ownership mismatch';
    END IF;

  ELSIF TG_TABLE_NAME = 'model_candidates' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.model_profiles AS p
      WHERE p.id = NEW.model_id AND p.user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'Model ownership mismatch';
    END IF;

    -- NEW.job_id exists only in this branch. A compound SQL AND expression
    -- cannot guard field resolution for a different NEW record shape.
    IF NOT EXISTS (
      SELECT 1 FROM public.model_candidate_jobs AS j
      WHERE j.id = NEW.job_id
        AND j.model_id = NEW.model_id
        AND j.user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'Candidate job ownership mismatch';
    END IF;

  ELSE
    RAISE EXCEPTION 'Unsupported candidate ownership trigger table: %.%', TG_TABLE_SCHEMA, TG_TABLE_NAME;
  END IF;

  RETURN NEW;
END;
$function$;

-- CREATE OR REPLACE retains the existing function owner, ACL, and trigger
-- dependencies. No policies, table grants, approval RPCs, or F-07 code change.
