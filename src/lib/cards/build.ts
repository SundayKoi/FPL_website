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
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  cs: number | null;
  total_damage_to_champions: number | null;
}

/** Per-match context from stats_game_log — the clock and both team names. */
export interface CardGameMeta {
  durationMin: number;
  blueTeam: string | null;
  redTeam: string | null;
}

/** A single-game season high shown on the card back. */
export interface CardHighlight {
  label: string;
  value: string;
  detail: string | null;
}

/** A feat badge shown on the card back. */
export interface CardBadge {
  key: string;
  label: string;
  detail: string;
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
  /** The team's logo, watermarked onto the card. */
  teamImageUrl: string | null;
  role: string;
  overall: number;
  tier: CardTier;
  archetype: string;
  signature: { champion: string; games: number } | null;
  /** Chosen card-art skin number (card_art_prefs; 0 = base splash). */
  artSkin: number;
  topChampions: { champion: string; games: number; wins: number }[];
  /** Last five results, oldest first. */
  form: boolean[];
  subStats: CardSubStat[];
  /** Single-game season highs, strongest first (card back). */
  highlights: CardHighlight[];
  /** Feat badges (card back). */
  badges: CardBadge[];
  /** Weekly Standout winner — Card of the Week treatment. */
  standout: boolean;
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

/** Games at or past this duration count as "clutch" territory. */
const CLUTCH_MINUTES = 32;

/** Last-five results (oldest first) from date-sorted games. */
function lastFiveOf(dated: CardGameRow[]): boolean[] {
  return dated.slice(-5).map((g) => g.win === true);
}

/** Current win streak within the last five (what "On A Heater" reads). */
function streakOf(lastFive: boolean[]): number {
  let streak = 0;
  for (let i = lastFive.length - 1; i >= 0 && lastFive[i]; i -= 1) streak += 1;
  return streak;
}

/** Win rate (0-1) in long games, falling back to overall win rate when
 *  there are too few to mean anything. */
function clutchRate(dated: CardGameRow[], gameLog: Map<string, CardGameMeta>, fallbackWr01: number): number {
  const longGames = dated.filter((g) => (gameLog.get(g.match_id)?.durationMin ?? 0) >= CLUTCH_MINUTES);
  return longGames.length >= 2 ? longGames.filter((g) => g.win === true).length / longGames.length : fallbackWr01;
}

/** "vs {opponent}" resolved from the game log's two team names. */
function opponentOf(game: CardGameRow, gameLog: Map<string, CardGameMeta>): string | null {
  const meta = gameLog.get(game.match_id);
  const own = game.team_name?.trim().toLowerCase();
  if (!meta || !own) return null;
  const opponent = [meta.blueTeam, meta.redTeam].find((team) => team && team.trim().toLowerCase() !== own);
  return opponent ?? null;
}

/** Single-game season highs for the card back: a flawless game leads when
 *  one exists, then the kills / damage / CS peaks. At most three. */
function computeHighlights(dated: CardGameRow[], gameLog: Map<string, CardGameMeta>): CardHighlight[] {
  const highlights: CardHighlight[] = [];
  const detail = (game: CardGameRow): string | null => {
    const opponent = opponentOf(game, gameLog);
    const champion = game.champion ? championDisplayName(game.champion) : null;
    if (champion && opponent) return `${champion} vs ${opponent}`;
    return champion ?? (opponent ? `vs ${opponent}` : null);
  };
  const peak = (pick: (g: CardGameRow) => number): CardGameRow | null =>
    dated.reduce<CardGameRow | null>((best, g) => (pick(g) > (best ? pick(best) : 0) ? g : best), null);

  const flawless = dated
    .filter((g) => g.win === true && (g.deaths ?? 1) === 0 && (g.kills ?? 0) + (g.assists ?? 0) >= 8)
    .sort((a, b) => (b.kills ?? 0) + (b.assists ?? 0) - ((a.kills ?? 0) + (a.assists ?? 0)))[0];
  if (flawless) {
    highlights.push({
      label: "Flawless game",
      value: `${flawless.kills ?? 0}/0/${flawless.assists ?? 0}`,
      detail: detail(flawless),
    });
  }
  const mostKills = peak((g) => g.kills ?? 0);
  if (mostKills && (mostKills.kills ?? 0) > 0) {
    highlights.push({ label: "Most kills", value: `${mostKills.kills}`, detail: detail(mostKills) });
  }
  const mostDamage = peak((g) => g.total_damage_to_champions ?? 0);
  if (mostDamage && (mostDamage.total_damage_to_champions ?? 0) > 0) {
    highlights.push({
      label: "Damage high",
      value: `${Math.round((mostDamage.total_damage_to_champions ?? 0) / 1000)}k`,
      detail: detail(mostDamage),
    });
  }
  const mostCs = peak((g) => g.cs ?? 0);
  if (mostCs && (mostCs.cs ?? 0) > 0) {
    highlights.push({ label: "CS high", value: `${mostCs.cs}`, detail: detail(mostCs) });
  }
  return highlights.slice(0, 3);
}

/** Feat badges: rare accomplishments worth pinning on the card. */
function computeBadges(row: PlayerAggRow, dated: CardGameRow[], recordCategories: string[]): CardBadge[] {
  const badges: CardBadge[] = [];
  if (row.total_pentas > 0) {
    badges.push({ key: "penta", label: "Pentakiller", detail: `${row.total_pentas} pentakill${row.total_pentas === 1 ? "" : "s"} this season` });
  }
  if (recordCategories.length > 0) {
    badges.push({
      key: "record",
      label: "Record Holder",
      detail: `Holds a league record: ${recordCategories.slice(0, 3).join(", ")}`,
    });
  }
  if (row.games >= 5 && row.first_blood_involvements / row.games >= 0.5) {
    badges.push({ key: "first-blood", label: "First Blood King", detail: `In on first blood in ${Math.round((row.first_blood_involvements / row.games) * 100)}% of games` });
  }
  if (dated.some((g) => g.win === true && (g.deaths ?? 1) === 0)) {
    badges.push({ key: "flawless", label: "Flawless", detail: "Won a game without dying" });
  }
  if (row.games >= 8 && row.winrate_pct >= 65) {
    badges.push({ key: "winner", label: "Winning Record", detail: `${row.winrate_pct}% win rate over ${row.games} games` });
  }
  if (row.games >= 15) {
    badges.push({ key: "veteran", label: "Iron Lungs", detail: `${row.games} games played this season` });
  }
  return badges.slice(0, 4);
}

// ── Archetypes ────────────────────────────────────────────────────────────
//
// Titles are SCARCE on purpose: every player gets a score for every title
// they qualify for, then assignArchetypes hands titles out league-wide,
// best claim first, with a per-title cap — so "The Surgeon" belongs to the
// league's actual surgeon(s), not to everyone with a decent KDA, and two
// cards side by side rarely read the same.

/** Everything a title score can look at, all percentiles vs role cohort
 *  (0-100) unless noted. */
interface ArchetypeFacts {
  role: string;
  winrate: number;
  pentas: number;
  streak: number;
  /** 0-1 — long-game win rate. */
  clutchWr: number;
  kda: number;
  dmg: number;
  dmgShare: number;
  dmgTaken: number;
  kills: number;
  assists: number;
  diesALot: number;
  safe: number;
  kp: number;
  cs: number;
  gold: number;
  at10: number;
  vision: number;
  solo: number;
  fb: number;
  plates: number;
  multi: number;
  fast: number;
  gamesPct: number;
}

export interface ArchetypeExtras {
  streak: number;
  clutchWr: number;
}

function archetypeFacts(row: PlayerAggRow, cohort: PlayerAggRow[], extras: ArchetypeExtras): ArchetypeFacts {
  const rc = roleCohort(cohort, row);
  return {
    role: row.role_mode,
    winrate: row.winrate_pct,
    pentas: row.total_pentas,
    streak: extras.streak,
    clutchWr: extras.clutchWr,
    kda: pct(rc, row, (r) => r.kda),
    dmg: pct(rc, row, (r) => r.avg_dmg_per_min),
    dmgShare: pct(rc, row, (r) => r.avg_dmg_share_pct),
    dmgTaken: pct(rc, row, (r) => r.avg_dmg_taken_per_min),
    kills: pct(rc, row, (r) => r.avg_kills),
    assists: pct(rc, row, (r) => r.avg_assists),
    diesALot: pct(rc, row, (r) => r.avg_deaths),
    safe: pct(rc, row, (r) => r.avg_deaths, true),
    kp: pct(rc, row, (r) => r.avg_kp_pct),
    cs: pct(rc, row, (r) => r.avg_cs_per_min),
    gold: pct(rc, row, (r) => r.avg_gold_per_min),
    at10: mean([
      pct(rc, row, (r) => r.avg_cs_at_10),
      pct(rc, row, (r) => r.avg_gold_at_10),
      pct(rc, row, (r) => r.avg_xp_at_10),
    ]),
    vision: pct(rc, row, (r) => r.avg_vision_per_min),
    solo: pct(rc, row, (r) => r.avg_solo_kills),
    fb: pct(rc, row, (r) => r.first_blood_involvements / Math.max(r.games, 1)),
    plates: pct(rc, row, (r) => r.total_plates / Math.max(r.games, 1)),
    multi: pct(
      rc,
      row,
      (r) => (r.total_doubles + r.total_triples * 2 + r.total_quadras * 3 + r.total_pentas * 4) / Math.max(r.games, 1),
    ),
    // Short average games, percentile-inverted: high = closes games out.
    fast: pct(rc, row, (r) => r.avg_game_duration, true),
    gamesPct: pct(rc, row, (r) => r.games),
  };
}

/** Score 0 = doesn't qualify. `over` gates a percentile on a floor. */
const over = (value: number, min: number): number => (value >= min ? value : 0);

export const FALLBACK_ARCHETYPE = "Jack of All Trades";

const ARCHETYPES: { title: string; score: (f: ArchetypeFacts) => number }[] = [
  // Marquee feats first — rare by nature, so they outbid everything.
  { title: "Pentakill Machine", score: (f) => (f.pentas > 0 ? 92 + f.pentas * 3 : 0) },
  { title: "On A Heater", score: (f) => (f.streak >= 3 ? 62 + f.streak * 8 : 0) },

  // Stat identities.
  { title: "Glass Cannon", score: (f) => (f.dmg >= 65 && f.diesALot >= 60 ? (f.dmg + f.diesALot) / 2 : 0) },
  { title: "The Surgeon", score: (f) => (f.kda >= 70 && f.safe >= 65 ? (f.kda + f.safe) / 2 : 0) },
  { title: "The Warden", score: (f) => over(f.vision, 70) },
  { title: "Duelist", score: (f) => over(f.solo, 70) },
  { title: "Playmaker", score: (f) => (f.kp >= 65 && f.assists >= 60 ? (f.kp + f.assists) / 2 : 0) },
  { title: "The Enabler", score: (f) => over(f.assists, 75) - 1 },
  { title: "Executioner", score: (f) => over(f.kills, 75) - 1 },
  { title: "Farm Demon", score: (f) => over(f.cs, 72) },
  { title: "Gold Hoarder", score: (f) => over(f.gold, 72) - 1 },
  { title: "Lane Bully", score: (f) => over(f.at10, 68) },
  { title: "Plate Collector", score: (f) => over(f.plates, 70) - 2 },
  { title: "First Blood Merchant", score: (f) => over(f.fb, 70) },
  { title: "The Frontline", score: (f) => over(f.dmgTaken, 70) },
  { title: "Highlight Reel", score: (f) => over(f.multi, 70) },
  { title: "Silent Carry", score: (f) => (f.dmgShare >= 70 && f.kills <= 50 ? f.dmgShare : 0) },
  { title: "Coinflip Gamer", score: (f) => (f.kills >= 60 && f.diesALot >= 60 ? (f.kills + f.diesALot) / 2 - 5 : 0) },

  // Results identities.
  { title: "Born Winner", score: (f) => (f.winrate >= 58 ? 40 + f.winrate / 2 : 0) },
  { title: "Clutch Gene", score: (f) => (f.clutchWr >= 0.6 ? 30 + f.clutchWr * 60 : 0) },
  { title: "Speedrunner", score: (f) => (f.fast >= 65 && f.winrate >= 50 ? (f.fast + f.winrate) / 2 : 0) },
  { title: "The Anchor", score: (f) => (f.safe >= 60 && f.winrate >= 55 ? (f.safe + f.winrate) / 2 - 2 : 0) },

  // Forgiving identities — lower floors so nearly everyone can claim
  // SOMETHING real and the Jack of All Trades fallback stays rare.
  { title: "The Veteran", score: (f) => over(f.gamesPct, 70) - 10 },
  { title: "The Underdog", score: (f) => (f.winrate <= 45 && f.kda >= 45 ? 30 + f.kda / 3 : 0) },
  { title: "Space Creator", score: (f) => (f.dmgTaken >= 55 && f.safe <= 45 ? f.dmgTaken - 8 : 0) },

  // Role-flavored — the role gate alone spreads these across the league.
  { title: "Island King", score: (f) => (f.role === "TOP" && f.solo >= 55 && f.cs >= 50 ? 52 + (f.solo + f.cs) / 4 : 0) },
  { title: "Jungle Diff", score: (f) => (f.role === "JUNGLE" && f.kp >= 55 && f.winrate >= 50 ? 52 + (f.kp + f.winrate) / 4 : 0) },
  { title: "Tempo Conductor", score: (f) => (f.role === "MIDDLE" && f.kp >= 55 && f.dmg >= 50 ? 52 + (f.kp + f.dmg) / 4 : 0) },
  { title: "The Hypercarry", score: (f) => (f.role === "BOTTOM" && f.dmgShare >= 55 && f.dmg >= 50 ? 52 + (f.dmgShare + f.dmg) / 4 : 0) },
  { title: "The Bodyguard", score: (f) => (f.role === "UTILITY" && f.assists >= 50 && f.safe >= 45 ? 52 + (f.assists + f.safe) / 4 : 0) },
];

/**
 * League-wide scarce title assignment: every (player, title, score>0)
 * claim is sorted best-first; each player takes their strongest still-
 * available title, and each title serves at most `cap` players. Anyone
 * left over (qualified for nothing) becomes a Jack of All Trades.
 * Deterministic: ties break on player key then title name.
 */
export function assignArchetypes(cohort: PlayerAggRow[], extrasByKey: Map<string, ArchetypeExtras>): Map<string, string> {
  const claims: { key: string; title: string; score: number }[] = [];
  for (const row of cohort) {
    const key = playerKey(row);
    const facts = archetypeFacts(row, cohort, extrasByKey.get(key) ?? { streak: 0, clutchWr: row.winrate_pct / 100 });
    for (const archetype of ARCHETYPES) {
      const score = archetype.score(facts);
      if (score > 0) claims.push({ key, title: archetype.title, score });
    }
  }
  claims.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key) || a.title.localeCompare(b.title));

  const cap = Math.max(1, Math.ceil(cohort.length / ARCHETYPES.length));
  const counts = new Map<string, number>();
  const assigned = new Map<string, string>();
  for (const claim of claims) {
    if (assigned.has(claim.key)) continue;
    if ((counts.get(claim.title) ?? 0) >= cap) continue;
    assigned.set(claim.key, claim.title);
    counts.set(claim.title, (counts.get(claim.title) ?? 0) + 1);
  }
  for (const row of cohort) {
    const key = playerKey(row);
    if (!assigned.has(key)) assigned.set(key, FALLBACK_ARCHETYPE);
  }
  return assigned;
}

