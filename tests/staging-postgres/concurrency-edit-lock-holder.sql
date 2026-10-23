\set ON_ERROR_STOP on
\set QUIET on
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('f7f50000-0000-4000-8000-000000000901',71101));
SELECT pg_sleep(8);
COMMIT;
