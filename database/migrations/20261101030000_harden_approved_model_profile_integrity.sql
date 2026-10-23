-- Phase 7F.10. PREPARED ONLY; apply transactionally after isolated staging review.
-- No existing profile/version data is rewritten. Incompatible data aborts review.
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

-- Prevent changes between the read-only compatibility audit and trigger replacement.
LOCK TABLE public.model_profiles, public.model_identity_versions,
  public.model_candidates, public.model_candidate_jobs,
  public.model_reference_assets, public.model_identity_version_references
  IN SHARE ROW EXCLUSIVE MODE;

DO $compatibility$
DECLARE incompatible bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE oid='public.enforce_model_profile_transition()'::pg_catalog.regprocedure
    AND pg_catalog.pg_get_userbyid(proowner)=current_user)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE oid='public.approve_model_candidate(uuid,uuid)'::pg_catalog.regprocedure
    AND pg_catalog.pg_get_userbyid(proowner)=current_user AND prosecdef) THEN
    RAISE EXCEPTION 'F07: migration must run as the existing guard and approval function owner';
  END IF;
  IF pg_catalog.has_function_privilege('authenticated','public.approve_model_candidate(uuid,uuid)','EXECUTE')
    OR pg_catalog.has_function_privilege('anon','public.approve_model_candidate(uuid,uuid)','EXECUTE')
    OR NOT pg_catalog.has_function_privilege('service_role','public.approve_model_candidate(uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'F07: approval function access has drifted; review grants separately';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgfoid='public.enforce_model_profile_transition()'::pg_catalog.regprocedure AND NOT tgisinternal) <> 1
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.model_profiles'::pg_catalog.regclass
      AND tgname='model_profiles_enforce_transition' AND tgtype=19 AND tgenabled IN ('O','A')
      AND tgfoid='public.enforce_model_profile_transition()'::pg_catalog.regprocedure AND tgnargs=0) THEN
    RAISE EXCEPTION 'F07: unexpected profile transition trigger attachment';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.model_identity_versions'::pg_catalog.regclass
    AND tgname='model_identity_versions_immutable' AND tgtype=27 AND tgenabled IN ('O','A')
    AND tgfoid='public.prevent_model_version_mutation()'::pg_catalog.regprocedure) THEN
    RAISE EXCEPTION 'F07: immutable identity version guard has drifted';
  END IF;
  IF EXISTS(SELECT 1 FROM public.model_identity_versions v LEFT JOIN public.model_profiles p
    ON p.id=v.model_id AND p.user_id=v.user_id WHERE p.id IS NULL) THEN
    RAISE EXCEPTION 'F07: existing identity versions require an owner/model data review';
  END IF;

  SELECT count(*) INTO incompatible FROM public.model_profiles AS p
  WHERE p.status NOT IN ('draft','archived','approved')
    OR (p.status <> 'approved' AND (p.current_identity_version_id IS NOT NULL OR p.approved_candidate_id IS NOT NULL))
    OR (p.status='approved' AND NOT EXISTS (
      SELECT 1 FROM public.model_identity_versions AS v
      JOIN public.model_candidates AS c ON c.id=p.approved_candidate_id
        AND c.model_id=p.id AND c.user_id=p.user_id AND c.status='ready'
      JOIN public.model_candidate_jobs AS j ON j.id=c.job_id AND j.model_id=p.id AND j.user_id=p.user_id
        AND j.status='succeeded' AND j.submission_state='persisted'
      JOIN public.model_reference_assets AS a ON a.id=c.primary_reference_asset_id
        AND a.model_id=p.id AND a.user_id=p.user_id AND a.source='candidate_generated'
      JOIN public.model_identity_version_references AS r ON r.identity_version_id=v.id
        AND r.reference_asset_id=a.id AND r.view='front'
      WHERE v.id=p.current_identity_version_id AND v.model_id=p.id AND v.user_id=p.user_id
    ));
  IF incompatible <> 0 THEN
    RAISE EXCEPTION 'F07: % existing profiles require an explicit data compatibility review; no data was rewritten', incompatible;
  END IF;
END;
$compatibility$;

