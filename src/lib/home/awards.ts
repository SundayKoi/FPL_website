import { createServerSupabase } from "@/lib/supabase/server";
import { fetchDraftId } from "./fetchDraftId";

/** Premier's season code. Academy passes its own (see lib/league/season.ts). */
export const PREMIER_SEASON = "S5" as const;
const MIN_PLAYER_GAMES = 2;
const MIN_CHAMPION_PICKS = 2;

export type HomepageRawStatRow = {
  game_date: string | null;
  match_id: string;
  team_side: string | null;
  team_name: string | null;
  summoner_name: string | null;
  tag: string | null;
  champion: string | null;
  role: string | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  kill_participation_pct: number | null;
  total_damage_to_champions: number | null;
  win: boolean | null;
  season: string | null;
  game_duration_min: number | null;
  team_dragons: number | null;
  team_barons: number | null;
  team_first_blood: boolean | null;
  team_first_tower: boolean | null;
};

export type HomepageAward = {
  title: string;
  name: string | null;
  tag: string | null;
  teamName: string | null;
  detail: string;
  value: string;
};

export type HomepageAwardsData = {
  season: string;
  periodLabel: string;
  playerOfWeek: HomepageAward;
  teamOfWeek: HomepageAward;
  individualAwards: HomepageAward[];
  teamAwards: HomepageAward[];
};

const RAW_COLUMNS = [
  "game_date",
  "match_id",
  "team_side",
  "team_name",
  "summoner_name",
  "tag",
  "champion",
  "role",
  "kills",
  "deaths",
  "assists",
  "kill_participation_pct",
  "total_damage_to_champions",
  "win",
  "season",
  "game_duration_min",
  "team_dragons",
  "team_barons",
  "team_first_blood",
  "team_first_tower",
].join(",");

type Week = { start: number; label: string };

type TeamGame = {
  teamName: string;
  matchId: string;
  gameDate: string;
  week: Week;
  win: boolean;
  teamKills: number;
  dragons: number;
  barons: number;
  firstBlood: boolean;
  firstTower: boolean;
};

type PlayerAggregate = {
  name: string;
  tag: string;
  teamName: string;
  role: string;
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  kp: number;
  damage: number;
  duration: number;
};

type TeamAggregate = {
  teamName: string;
  games: number;
  wins: number;
  losses: number;
  winrate: number;
  avgKills: number;
};

function numberValue(value: number | null): number {
  return value ?? 0;
}

function round(value: number, places = 1): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function playerKey(name: string, tag: string): string {
  return `${name}#${tag}`;
}

function weekFor(date: string): Week {
  const latest = new Date(date);
  const daysSinceMonday = (latest.getUTCDay() + 6) % 7;
  const start = new Date(latest);
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  start.setUTCHours(0, 0, 0, 0);
  return {
    start: start.getTime(),
    label: `Week of ${start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`,
  };
}

function rowsForSeason(rows: HomepageRawStatRow[], season: string): HomepageRawStatRow[] {
  return rows.filter((row) => row.season === season && row.game_date && row.team_name);
}

function latestWeek(rows: HomepageRawStatRow[]): Week | null {
  const latestDate = rows
    .map((row) => row.game_date)
    .filter((date): date is string => Boolean(date))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  return latestDate ? weekFor(latestDate) : null;
}

function rowsForWeek(rows: HomepageRawStatRow[], weekStart: number): HomepageRawStatRow[] {
  return rows.filter((row) => row.game_date && weekFor(row.game_date).start === weekStart);
}

function chooseTeamGames(rows: HomepageRawStatRow[]): TeamGame[] {
  const grouped = new Map<string, HomepageRawStatRow[]>();
  for (const row of rows) {
    if (!row.team_name || !row.game_date) continue;
    const key = `${row.match_id}|${row.team_name}`;
    const group = grouped.get(key);
    if (group) group.push(row);
    else grouped.set(key, [row]);
  }

  const games: TeamGame[] = [];
  for (const group of grouped.values()) {
    const bySide = new Map<string, HomepageRawStatRow[]>();
    for (const row of group) {
      const side = row.team_side ?? "unknown";
      const sideRows = bySide.get(side);
      if (sideRows) sideRows.push(row);
      else bySide.set(side, [row]);
    }
    const ranked = [...bySide.entries()].sort((a, b) => b[1].length - a[1].length);
    if (ranked.length === 0 || (ranked[1] && ranked[0][1].length === ranked[1][1].length)) continue;
    const sideRows = ranked[0][1];
    const first = sideRows[0];
    games.push({
      teamName: group[0].team_name!,
      matchId: group[0].match_id,
      gameDate: first.game_date!,
      week: weekFor(first.game_date!),
      win: Boolean(sideRows.find((row) => row.win)?.win),
      teamKills: sideRows.reduce((sum, row) => sum + numberValue(row.kills), 0),
      dragons: Math.max(...sideRows.map((row) => numberValue(row.team_dragons))),
      barons: Math.max(...sideRows.map((row) => numberValue(row.team_barons))),
      firstBlood: sideRows.some((row) => row.team_first_blood),
      firstTower: sideRows.some((row) => row.team_first_tower),
    });
  }
  return games;
}

