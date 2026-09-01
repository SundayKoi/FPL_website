-- ---------------------------------------------------------------------------
-- Forfeits.
--
-- A series can end without every game being played: a team no-shows, or
-- concedes after game one. Until now the reporting form had no way to say so.
-- The captain could still type the series score (score_a/score_b are free
-- entry and independent of the game rows), so a 2-0 forfeit win after one
-- real game DID report — but it came out the far side of the ingest carrying
-- "Reported 2-0 but games show 1-0", which reads as a mistake to whoever
-- reviews the queue. And a forfeit with NO games played was refused outright:
-- ingest_report fails any report with an empty match_report_games set.
--
-- Two columns say it out loud instead of leaving it to be inferred from a
-- score that does not add up:
--
--   forfeit_team_id  which side forfeited. Constrained to one of the two
--                    teams actually in the series — a report naming a third
--                    team is a bug, not a result.
--   forfeit_note     free text for the human reason ("no show", "roster
--                    ineligible"), shown to staff in the reports queue.
--
-- And one new status. A report with zero games rolls up to 'forfeit' rather
-- than 'ingested', which keeps the invariant the ingest was built around
-- (20260811100002's rollup_report_status: an empty game set must never read
-- as a completed ingest, because nothing was verified) while still letting
-- the result reach the schedule. Staff can filter the queue on it.
--
-- WHAT THIS DELIBERATELY DOES NOT DO: gate the declaration behind admin
-- approval. A captain can already push a self-declared score onto a fixture
-- today by reporting one real game with an invented series score, so the new
-- surface is narrower than it looks — a zero-game forfeit removes the last
-- verifiable game rather than the first. The existing controls still apply:
-- sync_fixture_score writes only while the fixture's score is still null, and
-- /schedule's editor is the correction path. If forfeits are ever abused the
-- fix is an approval step on this column, not a rollback of it.
--
-- Stats are untouched on purpose. Only real games produce raw_stats, so a
-- forfeited series contributes exactly the games that were played — which is
-- the behaviour the cards, the fantasy points and the leaderboards all want.
-- ---------------------------------------------------------------------------

alter table public.match_reports
  add column forfeit_team_id uuid references public.league_teams(id),
  add column forfeit_note text;

alter table public.match_reports
  add constraint match_reports_forfeit_is_a_side
  check (
    forfeit_team_id is null
    or forfeit_team_id = team_a_id
    or forfeit_team_id = team_b_id
  );

-- The status check is an inline constraint from 20260811100002, so its name is
-- whatever Postgres generated. Look it up rather than guessing: a hardcoded
-- name that does not exist takes the whole migration down.
do $$
declare
  v_name text;
begin
  select conname into v_name
    from pg_constraint
   where conrelid = 'public.match_reports'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) like '%needs_sides%';
  if v_name is not null then
    execute format('alter table public.match_reports drop constraint %I', v_name);
  end if;
end $$;

alter table public.match_reports
  add constraint match_reports_status_check
  check (status in ('pending', 'ingested', 'needs_sides', 'failed', 'forfeit'));

-- "Which series ended in a forfeit this season" is a staff question, asked
-- over a table that is overwhelmingly non-forfeit. Partial, so the index
-- stays the size of the answer rather than the size of the table.
create index match_reports_forfeit_idx
  on public.match_reports (forfeit_team_id) where forfeit_team_id is not null;

comment on column public.match_reports.forfeit_team_id is
  'The team that forfeited, when the series did not go the distance. Null for an ordinary series. Games actually played are still reported and still ingest.';
comment on column public.match_reports.forfeit_note is
  'Human reason for the forfeit, shown to staff in the reports queue.';
