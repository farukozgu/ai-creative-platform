\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '20s';
SELECT pg_advisory_xact_lock(hashtextextended('f7f50000-0000-4000-8000-000000000901',71202));
SELECT pg_sleep(6);
COMMIT;