function aggregateTeams(games: TeamGame[]): TeamAggregate[] {
  const grouped = new Map<string, TeamGame[]>();
  for (const game of games) {
    const group = grouped.get(game.teamName);
    if (group) group.push(game);
    else grouped.set(game.teamName, [game]);
  }
  return [...grouped.entries()].map(([teamName, teamGames]) => {
    const wins = teamGames.filter((game) => game.win).length;
    return {
      teamName,
      games: teamGames.length,
      wins,
      losses: teamGames.length - wins,
      winrate: round((100 * wins) / teamGames.length),
      avgKills: round(teamGames.reduce((sum, game) => sum + game.teamKills, 0) / teamGames.length, 1),
    };
  });
}

function aggregatePlayers(rows: HomepageRawStatRow[]): PlayerAggregate[] {
  const grouped = new Map<string, HomepageRawStatRow[]>();
  for (const row of rows) {
    if (!row.summoner_name || !row.tag || !row.team_name) continue;
    const key = playerKey(row.summoner_name, row.tag);
    const group = grouped.get(key);
    if (group) group.push(row);
    else grouped.set(key, [row]);
  }

  return [...grouped.values()].map((group) => {
    const first = group[0];
    return {
      name: first.summoner_name!,
      tag: first.tag!,
      teamName: first.team_name!,
      role: first.role ?? "UNKNOWN",
      games: group.length,
      wins: group.filter((row) => row.win).length,
      kills: group.reduce((sum, row) => sum + numberValue(row.kills), 0),
      deaths: group.reduce((sum, row) => sum + numberValue(row.deaths), 0),
      assists: group.reduce((sum, row) => sum + numberValue(row.assists), 0),
      kp: group.reduce((sum, row) => sum + numberValue(row.kill_participation_pct), 0),
      damage: group.reduce((sum, row) => sum + numberValue(row.total_damage_to_champions), 0),
      duration: group.reduce((sum, row) => sum + numberValue(row.game_duration_min), 0),
    };
  });
}

function playerPower(player: PlayerAggregate): number {
  const kda = (player.kills + player.assists) / Math.max(player.deaths, 1);
  const winrate = (100 * player.wins) / player.games;
  const avgKp = player.kp / player.games;
  const damagePerMinute = player.damage / Math.max(player.duration, 1);
  const avgKills = player.kills / player.games;
  return round(
    0.3 * winrate +
      0.25 * clamp((kda / 6) * 100, 0, 100) +
      0.2 * clamp((damagePerMinute / 800) * 100, 0, 100) +
      0.15 * avgKp +
      0.1 * clamp((avgKills / 10) * 100, 0, 100),
  );
}

function playerAward(title: string, player: PlayerAggregate | null, value: string, detail: string): HomepageAward {
  return {
    title,
    name: player?.name ?? null,
    tag: player?.tag ?? null,
    teamName: player?.teamName ?? null,
    detail,
    value,
  };
}

