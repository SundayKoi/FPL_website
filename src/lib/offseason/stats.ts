// The event's stats: every player's numbers over the whole event or one
// week, the category leaders, and the best single games. Built from the
// ingested rows as the view holds them, so a sub's games already count for
// the player they replaced (subs.ts).

import { cardPlayerKey } from "@/lib/cards/cardKeys";
import type { LolRole } from "@/lib/draft/types";
import { entrantKey, type OffseasonStatRow } from "./ratings";
import { playerRecords } from "./standings";
import type { OffseasonView } from "./view";

/** A player's games summed into per-game and per-minute numbers. */
export interface StatLine {
  games: number;
  wins: number;
  losses: number;
  /** Per game. */
  kills: number;
  deaths: number;
  assists: number;
  /** (kills + assists) / deaths, deaths counted as at least one. */
  kda: number;
  csPerMin: number | null;
  damagePerMin: number | null;
  visionPerMin: number | null;
  /** Average kill participation, in percent. */
  killParticipation: number | null;
  /** Most played first. */
  champions: string[];
}

const perMinute = (total: number, minutes: number) => (minutes > 0 ? total / minutes : null);

/** One player's rows as a line. Wins and losses here are the rows' own. */
export function summarizeRows(rows: OffseasonStatRow[]): StatLine {
  const sum = (pick: (row: OffseasonStatRow) => number | null | undefined) => rows.reduce((total, row) => total + (Number(pick(row)) || 0), 0);
  const games = rows.length;
  const minutes = sum((row) => row.game_duration_min);
  const kills = sum((row) => row.kills);
  const deaths = sum((row) => row.deaths);
  const assists = sum((row) => row.assists);
  const participation = rows.filter((row) => row.kill_participation_pct != null);
  const played = new Map<string, number>();
  for (const row of rows) if (row.champion) played.set(row.champion, (played.get(row.champion) ?? 0) + 1);
  return {
    games,
    wins: rows.filter((row) => row.win).length,
    losses: rows.filter((row) => row.win === false).length,
    kills: games ? kills / games : 0,
    deaths: games ? deaths / games : 0,
    assists: games ? assists / games : 0,
    kda: (kills + assists) / Math.max(deaths, 1),
    csPerMin: perMinute(sum((row) => row.cs), minutes),
    damagePerMin: perMinute(sum((row) => row.total_damage_to_champions), minutes),
    visionPerMin: perMinute(sum((row) => row.vision_score), minutes),
    killParticipation: participation.length
      ? participation.reduce((total, row) => total + Number(row.kill_participation_pct), 0) / participation.length
      : null,
    champions: [...played].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([champion]) => champion),
  };
}

/** The event's rows, or one week's (by week number). */
export function rowsOf(view: OffseasonView, weekNumber: number | null): OffseasonStatRow[] {
  if (weekNumber === null) {
    const riotIds = new Set(view.games.flatMap((game) => (game.riot_match_id ? [game.riot_match_id] : [])));
    return view.stats.filter((row) => riotIds.has(row.match_id));
  }
  const week = view.weeks.find((candidate) => candidate.week_number === weekNumber);
  if (!week) return [];
  const matchIds = new Set(view.matches.filter((match) => match.week_id === week.id).map((match) => match.id));
  const riotIds = new Set(view.games.filter((game) => matchIds.has(game.match_id) && game.riot_match_id).map((game) => game.riot_match_id!));
  return view.stats.filter((row) => riotIds.has(row.match_id));
}

/** One row of the stats table. Plain data, for the client. */
export interface PlayerStats {
  entrantId: string;
  name: string;
  role: LolRole | null;
  /** That week's team, when the table is one week. */
  team: string | null;
  overall: number | null;
  /** The record from game results, as everywhere else (standings.ts). */
  wins: number;
  losses: number;
  line: StatLine;
}

