import { ROLE_LABELS, ROLE_ORDER, type LolRole } from "@/lib/draft/types";
import { deriveScoutData, scoutKey } from "@/lib/scouting/derive";
import type { InhousePlayerStats } from "@/lib/scouting/inhouse";
import type { ChampionCount, ScoutScope, ScoutSource } from "@/lib/scouting/types";

export interface BroadcasterMatchupPlayer {
  id: string;
  name: string;
  role: LolRole;
  champions: ChampionCount[];
  totalPicks: number;
  distinctChampions: number;
  gamesSampled: number;
  inhouse: InhousePlayerStats | null;
}

export interface BroadcasterRoleMatchup {
  role: LolRole;
  label: string;
  teamAPlayers: BroadcasterMatchupPlayer[];
  teamBPlayers: BroadcasterMatchupPlayer[];
}

function playersFor(source: ScoutSource, scope: ScoutScope): BroadcasterMatchupPlayer[] {
  const data = deriveScoutData(source, scope, { playerLimit: null });
  const pools = new Map(data.playerPools.map((pool) => [scoutKey(pool.playerName), pool]));
  const inhouse = new Map((source.inhousePlayerStats ?? []).map((row) => [row.playerId, row]));

  return source.roster.map((player) => {
    const pool = pools.get(scoutKey(player.displayName));
    return {
      id: player.id,
      name: player.displayName,
      role: player.role,
      champions: pool?.champions.slice(0, 5) ?? [],
      totalPicks: pool?.totalPicks ?? 0,
      distinctChampions: pool?.distinctChampions ?? 0,
      gamesSampled: pool?.gamesSampled ?? 0,
      inhouse: inhouse.get(player.id) ?? null,
    };
  });
}

export function deriveBroadcasterMatchups(
  teamA: ScoutSource,
  teamB: ScoutSource,
  scope: ScoutScope,
): BroadcasterRoleMatchup[] {
  const teamAPlayers = playersFor(teamA, scope);
  const teamBPlayers = playersFor(teamB, scope);
  const byName = (a: BroadcasterMatchupPlayer, b: BroadcasterMatchupPlayer) => a.name.localeCompare(b.name);

  return ROLE_ORDER.map((role) => ({
    role,
    label: ROLE_LABELS[role],
    teamAPlayers: teamAPlayers.filter((player) => player.role === role).sort(byName),
    teamBPlayers: teamBPlayers.filter((player) => player.role === role).sort(byName),
  }));
}
