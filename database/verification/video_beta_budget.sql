-- DISPOSABLE project gklpgcyndeghjgemoonk only. Test fixtures roll back.
begin;
create temporary table beta_cap_result(passed boolean) on commit drop;
do $$
declare u uuid; amount numeric; denied boolean:=false;
begin
  select id into u from auth.users order by created_at limit 1;
  if u is null then raise exception 'Disposable auth fixture required'; end if;
  select coalesce(sum(cost_usd),0) into amount from public.video_beta_reservations;
  while amount < 10 loop
    insert into public.video_beta_reservations(owner_id,submission_id,tier,duration,cost_usd)
      values(u,gen_random_uuid(),'standard',5,least(2,10-amount));
    select sum(cost_usd) into amount from public.video_beta_reservations;
  end loop;
  begin perform public.reserve_video_beta_budget(u,gen_random_uuid(),0.42,'standard',5);
  exception when raise_exception then denied:=sqlerrm='Video beta budget exhausted'; end;
  insert into beta_cap_result values(denied and amount=10);
end $$;
select 'lifetime_10_usd_cap' as check_name,passed from beta_cap_result;
rollback;
