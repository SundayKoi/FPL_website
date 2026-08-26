import type { SupabaseClient } from "@supabase/supabase-js";
import { cardPlayerKey, type PlayerCardData } from "@/lib/cards/build";
import { fetchCurrentWeekCards } from "@/lib/cards/queries";
import { normalizeCanonicalName } from "@/lib/players/canonicalMatch";
import { linkedAccountUrls } from "@/lib/players/linkedAccounts";
import { normalizeBasePlayerName } from "@/lib/players/normalize";
import { combineSeasonRows, mergeRows } from "@/lib/stats/formulas";
import type { PlayerAggRow } from "@/lib/stats/types";
import type { ScoutRosterPlayer } from "@/lib/scouting/types";
import type { BroadcasterPlayerDetails } from "./types";

export interface BroadcasterTurretRow {
  summoner_name: string;
  tag: string;
  turret_kills: number | null;
}

function nameKey(name: string): string {
  return normalizeCanonicalName(name);
}

function roleModeFor(role: ScoutRosterPlayer["role"]): string {
  return ({ top: "TOP", jungle: "JUNGLE", mid: "MIDDLE", adc: "BOTTOM", support: "UTILITY" })[role];
}

function linkedAccountNames(url: string): string[] {
  try {
    const parsed = new URL(url);
    const multisearch = parsed.searchParams.get("summoners");
    if (multisearch) return multisearch.split(",").map((account) => account.trim()).filter(Boolean);
    const slug = decodeURIComponent(parsed.pathname.split("/").pop() ?? "");
    const separator = slug.lastIndexOf("-");
    return separator > 0 ? [`${slug.slice(0, separator)}#${slug.slice(separator + 1)}`] : [];
  } catch {
    return [];
  }
}

function playerMatchNames(player: ScoutRosterPlayer): string[] {
  return [
    player.displayName,
    ...linkedAccountUrls(player.displayName).flatMap(linkedAccountNames),
    ...(player.opggUrl ? linkedAccountNames(player.opggUrl) : []),
  ].filter(Boolean);
}

function riotIdKey(name: string, tag: string): string {
  return `${normalizeBasePlayerName(name).replace(/\s+/g, "")}#${tag.trim().toLocaleLowerCase()}`;
}

function playerMatchRiotIds(player: ScoutRosterPlayer): Set<string> {
  return new Set(playerMatchNames(player).flatMap((value) => {
    const separator = value.lastIndexOf("#");
    if (separator <= 0 || separator === value.length - 1) return [];
    return [riotIdKey(value.slice(0, separator), value.slice(separator + 1))];
  }));
}

function groupByName<T>(rows: T[], getName: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = nameKey(getName(row));
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  return grouped;
}

function selectStats(
  rows: PlayerAggRow[] | undefined,
  roleMode: string,
  player: ScoutRosterPlayer,
): PlayerAggRow | null {
  if (!rows?.length) return null;
  const roleRows = rows.filter((row) => row.role_mode === roleMode);
  const exactRows = roleRows.filter((row) => playerMatchRiotIds(player).has(riotIdKey(row.summoner_name, row.tag)));
  if (exactRows.length > 0) return exactRows[0];
  if (roleRows.length === 1) return roleRows[0];
  return rows.length === 1 ? rows[0] : null;
}

function selectCard(
  cards: PlayerCardData[] | undefined,
  stats: PlayerAggRow | null,
): PlayerCardData | null {
  if (!cards?.length) return null;
  if (stats) {
    const exact = cards.find((card) => cardPlayerKey(card.name, card.tag) === cardPlayerKey(stats.summoner_name, stats.tag));
    if (exact) return exact;
  }
  return cards.length === 1 ? cards[0] : null;
}

function buildAverages(stats: PlayerAggRow, turretAverage: number): BroadcasterPlayerDetails["averages"] {
  return {
    games: stats.games,
    kda: stats.kda,
    damagePerMin: stats.avg_dmg_per_min,
    visionPerMin: stats.avg_vision_per_min,
    turretsPerGame: turretAverage,
    goldPerMin: stats.avg_gold_per_min,
    multiKills: stats.total_doubles + stats.total_triples + stats.total_quadras + stats.total_pentas,
  };
}

/** Build the compact player payload consumed by broadcaster matchup cards. */
export function buildBroadcasterPlayerDetails(
  roster: ScoutRosterPlayer[],
  cards: PlayerCardData[],
  statsRows: PlayerAggRow[],
  turretRows: BroadcasterTurretRow[],
  season: string,
): BroadcasterPlayerDetails[] {
  const statsByName = groupByName(
    mergeRows(
      statsRows,
      (row) => cardPlayerKey(row.summoner_name, row.tag),
      (group) => combineSeasonRows(group, season),
    ),
    (row) => row.summoner_name,
  );
  const cardsByName = groupByName(cards, (card) => card.name);
  const turretTotals = new Map<string, { total: number; games: number }>();
  for (const row of turretRows) {
    const key = cardPlayerKey(row.summoner_name, row.tag);
    const current = turretTotals.get(key) ?? { total: 0, games: 0 };
    current.total += row.turret_kills ?? 0;
    current.games += 1;
    turretTotals.set(key, current);
  }

  return roster.flatMap((player) => {
    const stats = selectStats(statsByName.get(nameKey(player.displayName)), roleModeFor(player.role), player);
    const exactKey = stats ? cardPlayerKey(stats.summoner_name, stats.tag) : null;
    const turretSummary = exactKey ? turretTotals.get(exactKey) : null;
    const averageTurrets = turretSummary ? turretSummary.total / turretSummary.games : 0;
    const playerCard = selectCard(cardsByName.get(nameKey(player.displayName)), stats);
    return playerCard || stats
      ? [{
          playerId: player.id,
          card: playerCard,
          averages: stats ? buildAverages(stats, averageTurrets) : null,
        }]
      : [];
  });
}

/** Fetch live premium cards plus the aggregate/raw fields absent from card payloads. */
export async function fetchBroadcasterPlayerDetails(
  supabase: SupabaseClient,
  season: string,
  roster: ScoutRosterPlayer[],
): Promise<BroadcasterPlayerDetails[]> {
  if (roster.length === 0) return [];

  const [cards, statsResult, turretResult] = await Promise.all([
    fetchCurrentWeekCards(supabase, season).catch((error) => {
      console.error("Unable to load premium cards for broadcaster matchups", error);
      return [];
    }),
    supabase.from("stats_player_agg").select("*").eq("season", season),
    supabase.from("raw_stats").select("summoner_name, tag, turret_kills").eq("season", season),
  ]);
  if (statsResult.error) throw statsResult.error;
  if (turretResult.error) throw turretResult.error;

  return buildBroadcasterPlayerDetails(
    roster,
    cards,
    (statsResult.data as PlayerAggRow[]) ?? [],
    (turretResult.data as BroadcasterTurretRow[]) ?? [],
    season,
  );
}
