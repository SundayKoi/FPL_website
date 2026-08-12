-- ---------------------------------------------------------------------------
-- Task 6 fix round: make AdminCodeEditor's save atomic. The client previously
-- did delete-then-insert as two separate round-trips; if the insert failed
-- after the delete succeeded (network blip, closed tab, concurrent admin),
-- the fixture was left with zero codes and captains would see "No codes
-- posted yet" for a match that had codes seconds earlier. Folding both steps
-- into one SECURITY DEFINER function makes them atomic (single statement-
-- level transaction) with no client-visible partial state.
-- ---------------------------------------------------------------------------

-- === replace_match_codes ======================================================
-- Replaces a fixture's whole match_codes set: delete existing rows for
-- p_fixture_id, then insert p_codes numbered 1..N in array order, skipping
-- blank/whitespace-only entries (mirrors the client's prior
-- `.map(trim).filter(Boolean)` behaviour exactly, just server-side).
-- Team-name-to-league_teams resolution stays a client-side pre-check (the
-- client already has `fixtures`/`league_teams` loaded and can show which
-- name failed to resolve) -- this function just takes the resolved ids.
-- Returns the number of rows inserted.
--
-- Admin action -> follows this codebase's established convention for admin-
-- mutating SECURITY DEFINER RPCs (admin_assign_player,
-- sync_league_team_captains, etc. -- see 20260807000005_start_draft_pause.sql's
-- _require_admin() and 20260810000004_admin_assignment_integrity.sql's
-- revoke/grant pattern): perform _require_admin() as the first statement,
-- then revoke the default PUBLIC execute grant and re-grant only to
-- authenticated/service_role.
create function public.replace_match_codes(
  p_fixture_id uuid,
  p_season text,
  p_team_a_id uuid,
  p_team_b_id uuid,
  p_codes text[]
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted int;
begin
  perform public._require_admin();

  delete from public.match_codes where fixture_id = p_fixture_id;

  -- created_by is stamped from the caller's own auth.uid() (same pattern
  -- is_admin()/_require_admin() themselves rely on inside a SECURITY
  -- DEFINER function) rather than taken as a parameter -- mirrors
  -- src/lib/captain/queries.ts's submitReport deriving submitted_by the
  -- same way instead of trusting a client-supplied id.
  insert into public.match_codes (fixture_id, season, team_a_id, team_b_id, game_number, code, created_by)
  select p_fixture_id, p_season, p_team_a_id, p_team_b_id, row_number() over (order by ord), trimmed, auth.uid()
  from (
    select ord, trim(code) as trimmed
    from unnest(p_codes) with ordinality as t(code, ord)
  ) s
  where trimmed <> '';

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.replace_match_codes(uuid, text, uuid, uuid, text[]) from public;
grant execute on function public.replace_match_codes(uuid, text, uuid, uuid, text[]) to authenticated, service_role;
