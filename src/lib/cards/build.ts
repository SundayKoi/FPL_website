// Player-card rating engine. Pure functions: the queries layer
// (src/lib/cards/queries.ts) fetches the season's stats and this module
// turns one player's rows into everything the card renders — overall
// rating, tier, sub-stats, archetype, signature champion, and form. All
// ratings are cohort-relative (percentile within the season, role cohort
// where it matters) so a 90 means top of THIS league, and every number
// moves automatically as the nightly ingest lands new games.

import { championDisplayName } from "@/lib/match-draft/champions";
import { powerRanking } from "@/lib/stats/formulas";
import type { PlayerAggRow } from "@/lib/stats/types";

/** One game a player actually played, distilled from raw_stats. */
export interface CardGameRow {
  summoner_name: string;
  tag: string;
  champion: string | null;
  win: boolean | null;
  game_date: string | null;
  match_id: string;
  team_name: string | null;
}

export interface CardTier {
  key: "bronze" | "silver" | "gold" | "platinum" | "emerald" | "diamond" | "master" | "challenger";
  label: string;
}

export interface CardSubStat {
  key: "combat" | "economy" | "vision" | "form" | "clutch";
  label: string;
  value: number;
}

export interface PlayerCardData {
  slug: string;
  name: string;
  tag: string;
  teamName: string | null;
  role: string;
  overall: number;
  tier: CardTier;
  archetype: string;
  signature: { champion: string; games: number } | null;
  topChampions: { champion: string; games: number; wins: number }[];
  /** Last five results, oldest first. */
  form: boolean[];
  subStats: CardSubStat[];
  wins: number;
  losses: number;
  winratePct: number;
  /** Card level — games played this season. */
  level: number;
  pentas: number;
  season: string;
}

// OVR maps the Power Ranking score (0-100, role-weighted blended
// percentile — see formulas.ts) onto the familiar 1-99 card scale. The
// affine constants spread real scores (which cluster 30-85) across
// FIFA-ish territory; tune here, everything downstream follows.
const OVR_BASE = 28;
const OVR_SCALE = 0.68;

const TIERS: { min: number; tier: CardTier }[] = [
  { min: 94, tier: { key: "challenger", label: "Challenger" } },
  { min: 89, tier: { key: "master", label: "Master" } },
  { min: 83, tier: { key: "diamond", label: "Diamond" } },
  { min: 77, tier: { key: "emerald", label: "Emerald" } },
  { min: 70, tier: { key: "platinum", label: "Platinum" } },
  { min: 60, tier: { key: "gold", label: "Gold" } },
  { min: 50, tier: { key: "silver", label: "Silver" } },
  { min: 0, tier: { key: "bronze", label: "Bronze" } },
];

export function tierFor(overall: number): CardTier {
  return (TIERS.find((band) => overall >= band.min) ?? TIERS[TIERS.length - 1]).tier;
}

/** URL identity for a card page — unique per real player (name collides,
 *  name#tag doesn't; see stats_records' tag column). */
export function cardSlug(summonerName: string, tag: string): string {
  return `${summonerName}-${tag}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const ROLE_LABELS: Record<string, string> = {
  TOP: "Top",
  JUNGLE: "Jungle",
  MIDDLE: "Mid",
  BOTTOM: "Bot",
  UTILITY: "Support",
};

function playerKey(row: { summoner_name: string; tag: string }): string {
  return `${row.summoner_name.trim().toLowerCase()}#${row.tag.trim().toLowerCase()}`;
}

/** Percentile (0-100) of the row within the cohort for one stat, matching
 *  formulas.ts's pctile shape (rank position over cohort size). */
function pct(cohort: PlayerAggRow[], row: PlayerAggRow, pick: (r: PlayerAggRow) => number, invert = false): number {
  const sorted = [...cohort].sort((a, b) => pick(a) - pick(b));
  const key = playerKey(row);
  const idx = sorted.findIndex((r) => playerKey(r) === key);
  if (idx === -1) return 50;
  const p = (idx / (sorted.length - 1 || 1)) * 100;
  return invert ? 100 - p : p;
}

/** Same-role cohort with the >=4-member fallback formulas.ts uses. */
function roleCohort(cohort: PlayerAggRow[], row: PlayerAggRow): PlayerAggRow[] {
  const same = cohort.filter((r) => r.role_mode === row.role_mode);
  return same.length >= 4 ? same : cohort;
}

/** Maps a 0-100 percentile onto the 20-99 sub-stat scale (nobody's bar
 *  should look empty — even the league's last place grinds games). */
function toStat(percentile: number): number {
  return Math.round(20 + Math.max(0, Math.min(100, percentile)) * 0.79);
}

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / (values.length || 1);
}

export interface BuildCardInput {
  row: PlayerAggRow;
  /** Every qualifying player's agg row this season — the rating cohort. */
  cohort: PlayerAggRow[];
  /** The player's own games, any order; sorted internally by date. */
  games: CardGameRow[];
  /** match_id -> game duration in minutes, for the Clutch split. */
  durations: Map<string, number>;
}

/** Games at or past this duration count as "clutch" territory. */
const CLUTCH_MINUTES = 32;

