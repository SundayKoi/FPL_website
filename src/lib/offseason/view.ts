// The event, indexed and rated, as every offseason page reads it.

import { rateEntrants, type EntrantRating, type OffseasonStatRow } from "./ratings";
import { attributeSubs, type SubAppearance } from "./subs";
import type {
  OffseasonEntrant,
  OffseasonEventData,
  OffseasonGame,
  OffseasonMatch,
  OffseasonTeam,
  OffseasonTeamMember,
  OffseasonWeek,
} from "./types";

export interface OffseasonView extends OffseasonEventData {
  /** Every ingested row of the event's games, subs' rows credited to the player they replaced. */
  stats: OffseasonStatRow[];
  /** Every game a sub played in a rostered player's place. */
  subs: SubAppearance[];
  ratings: Map<string, EntrantRating>;
  entrantsById: Map<string, OffseasonEntrant>;
  teamsById: Map<string, OffseasonTeam>;
  membersByTeam: Map<string, OffseasonTeamMember[]>;
  gamesByMatch: Map<string, OffseasonGame[]>;
  weekById: Map<string, OffseasonWeek>;
  /** The newest week, or null before week 1 opens. */
  currentWeek: OffseasonWeek | null;
  /** The final's winner, once it is played. */
  champion: OffseasonTeam | null;
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export function buildOffseasonView(data: OffseasonEventData, ingested: OffseasonStatRow[]): OffseasonView {
  const { rows, subs } = attributeSubs(data, ingested);
  const weekById = new Map(data.weeks.map((week) => [week.id, week]));
  const matchById = new Map(data.matches.map((match) => [match.id, match]));
  const weekOfMatch = new Map<string, number>();
  for (const game of data.games) {
    const week = weekById.get(matchById.get(game.match_id)?.week_id ?? "");
    if (game.riot_match_id && week) weekOfMatch.set(game.riot_match_id, week.week_number);
  }

  const teamsById = new Map(data.teams.map((team) => [team.id, team]));
  const final = data.matches.find((match: OffseasonMatch) => match.stage === "final" && match.winner_team_id);
  const currentWeek = [...data.weeks].sort((a, b) => b.week_number - a.week_number)[0] ?? null;

  return {
    ...data,
    stats: rows,
    subs,
    ratings: rateEntrants({
      entrants: data.entrants,
      rows,
      weekOfMatch,
      yardstickSeason: data.event.yardstick_season,
    }),
    entrantsById: new Map(data.entrants.map((entrant) => [entrant.id, entrant])),
    teamsById,
    membersByTeam: groupBy(data.members, (member) => member.team_id),
    gamesByMatch: groupBy(data.games, (game) => game.match_id),
    weekById,
    currentWeek,
    champion: final ? teamsById.get(final.winner_team_id!) ?? null : null,
  };
}
