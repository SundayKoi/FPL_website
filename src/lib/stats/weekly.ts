import { createServerSupabase } from "@/lib/supabase/server";
import { powerRanking } from "./formulas";
import type { PlayerAggRow, RankedPlayer } from "./types";

const HOMEPAGE_SEASON = "S5" as const;

export type WeeklyStandout = RankedPlayer;

export type WeeklyRawStatRow = {
  game_date?: string | null;
  assists: number | null;
  cs: number | null;
  cs_at_10: number | null;
  cs_per_min: number | null;
  damage_per_min: number | null;
  damage_share_pct: number | null;
  damage_taken_per_min: number | null;
  deaths: number | null;
  double_kills: number | null;
  first_blood_assist: boolean | null;
  first_blood_kill: boolean | null;
  game_duration_min: number | null;
  gold_at_10: number | null;
  gold_earned: number | null;
  gold_per_min: number | null;
  kda_challenges: number | null;
  kill_participation_pct: number | null;
  kills: number | null;
  penta_kills: number | null;
  quadra_kills: number | null;
  role: string | null;
  season: string | null;
  season_phase: string | null;
  solo_kills: number | null;
  summoner_name: string | null;
  tag: string | null;
  total_damage_to_champions: number | null;
  triple_kills: number | null;
  turret_plates_destroyed: number | null;
  vision_score: number | null;
  vision_score_per_min: number | null;
  win: boolean | null;
  xp_at_10: number | null;
};

const RAW_WEEKLY_COLUMNS = [
  "assists",
  "cs",
  "cs_at_10",
  "cs_per_min",
  "damage_per_min",
  "damage_share_pct",
  "damage_taken_per_min",
  "deaths",
  "double_kills",
  "first_blood_assist",
  "first_blood_kill",
  "game_duration_min",
  "gold_at_10",
  "gold_earned",
  "gold_per_min",
  "kda_challenges",
  "kill_participation_pct",
  "kills",
  "penta_kills",
  "quadra_kills",
  "role",
  "season",
  "season_phase",
  "solo_kills",
  "summoner_name",
  "tag",
  "total_damage_to_champions",
  "triple_kills",
  "turret_plates_destroyed",
  "vision_score",
  "vision_score_per_min",
  "win",
  "xp_at_10",
].join(",");