export function buildCard({ row, cohort, games, durations }: BuildCardInput): PlayerCardData {
  const ranked = powerRanking(cohort);
  const key = playerKey(row);
  const score = ranked.find((r) => playerKey(r) === key)?.score ?? 50;
  const overall = Math.max(1, Math.min(99, Math.round(OVR_BASE + score * OVR_SCALE)));

  const rc = roleCohort(cohort, row);
  const combat = toStat(
    mean([
      pct(rc, row, (r) => r.kda),
      pct(rc, row, (r) => r.avg_dmg_per_min),
      pct(rc, row, (r) => r.avg_kills),
      pct(rc, row, (r) => r.avg_kp_pct),
      pct(rc, row, (r) => r.avg_deaths, true),
    ]),
  );
  const economy = toStat(
    mean([
      pct(rc, row, (r) => r.avg_cs_per_min),
      pct(rc, row, (r) => r.avg_gold_per_min),
      pct(rc, row, (r) => r.avg_gold_at_10),
    ]),
  );
  const vision = toStat(pct(rc, row, (r) => r.avg_vision_per_min));

  // Form: the last five results, weighted toward the streak the player is
  // currently on. A 5-0 heater reads 99; a 0-5 skid scrapes the floor.
  const dated = [...games].sort((a, b) => (a.game_date ?? "").localeCompare(b.game_date ?? ""));
  const lastFive = dated.slice(-5).map((g) => g.win === true);
  const formWr = lastFive.length > 0 ? lastFive.filter(Boolean).length / lastFive.length : 0.5;
  let streak = 0;
  for (let i = lastFive.length - 1; i >= 0 && lastFive[i]; i -= 1) streak += 1;
  const form = Math.max(1, Math.min(99, Math.round(20 + formWr * 70 + Math.max(0, streak - 1) * 3)));

  // Clutch: win rate in long games, where a single fight decides it. Too
  // few long games -> fall back to overall win rate so the bar means
  // something instead of swinging on one match.
  const longGames = dated.filter((g) => (durations.get(g.match_id) ?? 0) >= CLUTCH_MINUTES);
  const clutchWr =
    longGames.length >= 2
      ? longGames.filter((g) => g.win === true).length / longGames.length
      : row.winrate_pct / 100;
  const clutch = Math.max(1, Math.min(99, Math.round(15 + clutchWr * 80)));

  // Archetype: first matching identity, checked most-distinctive first.
  const p = {
    dmg: pct(rc, row, (r) => r.avg_dmg_per_min),
    diesALot: pct(rc, row, (r) => r.avg_deaths),
    kda: pct(rc, row, (r) => r.kda),
    visionP: pct(rc, row, (r) => r.avg_vision_per_min),
    solo: pct(rc, row, (r) => r.avg_solo_kills),
    kp: pct(rc, row, (r) => r.avg_kp_pct),
    cs: pct(rc, row, (r) => r.avg_cs_per_min),
  };
  const archetype =
    p.dmg >= 70 && p.diesALot >= 65
      ? "Glass Cannon"
      : p.kda >= 75 && p.diesALot <= 30
        ? "The Surgeon"
        : p.visionP >= 80
          ? "The Warden"
          : p.solo >= 80
            ? "Duelist"
            : p.kp >= 80
              ? "Playmaker"
              : p.cs >= 80
                ? "Farm Demon"
                : row.winrate_pct >= 60
                  ? "Born Winner"
                  : "All-Rounder";

  // Champion pool: most-played first, win rate breaking ties. raw_stats
  // stores Riot's internal championName ("MonkeyKing", "MissFortune") —
  // canonicalize to display names so art resolves and aliases merge.
  const byChampion = new Map<string, { games: number; wins: number }>();
  for (const g of dated) {
    const name = g.champion?.trim();
    if (!name) continue;
    const display = championDisplayName(name);
    const entry = byChampion.get(display) ?? { games: 0, wins: 0 };
    entry.games += 1;
    if (g.win === true) entry.wins += 1;
    byChampion.set(display, entry);
  }
  const topChampions = [...byChampion.entries()]
    .map(([champion, stats]) => ({ champion, ...stats }))
    .sort((a, b) => b.games - a.games || b.wins / b.games - a.wins / a.games || a.champion.localeCompare(b.champion))
    .slice(0, 3);

  const teamName = dated.at(-1)?.team_name?.trim() || null;

  return {
    slug: cardSlug(row.summoner_name, row.tag),
    name: row.summoner_name,
    tag: row.tag,
    teamName,
    role: ROLE_LABELS[row.role_mode] ?? row.role_mode,
    overall,
    tier: tierFor(overall),
    archetype,
    signature: topChampions[0] ? { champion: topChampions[0].champion, games: topChampions[0].games } : null,
    topChampions,
    form: lastFive,
    subStats: [
      { key: "combat", label: "Combat", value: combat },
      { key: "economy", label: "Economy", value: economy },
      { key: "vision", label: "Vision", value: vision },
      { key: "form", label: "Form", value: form },
      { key: "clutch", label: "Clutch", value: clutch },
    ],
    wins: row.wins,
    losses: row.games - row.wins,
    winratePct: row.winrate_pct,
    level: row.games,
    pentas: row.total_pentas,
    season: row.season,
  };
}
