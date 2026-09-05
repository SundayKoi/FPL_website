import { fetchAllPages } from "@/lib/supabase/pagination";
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { teamSlug } from "@/lib/teams/teamPage";
import type { SearchItem } from "@/lib/site/search";

/**
 * The names the search palette can jump to that are not pages: every
 * player with a stats profile, and every team of each league's draft.
 * Fetched once per palette open and kept for the visit. Public data only,
 * read through the anon client — the same rows the player and team pages
 * render for anyone.
 */
export async function GET() {
  const supabase = await createServerSupabase();
  const [identities, { data: settings }] = await Promise.all([
    fetchAllPages<{ summoner_name: string; tag: string }>((from, to) => supabase.from("stats_player_agg")
      .select("summoner_name, tag").order("summoner_name").order("tag").order("season").order("season_phase")
      .range(from, to)),
    supabase.from("league_settings").select("featured_draft_id, academy_draft_id").eq("id", 1).single(),
  ]);

  const players = new Map<string, SearchItem>();
  const nameCounts = new Map<string, number>();
  for (const row of (identities ?? []) as { summoner_name: string; tag: string }[]) {
    const key = `${row.summoner_name}#${row.tag}`.toLowerCase();
    if (players.has(key)) continue;
    nameCounts.set(row.summoner_name.toLowerCase(), (nameCounts.get(row.summoner_name.toLowerCase()) ?? 0) + 1);
    players.set(key, {
      kind: "player",
      label: row.summoner_name,
      href: `/players/${encodeURIComponent(`${row.summoner_name}#${row.tag}`)}`,
      hint: `#${row.tag}`,
    });
  }
  // A name only one person has needs no tag beside it.
  for (const item of players.values()) {
    if ((nameCounts.get(item.label.toLowerCase()) ?? 0) <= 1) item.hint = "Player";
  }

  const draftIds = [
    ["premier", settings?.featured_draft_id ?? null],
    ["academy", settings?.academy_draft_id ?? null],
  ] as const;
  const ids = [...new Set(draftIds.flatMap(([, id]) => id ? [id] : []))];
  const { data: teamRows } = ids.length
    ? await supabase.from("teams").select("name, draft_id").in("draft_id", ids)
    : { data: [] };
  const teams: SearchItem[] = [];
  for (const [league, draftId] of draftIds) {
    if (!draftId) continue;
    for (const row of (teamRows ?? []) as { name: string; draft_id: string }[]) {
      if (row.draft_id !== draftId) continue;
      teams.push({
        kind: "team",
        label: row.name,
        href: league === "academy" ? `/academy/teams/${teamSlug(row.name)}` : `/teams/${teamSlug(row.name)}`,
        hint: league === "academy" ? "Academy team" : "Team",
      });
    }
  }

  return NextResponse.json(
    { players: Array.from(players.values()), teams },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