function num(value: number | null): number {
  return value ?? 0;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function avg(rows: WeeklyRawStatRow[], pick: (row: WeeklyRawStatRow) => number | null): number {
  return round2(rows.reduce((sum, row) => sum + num(pick(row)), 0) / rows.length);
}

function perMinute(
  rows: WeeklyRawStatRow[],
  pick: (row: WeeklyRawStatRow) => number | null,
): number {
  const duration = rows.reduce((sum, row) => sum + num(row.game_duration_min), 0);
  if (duration <= 0) return 0;
  return round2(rows.reduce((sum, row) => sum + num(pick(row)), 0) / duration);
}

function sum(rows: WeeklyRawStatRow[], pick: (row: WeeklyRawStatRow) => number | null): number {
  return rows.reduce((total, row) => total + num(pick(row)), 0);
}

function roleMode(rows: WeeklyRawStatRow[]): string {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const role = row.role ?? "UNKNOWN";
    counts.set(role, (counts.get(role) ?? 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "UNKNOWN";
}

export function aggregateWeeklyPlayerRows(rows: WeeklyRawStatRow[]): PlayerAggRow[] {
  const groups = new Map<string, WeeklyRawStatRow[]>();

  for (const row of rows) {
    if (!row.summoner_name || !row.tag) continue;
    const key = `${row.summoner_name}#${row.tag}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  return [...groups.values()].map((group) => {
    const first = group[0];
    const games = group.length;
    const wins = group.filter((row) => row.win).length;
    const kills = sum(group, (row) => row.kills);
    const deaths = sum(group, (row) => row.deaths);
    const assists = sum(group, (row) => row.assists);

    return {
      summoner_name: first.summoner_name ?? "",
      tag: first.tag ?? "",
      season: first.season ?? "",
      season_phase: first.season_phase ?? "",
      role_mode: roleMode(group),
      games,
      wins,
      winrate_pct: round1((wins / games) * 100),
      avg_kills: avg(group, (row) => row.kills),
      avg_deaths: avg(group, (row) => row.deaths),
      avg_assists: avg(group, (row) => row.assists),
      kda: round2((kills + assists) / Math.max(deaths, 1)),
      avg_kp_pct: avg(group, (row) => row.kill_participation_pct),
      avg_cs_per_min: perMinute(group, (row) => row.cs),
      avg_gold_per_min: perMinute(group, (row) => row.gold_earned),
      avg_dmg_per_min: perMinute(group, (row) => row.total_damage_to_champions),
      avg_dmg_share_pct: avg(group, (row) => row.damage_share_pct),
      avg_vision_per_min: perMinute(group, (row) => row.vision_score),
      avg_solo_kills: avg(group, (row) => row.solo_kills),
      total_solo_kills: sum(group, (row) => row.solo_kills),
      total_plates: sum(group, (row) => row.turret_plates_destroyed),
      total_doubles: sum(group, (row) => row.double_kills),
      total_triples: sum(group, (row) => row.triple_kills),
      total_quadras: sum(group, (row) => row.quadra_kills),
      total_pentas: sum(group, (row) => row.penta_kills),
      avg_cs_at_10: avg(group, (row) => row.cs_at_10),
      avg_gold_at_10: avg(group, (row) => row.gold_at_10),
      avg_xp_at_10: avg(group, (row) => row.xp_at_10),
      avg_dmg_taken_per_min: avg(group, (row) => row.damage_taken_per_min),
      avg_kda_challenges: avg(group, (row) => row.kda_challenges),
      first_blood_involvements: group.filter(
        (row) => row.first_blood_kill || row.first_blood_assist,
      ).length,
      avg_game_duration: avg(group, (row) => row.game_duration_min),
    };
  });
}

export function rankWeeklyStandouts(rows: PlayerAggRow[], limit = 5): WeeklyStandout[] {
  return powerRanking(rows).slice(0, limit);
}

function latestWeekBounds(gameDate: string): { start: string; end: string } {
  const latest = new Date(gameDate);
  const start = new Date(latest);
  const daysSinceMonday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  start.setUTCHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function isWithinBounds(row: WeeklyRawStatRow, bounds: { start: string; end: string }): boolean {
  if (!row.game_date) return false;
  const time = new Date(row.game_date).getTime();
  return time >= new Date(bounds.start).getTime() && time < new Date(bounds.end).getTime();
}

export function rankLatestWeeklyStandoutsFromRows(
  rows: WeeklyRawStatRow[],
  limit = 5,
): WeeklyStandout[] {
  const seasonRows = rows.filter((row) => row.season === HOMEPAGE_SEASON);
  const latestGameDate = seasonRows
    .map((row) => row.game_date)
    .filter((date): date is string => Boolean(date))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

  if (!latestGameDate) {
    return [];
  }

  const bounds = latestWeekBounds(latestGameDate);
  const latestRows = seasonRows.filter((row) => isWithinBounds(row, bounds));
  return rankWeeklyStandouts(aggregateWeeklyPlayerRows(latestRows), limit);
}

export async function fetchLatestWeeklyStandouts(limit = 5): Promise<WeeklyStandout[]> {
  try {
    const supabase = await createServerSupabase();
    const { data: latest, error: latestError } = await supabase
      .from("raw_stats")
      .select("game_date")
      .eq("season", HOMEPAGE_SEASON)
      .order("game_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestError || !latest?.game_date) {
      return [];
    }

    const bounds = latestWeekBounds(String(latest.game_date));
    const { data, error } = await supabase
      .from("raw_stats")
      .select(RAW_WEEKLY_COLUMNS)
      .eq("season", HOMEPAGE_SEASON)
      .gte("game_date", bounds.start)
      .lt("game_date", bounds.end);

    if (error) {
      return [];
    }

    return rankWeeklyStandouts(
      aggregateWeeklyPlayerRows(((data ?? []) as unknown) as WeeklyRawStatRow[]),
      limit,
    );
  } catch {
    return [];
  }
}