// ── Card assembly ─────────────────────────────────────────────────────────

export interface BuildCardInput {
  row: PlayerAggRow;
  /** Every qualifying player's agg row this season — the rating cohort. */
  cohort: PlayerAggRow[];
  /** The player's own games, any order; sorted internally by date. */
  games: CardGameRow[];
  /** match_id -> duration + team names, from stats_game_log. */
  gameLog: Map<string, CardGameMeta>;
  /** League-wide assigned title (from assignArchetypes). Absent — e.g. a
   *  single-card build in tests — the player's own best claim is used. */
  archetype?: string;
  /** stats_records categories this player holds (Record Holder badge). */
  recordCategories?: string[];
  /** team name (lowercased) -> logo URL. */
  teamImages?: Map<string, string>;
  /** Chosen art skin number (card_art_prefs), 0 = base. */
  artSkin?: number;
  /** This week's Weekly Standout — Card of the Week. */
  standout?: boolean;
}

export function buildCard({
  row,
  cohort,
  games,
  gameLog,
  archetype,
  recordCategories = [],
  teamImages,
  artSkin = 0,
  standout = false,
}: BuildCardInput): PlayerCardData {
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
  const lastFive = lastFiveOf(dated);
  const formWr = lastFive.length > 0 ? lastFive.filter(Boolean).length / lastFive.length : 0.5;
  const streak = streakOf(lastFive);
  const form = Math.max(1, Math.min(99, Math.round(20 + formWr * 70 + Math.max(0, streak - 1) * 3)));

  const clutchWr = clutchRate(dated, gameLog, row.winrate_pct / 100);
  const clutch = Math.max(1, Math.min(99, Math.round(15 + clutchWr * 80)));

  const resolvedArchetype =
    archetype ??
    (() => {
      // Solo build: the player's own strongest claim, no scarcity.
      const facts = archetypeFacts(row, cohort, { streak, clutchWr });
      let best = { title: FALLBACK_ARCHETYPE, score: 0 };
      for (const candidate of ARCHETYPES) {
        const s = candidate.score(facts);
        if (s > best.score) best = { title: candidate.title, score: s };
      }
      return best.title;
    })();

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
    teamImageUrl: teamName ? teamImages?.get(teamName.toLowerCase()) ?? null : null,
    role: ROLE_LABELS[row.role_mode] ?? row.role_mode,
    overall,
    tier: tierFor(overall),
    archetype: resolvedArchetype,
    signature: topChampions[0] ? { champion: topChampions[0].champion, games: topChampions[0].games } : null,
    artSkin,
    topChampions,
    form: lastFive,
    highlights: computeHighlights(dated, gameLog),
    badges: computeBadges(row, dated, recordCategories),
    standout,
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

export interface BuildSeasonCardsInput {
  cohort: PlayerAggRow[];
  gamesByPlayer: Map<string, CardGameRow[]>;
  gameLog: Map<string, CardGameMeta>;
  /** player key -> stats_records categories they hold. */
  recordsByPlayer?: Map<string, string[]>;
  /** team name (lowercased) -> logo URL. */
  teamImages?: Map<string, string>;
  /** player key -> chosen art skin number. */
  artSkins?: Map<string, number>;
  /** This week's per-role Weekly Standout winners (player keys). */
  standoutKeys?: Set<string> | null;
}

/** The whole league's cards with league-wide scarce archetypes, best
 *  overall first. */
export function buildSeasonCards({
  cohort,
  gamesByPlayer,
  gameLog,
  recordsByPlayer,
  teamImages,
  artSkins,
  standoutKeys = null,
}: BuildSeasonCardsInput): PlayerCardData[] {
  const extrasByKey = new Map<string, ArchetypeExtras>();
  for (const row of cohort) {
    const key = playerKey(row);
    const dated = [...(gamesByPlayer.get(key) ?? [])].sort((a, b) => (a.game_date ?? "").localeCompare(b.game_date ?? ""));
    extrasByKey.set(key, {
      streak: streakOf(lastFiveOf(dated)),
      clutchWr: clutchRate(dated, gameLog, row.winrate_pct / 100),
    });
  }
  const archetypes = assignArchetypes(cohort, extrasByKey);

  return cohort
    .map((row) => {
      const key = playerKey(row);
      return buildCard({
        row,
        cohort,
        games: gamesByPlayer.get(key) ?? [],
        gameLog,
        archetype: archetypes.get(key),
        recordCategories: recordsByPlayer?.get(key) ?? [],
        teamImages,
        artSkin: artSkins?.get(key) ?? 0,
        standout: standoutKeys?.has(key) ?? false,
      });
    })
    .sort((a, b) => b.overall - a.overall || a.name.localeCompare(b.name));
}

/** The shared player key ("name#tag", lowercased) — exported so data
 *  layers key their maps the same way the engine does. */
export function cardPlayerKey(summonerName: string, tag: string): string {
  return playerKey({ summoner_name: summonerName, tag });
}
