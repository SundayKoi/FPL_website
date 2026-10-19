// Reads for the offseason pages. Nearly everything the event stores is
// public, so the ordinary cookie-bound client reads it. Tournament codes are
// the exception: RLS shows each reader only the codes they may see.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/supabase/pagination";
import type { OffseasonStatRow } from "./ratings";
import type {
  OffseasonEntrant,
  OffseasonEvent,
  OffseasonEventData,
  OffseasonGame,
  OffseasonMatch,
  OffseasonMatchCode,
  OffseasonTeam,
  OffseasonTeamMember,
  OffseasonWeek,
  OffseasonWeekEntry,
} from "./types";
import { buildOffseasonView, type OffseasonView } from "./view";

/** The newest event, or null when none has been created. */
export async function fetchLatestEvent(supabase: SupabaseClient): Promise<OffseasonEvent | null> {
  const { data, error } = await supabase
    .from("offseason_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`offseason event read failed: ${error.message}`);
  return (data as OffseasonEvent | null) ?? null;
}

function rows<T>(result: { data: unknown; error: { message: string } | null }, what: string): T[] {
  if (result.error) throw new Error(`offseason ${what} read failed: ${result.error.message}`);
  return (result.data as T[] | null) ?? [];
}

const NONE = ["00000000-0000-0000-0000-000000000000"];

export async function fetchEventData(supabase: SupabaseClient, event: OffseasonEvent): Promise<OffseasonEventData> {
  const [entrantsResult, weeksResult] = await Promise.all([
    supabase.from("offseason_entrants").select("*").eq("event_id", event.id).order("signed_up_at"),
    supabase.from("offseason_weeks").select("*").eq("event_id", event.id).order("week_number"),
  ]);
  const entrants = rows<OffseasonEntrant>(entrantsResult, "entrants");
  const weeks = rows<OffseasonWeek>(weeksResult, "weeks");
  const weekIds = weeks.length ? weeks.map((week) => week.id) : NONE;

  const [entriesResult, teamsResult, matchesResult] = await Promise.all([
    supabase.from("offseason_week_entries").select("*").in("week_id", weekIds),
    supabase.from("offseason_teams").select("*").in("week_id", weekIds).order("name"),
    supabase.from("offseason_matches").select("*").in("week_id", weekIds).order("sort_order"),
  ]);
  const teams = rows<OffseasonTeam>(teamsResult, "teams");
  const matches = rows<OffseasonMatch>(matchesResult, "matches");

  const [membersResult, gamesResult] = await Promise.all([
    supabase.from("offseason_team_members").select("*").in("team_id", teams.length ? teams.map((team) => team.id) : NONE),
    supabase.from("offseason_games").select("*").in("match_id", matches.length ? matches.map((match) => match.id) : NONE).order("game_number"),
  ]);

  return {
    event,
    entrants,
    weeks,
    entries: rows<OffseasonWeekEntry>(entriesResult, "week entries"),
    teams,
    members: rows<OffseasonTeamMember>(membersResult, "team members"),
    matches,
    games: rows<OffseasonGame>(gamesResult, "games"),
  };
}

/** The ingested rows for the given Riot match ids. */
export async function fetchEventStats(supabase: SupabaseClient, riotMatchIds: string[]): Promise<OffseasonStatRow[]> {
  const out: OffseasonStatRow[] = [];
  for (let i = 0; i < riotMatchIds.length; i += 100) {
    const ids = riotMatchIds.slice(i, i + 100);
    out.push(
      ...(await fetchAllPages<OffseasonStatRow>((from, to) =>
        supabase.from("offseason_stats").select("*").in("match_id", ids).order("id").range(from, to),
      )),
    );
  }
  return out;
}

/** The newest event with its ratings, or null when there is no event. */
export async function loadOffseason(supabase: SupabaseClient): Promise<OffseasonView | null> {
  const event = await fetchLatestEvent(supabase);
  if (!event) return null;
  const data = await fetchEventData(supabase, event);
  const riotIds = data.games.map((game) => game.riot_match_id).filter((id): id is string => Boolean(id));
  return buildOffseasonView(data, await fetchEventStats(supabase, riotIds));
}

/** The entrants' saved card signatures, by entrant id. */
export async function fetchSignatures(supabase: SupabaseClient, entrantIds: string[]): Promise<Map<string, string>> {
  if (entrantIds.length === 0) return new Map();
  const { data, error } = await supabase.from("offseason_signatures").select("entrant_id, signature").in("entrant_id", entrantIds);
  if (error) throw new Error(`offseason signatures read failed: ${error.message}`);
  return new Map(((data as { entrant_id: string; signature: string }[] | null) ?? []).map((row) => [row.entrant_id, row.signature]));
}

const CODE_COLUMNS = "id, event_id, seq, code, match_id, game_number";

function codeRows(result: { data: unknown; error: { message: string } | null }): OffseasonMatchCode[] {
  return rows<OffseasonMatchCode>(result, "tournament codes").sort((a, b) => a.seq - b.seq);
}

/** The codes of these matches that the reader may see: their own team's, or every one for staff. */
export async function fetchMatchCodes(supabase: SupabaseClient, matchIds: string[]): Promise<OffseasonMatchCode[]> {
  if (matchIds.length === 0) return [];
  return codeRows(await supabase.from("offseason_match_codes").select(CODE_COLUMNS).in("match_id", matchIds));
}

/** Every code in the event, the pool included. Only staff read them all. */
export async function fetchEventMatchCodes(supabase: SupabaseClient, eventId: string): Promise<OffseasonMatchCode[]> {
  return codeRows(await supabase.from("offseason_match_codes").select(CODE_COLUMNS).eq("event_id", eventId));
}