/** Every player with an ingested game in the event, or in one week. */
export function playerStats(view: OffseasonView, weekNumber: number | null): PlayerStats[] {
  const rows = rowsOf(view, weekNumber);
  const byKey = new Map<string, OffseasonStatRow[]>();
  for (const row of rows) {
    const key = cardPlayerKey(row.summoner_name, row.tag);
    byKey.set(key, [...(byKey.get(key) ?? []), row]);
  }
  const week = weekNumber === null ? null : (view.weeks.find((candidate) => candidate.week_number === weekNumber) ?? null);
  const weekTeams = week ? view.teams.filter((team) => team.week_id === week.id) : [];
  const weekMembers = view.members.filter((member) => weekTeams.some((team) => team.id === member.team_id));
  const weekRecords = week
    ? playerRecords(
        weekMembers,
        view.matches.filter((match) => match.week_id === week.id),
        view.games,
      )
    : null;

  return view.entrants.flatMap((entrant) => {
    const key = entrantKey(entrant.riot_id);
    const own = key ? byKey.get(key) : undefined;
    if (!own?.length) return [];
    const rating = view.ratings.get(entrant.id);
    const member = weekMembers.find((candidate) => candidate.entrant_id === entrant.id);
    const record = weekRecords ? (weekRecords.get(entrant.id) ?? { wins: 0, losses: 0 }) : { wins: rating?.wins ?? 0, losses: rating?.losses ?? 0 };
    return [
      {
        entrantId: entrant.id,
        name: entrant.display_name,
        role: member?.role ?? entrant.assigned_role ?? entrant.primary_role,
        team: member ? (view.teamsById.get(member.team_id)?.name ?? null) : null,
        overall: week ? (rating?.weekly.find((line) => line.week === week.week_number)?.overall ?? null) : (rating?.overall ?? null),
        wins: record.wins,
        losses: record.losses,
        line: summarizeRows(own),
      },
    ];
  });
}

export type LeaderStat = "kda" | "damagePerMin" | "csPerMin" | "visionPerMin";

export const LEADER_LABELS: Record<LeaderStat, string> = {
  kda: "KDA",
  damagePerMin: "Damage / min",
  csPerMin: "CS / min",
  visionPerMin: "Vision / min",
};

/**
 * The top three in each headline category. Over the whole event a player
 * needs two games to qualify, so one big game doesn't top a board.
 */
export function leaders(players: PlayerStats[], minGames: number): Record<LeaderStat, PlayerStats[]> {
  const most = Math.max(0, ...players.map((player) => player.line.games));
  const eligible = players.filter((player) => player.line.games >= Math.min(minGames, most));
  const top = (stat: LeaderStat) =>
    eligible
      .filter((player) => player.line[stat] != null)
      .sort((a, b) => (b.line[stat] ?? 0) - (a.line[stat] ?? 0) || a.name.localeCompare(b.name))
      .slice(0, 3);
  return { kda: top("kda"), damagePerMin: top("damagePerMin"), csPerMin: top("csPerMin"), visionPerMin: top("visionPerMin") };
}

/** One great game. Plain data, for the page. */
export interface GameHighlight {
  entrantId: string;
  name: string;
  champion: string | null;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  weekNumber: number | null;
  /** Who really played it, when a sub did. */
  playedBy: string | null;
}

/** The best single games by kills and by KDA, five of each. */
export function bestGames(view: OffseasonView, weekNumber: number | null): { kills: GameHighlight[]; kda: GameHighlight[] } {
  const entrantOf = new Map(view.entrants.flatMap((entrant) => {
    const key = entrantKey(entrant.riot_id);
    return key ? [[key, entrant] as const] : [];
  }));
  const weekOf = new Map<string, number>();
  for (const game of view.games) {
    const match = view.matches.find((candidate) => candidate.id === game.match_id);
    const week = match ? view.weekById.get(match.week_id) : undefined;
    if (game.riot_match_id && week) weekOf.set(game.riot_match_id, week.week_number);
  }
  const games = rowsOf(view, weekNumber).flatMap((row) => {
    const entrant = entrantOf.get(cardPlayerKey(row.summoner_name, row.tag));
    if (!entrant) return [];
    const kills = Number(row.kills) || 0;
    const deaths = Number(row.deaths) || 0;
    const assists = Number(row.assists) || 0;
    return [{
      entrantId: entrant.id,
      name: entrant.display_name,
      champion: row.champion,
      kills,
      deaths,
      assists,
      kda: (kills + assists) / Math.max(deaths, 1),
      weekNumber: weekOf.get(row.match_id) ?? null,
      playedBy: row.played_by ?? null,
    }];
  });
  return {
    kills: [...games].sort((a, b) => b.kills - a.kills || b.kda - a.kda).slice(0, 5),
    kda: [...games].sort((a, b) => b.kda - a.kda || b.kills - a.kills).slice(0, 5),
  };
}