-- A GUC is user-settable. This table instead requires privileges available only
-- to the function owner. Rows are created/deleted inside the approval statement.
CREATE SCHEMA klay_model_security;
REVOKE ALL ON SCHEMA klay_model_security FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE klay_model_security.approval_context (
  backend_pid integer NOT NULL,
  transaction_id bigint NOT NULL,
  model_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  candidate_id uuid NOT NULL,
  version_id uuid NULL,
  PRIMARY KEY (backend_pid, transaction_id, model_id)
);
ALTER TABLE klay_model_security.approval_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE klay_model_security.approval_context FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_model_profile_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $guard$
DECLARE
  approval klay_model_security.approval_context%ROWTYPE;
  trusted_approval boolean := false;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME <> 'model_profiles'
    OR TG_WHEN <> 'BEFORE' OR TG_LEVEL <> 'ROW' OR TG_OP NOT IN ('INSERT','UPDATE') OR TG_NARGS <> 0 THEN
    RAISE EXCEPTION 'F07: unsupported profile trigger context';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'draft' OR NEW.current_identity_version_id IS NOT NULL OR NEW.approved_candidate_id IS NOT NULL THEN
      RAISE EXCEPTION 'F07: new profiles must be drafts without approval pointers';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'F07: profile identity and owner are immutable';
  END IF;
  IF NEW.status IS NULL OR NEW.status NOT IN ('draft','archived','approved') THEN
    RAISE EXCEPTION 'F07: unsupported model status';
  END IF;
  SELECT * INTO approval FROM klay_model_security.approval_context AS a
  WHERE a.backend_pid=pg_catalog.pg_backend_pid() AND a.transaction_id=pg_catalog.txid_current()
    AND a.model_id=NEW.id AND a.owner_id=NEW.user_id AND a.candidate_id=NEW.approved_candidate_id;
  trusted_approval := coalesce(FOUND,false);

  IF NEW.current_identity_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.model_identity_versions AS v WHERE v.id=NEW.current_identity_version_id
      AND v.model_id=NEW.id AND v.user_id=NEW.user_id
  ) THEN RAISE EXCEPTION 'F07: identity version must belong to this model and owner'; END IF;
  IF NEW.approved_candidate_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.model_candidates AS c WHERE c.id=NEW.approved_candidate_id
      AND c.model_id=NEW.id AND c.user_id=NEW.user_id
  ) THEN RAISE EXCEPTION 'F07: approved candidate must belong to this model and owner'; END IF;

  IF OLD.status='approved' AND NEW.status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'F07: approved status is immutable';
  END IF;
  IF OLD.status='archived' AND NEW.status IS DISTINCT FROM 'archived' THEN
    RAISE EXCEPTION 'F07: archived profiles cannot be restored';
  END IF;

  IF OLD.status='approved' THEN
    IF NEW.current_identity_version_id IS DISTINCT FROM OLD.current_identity_version_id
      OR NEW.approved_candidate_id IS DISTINCT FROM OLD.approved_candidate_id
      OR NEW.appearance IS DISTINCT FROM OLD.appearance THEN
      -- The only permitted change is the RPC's first pointer installation,
      -- after it has inserted the immutable version and its reference evidence.
      IF trusted_approval IS DISTINCT FROM true OR OLD.current_identity_version_id IS NOT NULL
        OR approval.version_id IS NULL OR NEW.current_identity_version_id IS DISTINCT FROM approval.version_id
        OR NEW.approved_candidate_id IS DISTINCT FROM OLD.approved_candidate_id
        OR NEW.appearance IS DISTINCT FROM OLD.appearance THEN
        RAISE EXCEPTION 'F07: approved identity is immutable';
      END IF;
    END IF;
  ELSIF NEW.status='approved' THEN
    IF trusted_approval IS DISTINCT FROM true OR NEW.current_identity_version_id IS NOT NULL
      OR approval.version_id IS NOT NULL OR OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'F07: approval requires protected RPC context';
    END IF;
  ELSIF NEW.current_identity_version_id IS NOT NULL OR NEW.approved_candidate_id IS NOT NULL THEN
    RAISE EXCEPTION 'F07: non-approved profiles cannot carry approval pointers';
  END IF;

  IF NEW.status='approved' THEN
    IF NEW.approved_candidate_id IS NULL THEN RAISE EXCEPTION 'F07: approved candidate is required'; END IF;
    IF NEW.current_identity_version_id IS NULL THEN
      IF trusted_approval IS DISTINCT FROM true OR approval.version_id IS NOT NULL THEN
        RAISE EXCEPTION 'F07: approved identity version is required';
      END IF;
    ELSIF NOT EXISTS (
      SELECT 1 FROM public.model_identity_version_references AS r
      JOIN public.model_candidates AS c ON c.id=NEW.approved_candidate_id
      WHERE r.identity_version_id=NEW.current_identity_version_id AND r.reference_asset_id=c.primary_reference_asset_id AND r.view='front'
    ) THEN RAISE EXCEPTION 'F07: identity version must retain approved candidate evidence'; END IF;
  END IF;
  RETURN NEW;
