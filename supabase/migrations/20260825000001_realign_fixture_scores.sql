-- Correct fixture scores written the wrong way round.
--
-- sync_fixture_score copied a report's score_a/score_b onto the fixture
-- positionally. A report's team_a is whichever team the captain picked first
-- in their form; the fixture's team_a comes from the schedule draw. Where the
-- two disagreed the score landed reversed, so the schedule and homepage showed
-- the losing team winning a series the ingest itself had recorded correctly --
-- the match page, which reads raw_stats, disagreed with the fixture.
--
-- The ingest is fixed; this repairs what it already wrote.

create or replace function public.realign_fixture_scores_to_reports() returns int
language plpgsql security definer set search_path = public as $$
declare v_fixed int;
begin
  -- Idempotent by construction: the score is derived FROM the report and
  -- aligned to the fixture's own sides, so running this twice produces the
  -- same answer rather than swapping the row back again.
  update public.fixtures f
  set score_a = case when lower(trim(f.team_a)) = lower(trim(ta.name)) then r.score_a else r.score_b end,
      score_b = case when lower(trim(f.team_a)) = lower(trim(ta.name)) then r.score_b else r.score_a end
  from public.match_reports r
  join public.league_teams ta on ta.id = r.team_a_id
  join public.league_teams tb on tb.id = r.team_b_id
  where f.id = r.fixture_id
    and f.score_a is not null
    and r.score_a is not null
    -- Only rows whose sides are genuinely the other way round. A fixture
    -- listed in the same order as its report is left untouched.
    and lower(trim(f.team_a)) = lower(trim(tb.name))
    and lower(trim(f.team_b)) = lower(trim(ta.name))
    and (f.score_a, f.score_b) is distinct from (r.score_b, r.score_a);

  get diagnostics v_fixed = row_count;
  if v_fixed > 0 then
    raise notice 'Realigned % fixture score(s) to their report.', v_fixed;
  end if;
  return v_fixed;
end;
$$;

revoke all on function public.realign_fixture_scores_to_reports() from public, anon, authenticated;
grant execute on function public.realign_fixture_scores_to_reports() to service_role;

select public.realign_fixture_scores_to_reports();
