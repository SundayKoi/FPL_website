import { normalizeCanonicalName } from "@/lib/players/canonicalMatch";
import { linkedAccountUrls } from "@/lib/players/linkedAccounts";
import { normalizeBasePlayerName } from "@/lib/players/normalize";
import type { LolRole } from "@/lib/draft/types";
import type { DraftSide } from "@/lib/match-draft/types";

export interface InhouseGameRow {
  summoner_name: string | null;
  champion: string | null;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
}

export interface IngestedScoutingGameRow {
  id?: number | null;
  summoner_name: string | null;
  tag: string | null;
  champion: string | null;
  season: string | null;
  match_id: string | null;
  game_date: string | null;
  team_side?: string | null;
}

export interface IngestedMatchReference {
  fixtureId: string;
  gameNumber: number | null;
}

export interface IngestedScoutingGame {
  playerId: string;
  playerName: string;
  role: LolRole;
  champion: string;
  fixtureId: string | null;
  season: string | null;
  matchId: string;
  gameDate: string | null;
  gameNumber?: number;
  teamSide?: DraftSide;
}

export interface InhouseChampionStat {
  champion: string;
  games: number;
  wins: number;
  winrate_pct: number;
  avg_kda: number;
}

export interface InhousePlayerStats {
  playerId: string;
  playerName: string;
  role: LolRole;
  games: number;
  champions: InhouseChampionStat[];
}

interface RosterPlayer {
  id: string;
  displayName: string;
  role: LolRole;
  opggUrl?: string | null;
}

const INHOUSE_NAME_ALIASES: Record<string, string> = {
  feraleevee: "feral eevee",
  slimpimpin: "slimpimpin77",
};

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

function playerMatchNames(player: RosterPlayer): string[] {
  const displayName = player.displayName;
  return [
    displayName,
    INHOUSE_NAME_ALIASES[normalizeCanonicalName(displayName)] ?? "",
    ...linkedAccountUrls(displayName).flatMap(linkedAccountNames),
    ...(player.opggUrl ? linkedAccountNames(player.opggUrl) : []),
  ]
    .filter(Boolean);
}

function playerMatchKeys(player: RosterPlayer): Set<string> {
  const names = playerMatchNames(player);
  return new Set(names.map(normalizeCanonicalName));
}

function riotIdKey(gameName: string, tag: string): string {
  const whitespaceInsensitiveName = normalizeBasePlayerName(gameName).replace(/\s+/g, "");
  return `${whitespaceInsensitiveName}#${tag.trim().toLocaleLowerCase()}`;
}

function playerMatchRiotIds(player: RosterPlayer): Set<string> {
  return new Set(playerMatchNames(player).flatMap((value) => {
    const separator = value.lastIndexOf("#");
    if (separator <= 0 || separator === value.length - 1) return [];
    return [riotIdKey(value.slice(0, separator), value.slice(separator + 1))];
  }));
}

interface RosterPlayerMap {
  byName: Map<string, RosterPlayer | null>;
  byRiotId: Map<string, RosterPlayer | null>;
  playerIdsWithRiotIds: Set<string>;
}

function rosterPlayerMap(roster: RosterPlayer[]): RosterPlayerMap {
  const byName = new Map<string, RosterPlayer | null>();
  const byRiotId = new Map<string, RosterPlayer | null>();
  const playerIdsWithRiotIds = new Set<string>();
  const add = (map: Map<string, RosterPlayer | null>, key: string, player: RosterPlayer) => {
    const current = map.get(key);
    map.set(key, current === undefined || current?.id === player.id ? player : null);
  };
  for (const player of roster) {
    for (const key of playerMatchKeys(player)) add(byName, key, player);
    for (const key of playerMatchRiotIds(player)) {
      playerIdsWithRiotIds.add(player.id);
      add(byRiotId, key, player);
    }
  }
  return { byName, byRiotId, playerIdsWithRiotIds };
}

