// Reads for the Gauntlet page — service client only (gauntlet_runs and
// card_inventory are both deny-all), ownership scoped by the session's
// discord id at the caller.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MeasureKey } from "@/lib/cards/measures";
import type { InventoryRow } from "@/lib/packs/queries";
import { mondayOf } from "@/lib/packs/week";
import type { GauntletRunRow } from "./run";
import { rankGauntletWeek } from "./settle";
import { patronActive } from "@/lib/patron/flames";
import { GAUNTLET_ROLES, type GauntletRole } from "./sim";

/** The bars the draft screen reads: the three comp identities
 *  (compProfileOf) plus every lane key — small enough to ship per option. */
export const DRAFT_STAT_KEYS: MeasureKey[] = ["combat", "damage", "laning", "presence", "survival", "vision"];

/** One pickable card in the draft — the slice the client needs, WITHOUT
 *  the frozen card json (a shelf of 200 copies must not ship 200 cards). */
export interface GauntletOption {
  inventoryId: number;
  name: string;
  overall: number;
  foil: boolean;
  signed: boolean;
  fresh: boolean;
  editionWeek: string;
  /** The real-life team — what the draft screen's chemistry reads. */
  team: string | null;
  /** The DRAFT_STAT_KEYS bars only — enough for the comp readout and the
   *  per-card chips; missing bars fall back the way statOf falls back. */
  stats: Partial<Record<MeasureKey, number>>;
}

/** The Monday key of the running week — module-level so components call
 *  this instead of building dates in render. */
export function currentWeek(): string {
  return mondayOf(new Date());
}

/** The collection as draft options, by role, best copies first. Moments
 *  and champions relics don't field — they watch from the shelf. */
export function buildGauntletOptions(rows: InventoryRow[], week: string): Record<GauntletRole, GauntletOption[]> {
  const byRole = Object.fromEntries(GAUNTLET_ROLES.map((role) => [role, [] as GauntletOption[]])) as Record<
    GauntletRole,
    GauntletOption[]
  >;
  for (const row of rows) {
    if (row.card.moment || row.card.champWin) continue;
    const role = row.role as GauntletRole;
    if (!byRole[role]) continue;
    byRole[role].push({
      inventoryId: row.id,
      name: row.playerName,
      overall: row.overall,
      foil: row.foil,
      signed: row.signed,
      fresh: row.editionWeek === week,
      editionWeek: row.editionWeek,
      team: row.card.teamName ?? null,
      stats: Object.fromEntries(
        (row.card.subStats ?? [])
          .filter((bar) => (DRAFT_STAT_KEYS as string[]).includes(bar.key))
          .map((bar) => [bar.key, bar.value]),
      ),
    });
  }
  for (const role of GAUNTLET_ROLES) {
    byRole[role].sort((a, b) => b.overall - a.overall || a.name.localeCompare(b.name));
  }
  return byRole;
}

export async function fetchActiveGauntletRun(
  supabase: SupabaseClient,
  discordId: string,
): Promise<GauntletRunRow | null> {
  const { data, error } = await supabase
    .from("gauntlet_runs")
    .select("*")
    .eq("discord_id", discordId)
    .eq("status", "active")
    .maybeSingle();
  // Deploy-before-migration: no table just means no run yet.
  if (error) return null;
  return data as GauntletRunRow | null;
}

export interface GauntletWeekStats {
  bestScore: number;
  attempts: number;
  /** The latest finished run, for the "last run" strip. */
  lastFinished: GauntletRunRow | null;
}

export async function fetchGauntletWeekStats(
  supabase: SupabaseClient,
  discordId: string,
  week: string,
): Promise<GauntletWeekStats> {
  const { data, error } = await supabase
    .from("gauntlet_runs")
    .select("*")
    .eq("discord_id", discordId)
    .eq("week_start", week)
    .order("id", { ascending: false });
  if (error) return { bestScore: 0, attempts: 0, lastFinished: null };
  const runs = (data as GauntletRunRow[]) ?? [];
  const finished = runs.filter((run) => run.status !== "active");
  return {
    bestScore: runs.reduce((best, run) => Math.max(best, run.score), 0),
    attempts: runs.length,
    lastFinished: finished[0] ?? null,
  };
}

export interface GauntletBoardRow {
  discordId: string;
  username: string;
  score: number;
  round: number;
  cleared: boolean;
  /** Active patron's flame key, for the board's flame dot. */
  flame: string | null;
}

/** The week's board: best run per user, ranked — the same ranking the
 *  Monday settlement pays, so what the page shows is what the pot reads. */
export async function fetchGauntletBoard(
  supabase: SupabaseClient,
  season: string,
  week: string,
  limit = 10,
): Promise<GauntletBoardRow[]> {
  const { data, error } = await supabase
    .from("gauntlet_runs")
    .select("discord_id, score, round, status")
    .eq("season", season)
    .eq("week_start", week);
  if (error) return [];
  const ranked = rankGauntletWeek((data as { discord_id: string; score: number; round: number; status: string }[]) ?? []).slice(0, limit);
  if (ranked.length === 0) return [];
  const { data: profiles } = await supabase
    .from("betting_profiles")
    .select("discord_id, username, patron_until, patron_flame")
    .in("discord_id", ranked.map((row) => row.discordId));
  const byId = new Map(
    ((profiles as { discord_id: string; username: string | null; patron_until: string | null; patron_flame: string | null }[]) ?? []).map(
      (row) => [row.discord_id, row],
    ),
  );
  return ranked.map((row) => {
    const profile = byId.get(row.discordId);
    return {
      discordId: row.discordId,
      username: profile?.username ?? "Unknown",
      score: row.score,
      round: row.round,
      cleared: row.cleared,
      flame: profile && patronActive(profile.patron_until) ? profile.patron_flame ?? "ember" : null,
    };
  });
}