END;
$guard$;

CREATE OR REPLACE TRIGGER model_profiles_enforce_transition
BEFORE INSERT OR UPDATE ON public.model_profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_model_profile_transition();

CREATE OR REPLACE FUNCTION public.approve_model_candidate(p_candidate_id uuid,p_owner_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $approve$
DECLARE
  c public.model_candidates%ROWTYPE;
  p public.model_profiles%ROWTYPE;
  v uuid;
  n integer;
BEGIN
  SELECT * INTO c FROM public.model_candidates WHERE id=p_candidate_id AND user_id=p_owner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Candidate not found'; END IF;
  SELECT * INTO p FROM public.model_profiles WHERE id=c.model_id AND user_id=p_owner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Candidate model not found'; END IF;
  IF p.current_identity_version_id IS NOT NULL THEN
    IF p.status='approved' AND p.approved_candidate_id=c.id AND EXISTS (
      SELECT 1 FROM public.model_identity_versions AS iv WHERE iv.id=p.current_identity_version_id
        AND iv.model_id=p.id AND iv.user_id=p_owner_id
    ) THEN RETURN p.current_identity_version_id; END IF;
    RAISE EXCEPTION 'Another candidate is already approved';
  END IF;
  IF p.status <> 'draft' THEN RAISE EXCEPTION 'Model is not eligible for approval'; END IF;
  IF c.status <> 'ready' OR c.primary_reference_asset_id IS NULL THEN RAISE EXCEPTION 'Candidate is not eligible'; END IF;
  PERFORM 1 FROM public.model_candidate_jobs AS j WHERE j.id=c.job_id AND j.model_id=c.model_id
    AND j.user_id=p_owner_id AND j.status='succeeded' AND j.submission_state='persisted' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Candidate is not eligible'; END IF;
  PERFORM 1 FROM public.model_reference_assets AS a WHERE a.id=c.primary_reference_asset_id
    AND a.model_id=c.model_id AND a.user_id=p_owner_id AND a.source='candidate_generated' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reference evidence is invalid'; END IF;

  INSERT INTO klay_model_security.approval_context(backend_pid,transaction_id,model_id,owner_id,candidate_id)
  VALUES(pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),p.id,p_owner_id,c.id);
  UPDATE public.model_profiles SET status='approved',approved_candidate_id=c.id WHERE id=p.id AND user_id=p_owner_id;
  SELECT coalesce(max(version_number),0)+1 INTO n FROM public.model_identity_versions WHERE model_id=p.id;
  INSERT INTO public.model_identity_versions(model_id,user_id,version_number,appearance)
    VALUES(p.id,p_owner_id,n,c.appearance_snapshot) RETURNING id INTO v;
  INSERT INTO public.model_identity_version_references(identity_version_id,reference_asset_id,view)
    VALUES(v,c.primary_reference_asset_id,'front');
  UPDATE klay_model_security.approval_context SET version_id=v
    WHERE backend_pid=pg_catalog.pg_backend_pid() AND transaction_id=pg_catalog.txid_current() AND model_id=p.id;
  UPDATE public.model_profiles SET current_identity_version_id=v WHERE id=p.id AND user_id=p_owner_id;
  DELETE FROM klay_model_security.approval_context
    WHERE backend_pid=pg_catalog.pg_backend_pid() AND transaction_id=pg_catalog.txid_current() AND model_id=p.id;
  -- Any error aborts this SQL statement and rolls its context row back as well.
  RETURN v;
END;
$approve$;
-- CREATE OR REPLACE retains both public function ACLs and ownership. In
-- particular, approve_model_candidate remains executable only by service_role
-- (and its trusted database owner). The existing immutable-version trigger,
-- RLS policies, public table grants, and candidate ownership guard are retained.
