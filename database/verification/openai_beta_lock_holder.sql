-- CLI test session A; disposable gklpgcyndeghjgemoonk only. No committed writes.
begin;
set local statement_timeout = '35s';
select pg_advisory_xact_lock(hashtextextended('klay:openai-beta:' || (clock_timestamp() at time zone 'UTC')::date::text || ':image', 0));
select pg_sleep(25);
select pg_backend_pid() as holder_pid, 'lock released by rollback' as result;
rollback;
