-- ---------------------------------------------------------------------------
-- Fix round (post-Task-5 review): match_reports / match_report_games write
-- RLS was keyed on public.is_captain() (Task 2) -- captain of ANY draft
-- team, ever, with no season scope. That is simultaneously too loose (a
-- former captain, or a captain of a team wholly unrelated to the report
-- being written, could insert/update a report for any two league_teams) and
-- too tight (a captain listed only in league_team_captains -- the /captain
-- page's OWN captaincy model, Task 4, which is what actually gates that page
-- and match_codes -- who was never a draft teams.captain_profile_id passes
-- the page's gate and then hits a silent 42501 the first time they try to
-- report). See .superpowers/sdd/2026-08-11-match-reporting-auto-ingest/
-- task-5-report.md ("Concerns") for the finding this migration fixes.
--
-- Fix: the captain path on all three write policies below is replaced with
-- public.is_captain_of(league_team_id, season) (Task 4), evaluated against
-- the REPORT'S OWN two teams and season -- exactly who the /captain page
-- lets see that report's codes and act on it, no more and no less.
--
-- public.is_captain() itself is left in place (referenced by nothing after
-- this migration, but dropping it was not asked for in this fix round and
-- is out of scope here).
-- ---------------------------------------------------------------------------

drop policy match_reports_insert on public.match_reports;
create policy match_reports_insert on public.match_reports for insert to authenticated
  with check (
    public.is_admin()
    or public.is_captain_of(team_a_id, season)
    or public.is_captain_of(team_b_id, season)
  );

drop policy match_report_games_insert on public.match_report_games;
create policy match_report_games_insert on public.match_report_games for insert to authenticated
  with check (
    exists (
      select 1 from public.match_reports r
      where r.id = report_id
        and (
          public.is_admin()
          or public.is_captain_of(r.team_a_id, r.season)
          or public.is_captain_of(r.team_b_id, r.season)
        )
    )
  );

-- Same season-scoped captain rule as the insert policy above, still ANDed
-- (in `using`, not `with check` -- unchanged from the policy this replaces)
-- with "the parent report is not yet ingested", which is what lets a
-- captain resolve a needs_sides report right up until the ingest job locks
-- it in.
drop policy match_report_games_update on public.match_report_games;
create policy match_report_games_update on public.match_report_games for update to authenticated
  using (
    exists (
      select 1 from public.match_reports r
      where r.id = report_id
        and r.status <> 'ingested'
        and (
          public.is_admin()
          or public.is_captain_of(r.team_a_id, r.season)
          or public.is_captain_of(r.team_b_id, r.season)
        )
    )
  )
  with check (
    exists (
      select 1 from public.match_reports r
      where r.id = report_id
        and (
          public.is_admin()
          or public.is_captain_of(r.team_a_id, r.season)
          or public.is_captain_of(r.team_b_id, r.season)
        )
    )
  );
