-- Included only inside the caller's explicit rollback transaction.
CREATE TEMP TABLE f07_failures(label text NOT NULL);
CREATE FUNCTION pg_temp.f07_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $body$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: F07 %',label; END IF;
  RAISE NOTICE 'PASS: F07 %',label;
END;
$body$;
CREATE FUNCTION pg_temp.f07_deny(action text,expected_state text,expected_error text,label text,
  legacy_state text DEFAULT NULL,legacy_error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $body$
BEGIN
  BEGIN
    EXECUTE action;
    -- Roll back an unexpectedly accepted write before the next independent test.
    RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='F07 test rollback sentinel';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE='ZX001' AND SQLERRM='F07 test rollback sentinel' THEN
      INSERT INTO pg_temp.f07_failures VALUES(label);
      RAISE WARNING 'FAIL: F07 accepted forbidden operation: %',label;
    ELSIF SQLSTATE=expected_state AND SQLERRM=expected_error THEN
      RAISE NOTICE 'PASS: F07 denial: %',label;
    ELSIF legacy_state IS NOT NULL AND SQLSTATE=legacy_state AND SQLERRM=legacy_error THEN
      RAISE NOTICE 'PASS: existing database denial: %',label;
    ELSE
      RAISE; -- Undefined fields, missing objects and unrelated SQL errors are not a PASS.
    END IF;
  END;
END;
$body$;
CREATE FUNCTION pg_temp.f07_finish() RETURNS void LANGUAGE plpgsql AS $body$
DECLARE failed bigint; labels text;
BEGIN
  SELECT count(*),string_agg(label,'; ') INTO failed,labels FROM pg_temp.f07_failures;
  IF failed <> 0 THEN RAISE EXCEPTION 'ASSERTION FAILED: F07 accepted % forbidden operations: %',failed,labels; END IF;
END;
$body$;
-- The assertion helper remains invoker security when role-switched below.
GRANT SELECT,INSERT ON TABLE pg_temp.f07_failures TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION pg_temp.f07_assert(boolean,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION pg_temp.f07_deny(text,text,text,text,text,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION pg_temp.f07_finish() TO authenticated,service_role;
DO $temp_usage$
BEGIN
  EXECUTE pg_catalog.format('GRANT USAGE ON SCHEMA %I TO authenticated,service_role',
    pg_catalog.pg_my_temp_schema()::pg_catalog.regnamespace::text);
END;
$temp_usage$;