function playerForSummoner(map: RosterPlayerMap, summonerName: string | null, tag: string | null = null): RosterPlayer | null {
  if (!summonerName) return null;
  const playerByName = map.byName.get(normalizeCanonicalName(summonerName)) ?? null;
  if (!tag?.trim()) return playerByName;
  const playerByRiotId = map.byRiotId.get(riotIdKey(summonerName, tag));
  if (playerByRiotId !== undefined) return playerByRiotId;
  return playerByName && !map.playerIdsWithRiotIds.has(playerByName.id) ? playerByName : null;
}

function draftSide(value: string | null | undefined): DraftSide | null {
  const normalized = value?.trim().toLocaleLowerCase();
  return normalized === "blue" || normalized === "red" ? normalized : null;
}

/** Preserve the raw ingested game rows needed for scope-aware regular scouting. */
export function buildIngestedScoutingGames(
  roster: RosterPlayer[],
  rows: IngestedScoutingGameRow[],
  fixtureIdsByMatchId: ReadonlyMap<string, string | IngestedMatchReference> = new Map(),
): IngestedScoutingGame[] {
  const rosterByName = rosterPlayerMap(roster);
  return rows.flatMap((row) => {
    const player = playerForSummoner(rosterByName, row.summoner_name, row.tag);
    if (!player || !row.champion) return [];
    const reference = row.match_id ? fixtureIdsByMatchId.get(row.match_id) : undefined;
    const fixtureId = typeof reference === "string" ? reference : reference?.fixtureId ?? null;
    const gameNumber = typeof reference === "string" ? undefined : reference?.gameNumber ?? undefined;
    const teamSide = draftSide(row.team_side);
    return [{
      playerId: player.id,
      playerName: player.displayName.trim(),
      role: player.role,
      champion: row.champion,
      fixtureId,
      season: row.season,
      matchId: row.match_id ?? `${row.season ?? "unknown"}:${row.game_date ?? row.id ?? "unknown"}:${row.summoner_name ?? "unknown"}`,
      gameDate: row.game_date,
      ...(gameNumber === undefined ? {} : { gameNumber }),
      ...(teamSide ? { teamSide } : {}),
    }];
  });
}

/** Match all available in-house rows to the current roster and group picks by champion. */
export function buildInhousePlayerStats(roster: RosterPlayer[], rows: InhouseGameRow[]): InhousePlayerStats[] {
  const rowsByPlayer = new Map<string, InhouseGameRow[]>();
  const rosterByName = rosterPlayerMap(roster);

  for (const row of rows) {
    const player = playerForSummoner(rosterByName, row.summoner_name);
    if (!player) continue;
    rowsByPlayer.set(player.id, [...(rowsByPlayer.get(player.id) ?? []), row]);
  }

  return roster.map((player) => {
    const playerRows = rowsByPlayer.get(player.id) ?? [];
    const groups = new Map<string, { games: number; wins: number; kills: number; deaths: number; assists: number }>();
    for (const row of playerRows) {
      if (!row.champion) continue;
      const group = groups.get(row.champion) ?? { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
      group.games += 1;
      group.wins += row.win ? 1 : 0;
      group.kills += row.kills;
      group.deaths += row.deaths;
      group.assists += row.assists;
      groups.set(row.champion, group);
    }

    const champions = [...groups.entries()]
      .map(([champion, group]) => ({
        champion,
        games: group.games,
        wins: group.wins,
        winrate_pct: Number((100 * group.wins / group.games).toFixed(1)),
        avg_kda: Number(((group.kills + group.assists) / Math.max(group.deaths, 1)).toFixed(2)),
      }))
      .sort((a, b) => b.games - a.games || b.winrate_pct - a.winrate_pct || a.champion.localeCompare(b.champion));

    return { playerId: player.id, playerName: player.displayName.trim(), role: player.role, games: playerRows.length, champions };
  });
}
