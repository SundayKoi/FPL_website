-- Every Premium member may start a fresh Higher or Lower attempt after a run
-- finishes. The server-side Premium gate authorizes the caller; this trusted
-- service-role RPC preserves the completed attempt for weekly best-score
-- ranking while reusing the replay-aware state machine.

create or replace function public.start_higher_lower_run(
  p_puzzle_date date,
  p_league text,
  p_profile_id uuid,
  p_discord_id text
) returns setof public.higher_lower_daily_runs
language plpgsql
security invoker
set search_path = public
as $$
begin
  return query select * from public._start_higher_lower_run(
    p_puzzle_date, p_league, p_profile_id, p_discord_id, true
  );
end;
$$;

revoke all on function public.start_higher_lower_run(date, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.start_higher_lower_run(date, text, uuid, text)
  to service_role;
