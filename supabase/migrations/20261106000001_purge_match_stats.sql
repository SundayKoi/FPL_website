-- Re-reporting a series that already ingested.
--
-- A match report is a captain's claim about which series a handful of Riot
-- games belong to; the ingester turns that claim into raw_stats rows whose
-- team_name, season and season_phase come from the report, not from Riot.
-- When the claim was wrong (sides swapped, wrong phase, wrong teams), deleting
-- the report used to leave those rows behind: match_reports and its games
-- went away, raw_stats stayed, and from then on every path treated the games
-- as done. The reporting form refused the match ids as "already reported",
-- the ingester skipped them without a Riot call, and the stats pages, cards
-- and fantasy points kept the wrong attribution with no report to point at.
--
-- Nothing below the service role may write raw_stats, on purpose, so the
-- correction is this one admin-only RPC: drop the rows for the given match
-- ids and put any report that still lists them back in the ingest queue, so
-- the next run re-fetches the games from Riot under the corrected report.
-- The admin reports queue calls it when deleting a report whose games have
-- stats, and the reporting form offers it to an admin re-filing games whose
-- report is already gone.
--
-- Deliberately NOT undone here, because each has its own correction path and
-- none can be inferred from a match id alone:
--   * fixtures.score_a/score_b (sync_fixture_score only fills a null score;
--     /schedule's editor corrects one already written),
--   * card_editions and card_inventory (frozen by design; the archive
--     workflow rebuilds an edition, minted cards stay as pulled),
--   * settled betting markets and daily-game puzzles frozen from these rows.

create or replace function public.purge_match_stats(p_match_ids text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids text[];
  v_stats_deleted integer := 0;
  v_games_reset integer := 0;
  v_reports_reset integer := 0;
begin
  perform public._require_admin();

  select coalesce(array_agg(distinct trimmed), array[]::text[])
  into v_ids
  from (
    select btrim(id) as trimmed
    from unnest(coalesce(p_match_ids, array[]::text[])) as input(id)
  ) ids
  where trimmed <> '';

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    raise exception 'MATCH_IDS_REQUIRED: at least one match id is required';
  end if;

  -- Hold the reports that list these games for the whole transaction, so a
  -- concurrent retry or side fix cannot interleave with the reset below.
  perform 1
  from public.match_reports r
  where exists (
    select 1 from public.match_report_games g
    where g.report_id = r.id and g.match_id = any(v_ids)
  )
  for update;

  delete from public.raw_stats s
  where s.match_id = any(v_ids);
  get diagnostics v_stats_deleted = row_count;

  -- A game marked ingested is only as true as the raw_stats rows behind it.
  -- With those gone it goes back to pending, so the next --from-reports run
  -- fetches it again instead of trusting the stale status. Games that never
  -- ingested (pending, needs_side, failed) are left exactly as they were.
  update public.match_report_games g
  set status = 'pending',
      error_text = null,
      resolved_blue_team_id = null
  where g.match_id = any(v_ids)
    and g.status = 'ingested';
  get diagnostics v_games_reset = row_count;

  -- The report's own ingested/score-checked state was derived from the same
  -- rows. Back to pending, which is the status the ingester picks up.
  update public.match_reports r
  set status = 'pending',
      error_text = null,
      warning_text = null,
      ingested_at = null
  where r.status = 'ingested'
    and exists (
      select 1 from public.match_report_games g
      where g.report_id = r.id and g.match_id = any(v_ids)
    );
  get diagnostics v_reports_reset = row_count;

  return jsonb_build_object(
    'stats_deleted', v_stats_deleted,
    'games_reset', v_games_reset,
    'reports_reset', v_reports_reset
  );
end;
$$;

revoke all on function public.purge_match_stats(text[]) from public, anon;
grant execute on function public.purge_match_stats(text[]) to authenticated, service_role;

comment on function public.purge_match_stats(text[]) is
  'Admin-only. Deletes the raw_stats rows for the given Riot match ids and returns any report still listing them to the ingest queue, so a wrongly reported series can be reported and ingested again.';
