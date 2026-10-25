-- CLI test session B; start while A is sleeping. No committed writes.
begin;
set local statement_timeout = '10s';
set local lock_timeout = '1s';
do $$ begin
  perform pg_advisory_xact_lock(hashtextextended('klay:openai-beta:' || (clock_timestamp() at time zone 'UTC')::date::text || ':image', 0));
  perform set_config('klay.beta_lock_blocked', 'false', true);
exception when lock_not_available then
  perform set_config('klay.beta_lock_blocked', 'true', true);
end $$;
select pg_backend_pid() as contender_pid, current_setting('klay.beta_lock_blocked')::boolean as overlapping_session_blocked;
rollback;