function teamAward(title: string, team: TeamAggregate | null, value: string, detail: string): HomepageAward {
  return {
    title,
    name: null,
    tag: null,
    teamName: team?.teamName ?? null,
    detail,
    value,
  };
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return Number.POSITIVE_INFINITY;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

export function deriveHomepageAwards(
  inputRows: HomepageRawStatRow[],
  prices: Map<string, number>,
  season: string = PREMIER_SEASON,
): HomepageAwardsData {
  const rows = rowsForSeason(inputRows, season);
  const latest = latestWeek(rows);
  const latestRows = latest ? rowsForWeek(rows, latest.start) : [];
  const previousRows = latest ? rowsForWeek(rows, latest.start - 7 * 24 * 60 * 60 * 1000) : [];
  const games = chooseTeamGames(rows);
  const latestGames = latest ? games.filter((game) => game.week.start === latest.start) : [];
  const previousGames = latest ? games.filter((game) => game.week.start === latest.start - 7 * 24 * 60 * 60 * 1000) : [];
  const latestPlayers = aggregatePlayers(latestRows).filter((player) => player.games >= MIN_PLAYER_GAMES);
  const seasonPlayers = aggregatePlayers(rows).filter((player) => player.games >= MIN_PLAYER_GAMES);
  const latestTeams = aggregateTeams(latestGames);
  const previousTeams = aggregateTeams(previousGames);
  const seasonTeams = aggregateTeams(games);
  const bestOverall = [...seasonTeams].sort((a, b) => b.winrate - a.winrate || b.wins - a.wins)[0] ?? null;
  const latestChampionGroups = new Map<string, HomepageRawStatRow[]>();
  for (const row of latestRows) {
    if (!row.champion) continue;
    const group = latestChampionGroups.get(row.champion);
    if (group) group.push(row);
    else latestChampionGroups.set(row.champion, [row]);
  }

  const playerOfWeek = [...latestPlayers].sort((a, b) => playerPower(b) - playerPower(a))[0] ?? null;
  const teamOfWeek = [...latestTeams].sort((a, b) => b.winrate - a.winrate || b.wins - a.wins || b.avgKills - a.avgKills)[0] ?? null;
  const championOfWeek = [...latestChampionGroups.entries()]
    .map(([champion, championRows]) => ({
      champion,
      picks: championRows.length,
      wins: championRows.filter((row) => row.win).length,
      kda:
        (championRows.reduce((sum, row) => sum + numberValue(row.kills) + numberValue(row.assists), 0) /
          Math.max(championRows.reduce((sum, row) => sum + numberValue(row.deaths), 0), 1)),
    }))
    .filter((champion) => champion.picks >= MIN_CHAMPION_PICKS)
    .sort((a, b) => b.wins / b.picks - a.wins / a.picks || b.picks - a.picks || b.kda - a.kda)[0];

  const bestValue = [...seasonPlayers]
    .map((player) => ({
      player,
      price: prices.get(playerKey(player.name, player.tag)) ?? prices.get(player.name) ?? 0,
    }))
    .filter(({ price }) => price > 0)
    .map(({ player, price }) => ({ player, price, index: playerPower(player) / price }))
    .sort((a, b) => b.index - a.index)[0];

  const previousPower = new Map(
    aggregatePlayers(previousRows)
      .filter((player) => player.games >= MIN_PLAYER_GAMES)
      .map((player) => [playerKey(player.name, player.tag), playerPower(player)]),
  );
  const biggestRiser = [...latestPlayers]
    .map((player) => ({ player, change: playerPower(player) - (previousPower.get(playerKey(player.name, player.tag)) ?? 0) }))
    .filter(({ change }) => change > 0)
    .sort((a, b) => b.change - a.change)[0];
  const playmaker = [...latestPlayers]
    .sort((a, b) => b.kp / b.games - a.kp / a.games || playerPower(b) - playerPower(a))[0] ?? null;

  const previousTeamMap = new Map(previousTeams.map((team) => [team.teamName, team]));
  const mostImproved = [...latestTeams]
    .map((team) => ({ team, change: team.winrate - (previousTeamMap.get(team.teamName)?.winrate ?? 0) }))
    .sort((a, b) => b.change - a.change || b.team.wins - a.team.wins)[0]?.team ?? null;
  const weeklyRates = new Map<string, number[]>();
  for (const game of games) {
    const group = weeklyRates.get(`${game.teamName}|${game.week.start}`);
    if (group) group.push(game.win ? 100 : 0);
    else weeklyRates.set(`${game.teamName}|${game.week.start}`, [game.win ? 100 : 0]);
  }
  const reliability = seasonTeams
    .map((team) => {
      const rates = [...weeklyRates.entries()]
        .filter(([key]) => key.startsWith(`${team.teamName}|`))
        .map(([, values]) => values.reduce((sum, value) => sum + value, 0) / values.length);
      return { team, deviation: rates.length >= 2 ? standardDeviation(rates) : Number.POSITIVE_INFINITY };
    })
    .sort((a, b) => a.deviation - b.deviation || b.team.winrate - a.team.winrate)[0]?.team ?? null;

  const noWinner = (title: string, detail: string): HomepageAward => playerAward(title, null, "—", detail);

  return {
    season,
    periodLabel: latest?.label ?? season,
    playerOfWeek: playerAward(
      "Player of the Week",
      playerOfWeek,
      playerOfWeek ? String(playerPower(playerOfWeek)) : "—",
      playerOfWeek ? `${playerOfWeek.teamName} · ${playerOfWeek.role} · ${playerOfWeek.games} games` : `${season} player data unavailable`,
    ),
    teamOfWeek: teamAward(
      "Team of the Week",
      teamOfWeek,
      teamOfWeek ? `${teamOfWeek.wins}–${teamOfWeek.losses}` : "—",
      teamOfWeek ? `${teamOfWeek.winrate}% weekly win rate` : `${season} team data unavailable`,
    ),
    individualAwards: [
      championOfWeek
        ? {
            title: "Champion of the Week",
            name: championOfWeek.champion,
            tag: null,
            teamName: null,
            detail: `${championOfWeek.picks} picks · ${round((100 * championOfWeek.wins) / championOfWeek.picks)}% win rate`,
            value: `${round((100 * championOfWeek.wins) / championOfWeek.picks)}%`,
          }
        : noWinner("Champion of the Week", "Champion data unavailable"),
      bestValue
        ? playerAward(
            "Best Value Pick",
            bestValue.player,
            `${round(bestValue.index, 1)}×`,
            `${playerPower(bestValue.player)} power · ${bestValue.price} points`,
          )
        : noWinner("Best Value Pick", "Requires a positive stored roster price"),
      biggestRiser
        ? playerAward("Biggest Riser", biggestRiser.player, `+${round(biggestRiser.change)}`, "Week-over-week power score change")
        : noWinner("Biggest Riser", "Previous-week comparison unavailable"),
      playmaker
        ? playerAward("Playmaker", playmaker, `${round(playmaker.kp / playmaker.games)}%`, "Highest kill participation this week")
        : noWinner("Playmaker", "Player data unavailable"),
    ],
    teamAwards: [
      teamAward("Best Overall", bestOverall, bestOverall ? `${bestOverall.winrate}%` : "—", "Season-to-date performance leader"),
      teamAward("Most Improved", mostImproved, mostImproved ? `+${round(mostImproved.winrate - (previousTeamMap.get(mostImproved.teamName)?.winrate ?? 0))}` : "—", "Largest rise since the previous week"),
      teamAward("Most Reliable", reliability, reliability ? `${reliability.winrate}%` : "—", "Lowest weekly win-rate volatility"),
      teamAward("Team of the Week", teamOfWeek, teamOfWeek ? `${teamOfWeek.winrate}%` : "—", "Best record during the latest week"),
    ],
  };
}

/**
 * One season's raw stat rows, optionally narrowed to a set of team names —
 * Academy and Premier share the raw_stats table, and while their season codes
 * already separate them, the team filter keeps a mislabelled row out of the
 * wrong league's homepage.
 */
export async function fetchHomepageRawStats(
  season: string = PREMIER_SEASON,
  teamNames?: string[],
): Promise<HomepageRawStatRow[]> {
  if (teamNames && teamNames.length === 0) return [];
  const supabase = await createServerSupabase();
  let query = supabase.from("raw_stats").select(RAW_COLUMNS).eq("season", season);
  if (teamNames?.length) query = query.in("team_name", teamNames);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown) as HomepageRawStatRow[];
}

async function fetchHomepagePrices(draftColumn: "featured_draft_id" | "academy_draft_id"): Promise<Map<string, number>> {
  const supabase = await createServerSupabase();
  // A settings failure just means no prices, so the error is swallowed here.
  const draftId = await fetchDraftId(supabase, draftColumn).catch(() => null);
  if (!draftId) return new Map();
  const { data } = await supabase.from("players").select("display_name, price").eq("draft_id", draftId);
  return new Map(
    ((data ?? []) as Array<{ display_name: string; price: number | null }>).map((player) => [
      player.display_name,
      player.price ?? 0,
    ]),
  );
}

export async function fetchHomepageAwards(
  season: string = PREMIER_SEASON,
  teamNames?: string[],
  draftColumn: "featured_draft_id" | "academy_draft_id" = "featured_draft_id",
): Promise<HomepageAwardsData> {
  let rows: HomepageRawStatRow[];
  try {
    rows = await fetchHomepageRawStats(season, teamNames);
  } catch {
    rows = [];
  }

  let prices = new Map<string, number>();
  try {
    prices = await fetchHomepagePrices(draftColumn);
  } catch {
    prices = new Map();
  }
  return deriveHomepageAwards(rows, prices, season);
}
