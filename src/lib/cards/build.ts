// Player-card rating engine. Pure functions: the queries layer
// (src/lib/cards/queries.ts) fetches the season's stats and this module
// turns one player's rows into everything the card renders — overall
// rating, tier, sub-stats, archetype, signature champion, and form. All
// ratings are cohort-relative (percentile within the season, role cohort
// where it matters) so a 90 means top of THIS league, and every number
// moves automatically as the nightly ingest lands new games.
//
// CHANGING THE SCORING HERE DOES NOT CHANGE WHAT PACKS MINT.
// Packs pull from card_editions — a frozen json snapshot of each week's
// cards — not from this module. Editing the formula updates every card the
// SITE renders immediately, while every pack keeps handing out overalls
// the old formula produced, because the archived json still holds them.
// After any change here, rebuild the archive:
//
//   npx tsx scripts/archive-card-edition.ts all
//
// or run the "Archive card edition" workflow with "Rebuild every week"
// ticked. Every week is recomputed from that week's raw_stats, so a
// rebuild reproduces the drop exactly with today's formula. Cards people
// already pulled are frozen in card_inventory and are NOT touched.

import { championDisplayName } from "@/lib/match-draft/champions";
import type { PlayerAggRow } from "@/lib/stats/types";
import { MEASURE_LABELS, type MeasureKey, barsForRole, gameTotals, pctOf, type GameTotals } from "./measures";

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
  /** Objective and turret work — only on raw_stats, never on
   *  stats_player_agg, so these ride the per-game rows both build paths
   *  already fetch. */
  dragon_kills?: number | null;
  baron_kills?: number | null;
  objective_damage?: number | null;
  turret_kills?: number | null;
  turret_damage?: number | null;
  turret_plates_destroyed?: number | null;
  /** Vision DENIAL and the investment behind it. vision_score rewards
   *  having wards up; it barely distinguishes the player who clears the
   *  enemy's. Same story as the objective columns — raw_stats only. */
  wards_killed?: number | null;
  control_wards_bought?: number | null;
  /** Control wards actually PLACED. Preferred over control_wards_bought:
   *  a control ward sitting in the inventory gives no vision to anyone. */
  detector_wards_placed?: number | null;
  /** Damage absorbed by armour, MR and shields — the tanking stat. */
  damage_mitigated?: number | null;
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
  /** "form" and "clutch" are retired but stay in the union: every copy
   *  already frozen in card_inventory carries them, and the renderer prints
   *  whatever a card holds. */
  key: MeasureKey | "form" | "clutch";
  label: string;
  value: number;
}

/**
 * A moment riding inside a card copy.
 *
 * A pulled moment is stored as a card_inventory row like any other, because
 * every surface a collection has — the shelf, trades, dust, the binder, the
 * pack reveal — already knows how to carry one. What makes it a moment is
 * this field: PlayerCard3D checks for it and renders the engraved plate
 * instead of a player card, so one branch covers every surface at once.
 *
 * The card's own rating fields are filled with placeholders on a moment and
 * are never shown. A moment has no overall, which is the whole premise of
 * the plate design.
 */
export interface MomentPrint {
  id: number;
  title: string;
  headline: string;
  summonerName: string;
  champion: string | null;
  teamName: string | null;
  weekStart: string;
  /** The player's card slug, so the plate can link to them. */
  playerSlug: string;
  /** Which trigger fired — picks the print's colorway family. Optional:
   *  copies frozen before the Signature redesign carry none and print in
   *  the fallback family. */
  triggerKey?: string | null;
  /** Provenance: the other team, and the game clock at final whistle.
   *  Optional for the same frozen-copy reason. */
  opponent?: string | null;
  durationMin?: number | null;
  /** Which mint of this moment the copy is (1 = first pulled). */
  copySerial?: number | null;
}

export interface PlayerCardData {
  /** Set only on a pulled moment — see MomentPrint. */
  moment?: MomentPrint | null;
  /** Set on a copy that won a Weekly Draw — cosmetic provenance only;
   *  dust pricing never reads it. weekStart is the drawn week's Monday. */
  drawWin?: { weekStart: string } | null;
  /** Set only on a champions-drop card (the Dealer's Hand) — see
   *  src/lib/cards/champions.ts. Like `moment`, the renderer branches on
   *  this before reading any rating field. */
  champWin?: {
    rank: string;
    setIndex: number;
    setSize: number;
    team: string;
    seasonWon: string;
    champion: string;
    joker: boolean;
    /** Which mint of this rank the copy is (1 = first pulled). */
    copySerial?: number | null;
  } | null;
  slug: string;
  name: string;
  tag: string;
  teamName: string | null;
  /** The team's logo, watermarked onto the card. */
  teamImageUrl: string | null;
  /** The short form the card front prints — the full name ran under the
   *  signature. Null on copies frozen before this existed; the renderer
   *  falls back to teamName, and backfillTeamIdentity repairs them on read. */
  teamAbbr?: string | null;
  role: string;
  overall: number;
  tier: CardTier;
  archetype: string;
  signature: { champion: string; games: number } | null;
  /** Chosen card-art skin number (card_art_prefs; 0 = base splash). Frozen
   *  pack copies override it with a print rolled at open time
   *  (src/lib/packs/skins.ts), so a pulled copy wears a random skin of the
   *  signature champion rather than the one its player picked. */
  artSkin: number;
  /** Player-chosen motto line (card_art_prefs), shown on the back. */
  motto: string | null;
  /** The player's inked autograph (a PNG data URI), printed across the
   *  front. Never set on a live-built card — it is injected only into the
   *  frozen copies of pulls that rolled signed (src/lib/packs/signatures.ts),
   *  which is what keeps a signed card rare rather than a setting anyone
   *  can turn on. */
  autograph?: string | null;
  /** Collector serial — the card's rank by overall in this season's
   *  collection (1 = best). 0 on solo builds where rank is unknown. */
  serial: number;
  /** How many cards exist in this season's collection. */
  collectionSize: number;
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
  /** Stamped on copies opened inside a Live Drops window — the label the
   *  admin gave the window. Frozen at mint like everything else here. */
  live?: { label: string } | null;
  /** Stamped on the FIRST copy to match a week's chase. */
  chase?: { title: string } | null;
}

// OVR maps the Power Ranking score (0-100, role-weighted blended
// percentile — see formulas.ts) onto the familiar 1-99 card scale. The
// affine constants spread real scores (which cluster 30-85) across
// FIFA-ish territory; tune here, everything downstream follows.
export const OVR_BASE = 28;
// 0.72, not 0.68: raw Power scores top out near 86 over a season and 92-96
// over a single week, so the old scale left Master (89) and Challenger (94)
// unreachable and the pack economy's legendary class permanently empty.
// Modelled on four real weekly cohorts — 0.72 mints roughly one Challenger
// in a strong week and none in a quiet one, and never hits the 99 clamp
// (which would tie players and make collector serials arbitrary).
export const OVR_SCALE = 0.72;

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
 *  name#tag doesn't; see stats_records' tag column). Latin diacritics fold
 *  to their base letter (Archêr → archer-ezpz) instead of vanishing into a
 *  hyphen; scripts with no Latin base (Greek, kana) still strip, exactly as
 *  before, so no pre-fold slug in the wild changes. */
export function cardSlug(summonerName: string, tag: string): string {
  return `${summonerName}-${tag}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
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

/**
 * The key a team badge is looked up by.
 *
 * raw_stats.team_name is written by the ingest from `league_teams.name`,
 * but the logo lives on the DRAFT-side `teams` table — two tables whose
 * names only have to agree by convention. Punctuation and spacing drift
 * between them constantly ("Fraudulent 5" vs "Fraudulent5"), so both sides
 * collapse to letters and digits before they are compared. Genuine
 * spelling differences are bridged by abbreviation in queries.ts.
 */
export function teamBadgeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function playerKey(row: { summoner_name: string; tag: string }): string {
  return `${row.summoner_name.trim().toLowerCase()}#${row.tag.trim().toLowerCase()}`;
}

/** Percentile (0-100) of the row within the cohort for one stat, matching
 *  formulas.ts's pctile shape (rank position over cohort size). */
function pct(cohort: PlayerAggRow[], row: PlayerAggRow, pick: (r: PlayerAggRow) => number, invert = false): number {
  const key = playerKey(row);
  if (!cohort.some((r) => playerKey(r) === key)) return 50;
  const value = pick(row);
  let below = 0;
  let equal = 0;
  for (const peer of cohort) {
    const peerValue = pick(peer);
    if (peerValue < value) below += 1;
    else if (peerValue === value) equal += 1;
  }
  // MIDRANK, not sort position. Ranking by index in a sorted array gives
  // tied players DIFFERENT percentiles purely by where they sat in the
  // input — four bot laners who all went 2-0 came out at 40, 60, 80 and
  // 100. With winning weighted at 30 that was up to 13 OVR of array-order
  // noise, and a two-game week ties constantly (a winrate can only be 0,
  // 50 or 100). Splitting the tied band down the middle gives every player
  // with the same number the same percentile, and leaves distinct values
  // exactly where they were.
  // equal counts the row itself, so zero means its value compared equal to
  // nothing — a NaN or undefined field, since NaN === NaN is false. The old
  // sort-position code still returned some index for such a row; this would
  // return a NEGATIVE percentile and drag every threshold that reads it.
  if (equal === 0) return 50;
  const p = ((below + (equal - 1) / 2) / (cohort.length - 1 || 1)) * 100;
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

/** The five positions a title can be gated to. `role_mode` speaks these
 *  codes; ROLE_LABELS turns them into the words printed on the card. */
type ArchetypeRole = "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY";

const LANERS: ArchetypeRole[] = ["TOP", "MIDDLE", "BOTTOM"];
const SOLOS: ArchetypeRole[] = ["TOP", "MIDDLE"];
const CARRIES: ArchetypeRole[] = ["TOP", "MIDDLE", "BOTTOM"];

/**
 * The title pool.
 *
 * Every stat behind these is already a percentile against the player's OWN
 * role (see roleCohort), which is what makes "best CS among supports"
 * measurable at all — but a percentile being computable never made the
 * title sensible. Untagged, the pool handed supports "Farm Demon" for
 * out-farming other supports and junglers "Lane Bully" for winning a lane
 * they never stood in.
 *
 * `roles` is that missing half: a title is only claimable by positions the
 * words are actually true of. Laners farm and bully lanes; junglers power
 * farm camps and gank; supports ward, roam and peel. Titles with no `roles`
 * describe something any position can do (a pentakill, a win streak, a
 * clean KDA) and stay open to everyone.
 *
 * Terminology follows how the role is actually talked about rather than
 * what the stat column is named — power farming, counter-jungling,
 * weakside, split pushing, engage vs enchanter support — so a card reads
 * like scouting notes instead of a spreadsheet header.
 */
const ARCHETYPES: { title: string; roles?: ArchetypeRole[]; score: (f: ArchetypeFacts) => number }[] = [
  // ── Marquee feats — rare by nature, so they outbid everything ──────────
  { title: "Pentakill Machine", score: (f) => (f.pentas > 0 ? 92 + f.pentas * 3 : 0) },
  { title: "On A Heater", score: (f) => (f.streak >= 3 ? 62 + f.streak * 8 : 0) },

  // ── Universal identities — true of any position ────────────────────────
  { title: "Glass Cannon", score: (f) => (f.dmg >= 65 && f.diesALot >= 60 ? (f.dmg + f.diesALot) / 2 : 0) },
  { title: "The Surgeon", score: (f) => (f.kda >= 70 && f.safe >= 65 ? (f.kda + f.safe) / 2 : 0) },
  { title: "Highlight Reel", score: (f) => over(f.multi, 70) },
  { title: "Coinflip Gamer", score: (f) => (f.kills >= 60 && f.diesALot >= 60 ? (f.kills + f.diesALot) / 2 - 5 : 0) },
  { title: "Born Winner", score: (f) => (f.winrate >= 58 ? 40 + f.winrate / 2 : 0) },
  { title: "Clutch Gene", score: (f) => (f.clutchWr >= 0.6 ? 30 + f.clutchWr * 60 : 0) },
  { title: "Speedrunner", score: (f) => (f.fast >= 65 && f.winrate >= 50 ? (f.fast + f.winrate) / 2 : 0) },
  { title: "The Anchor", score: (f) => (f.safe >= 60 && f.winrate >= 55 ? (f.safe + f.winrate) / 2 - 2 : 0) },
  { title: "The Veteran", score: (f) => over(f.gamesPct, 70) - 10 },
  { title: "The Underdog", score: (f) => (f.winrate <= 45 && f.kda >= 45 ? 30 + f.kda / 3 : 0) },
  { title: "Ice In The Veins", score: (f) => (f.clutchWr >= 0.55 && f.safe >= 55 ? 26 + f.clutchWr * 50 : 0) },

  // ── Laners (top / mid / bot): farming and winning a lane ───────────────
  { title: "Farm Demon", roles: CARRIES, score: (f) => over(f.cs, 72) },
  { title: "Lane Bully", roles: LANERS, score: (f) => over(f.at10, 68) },
  { title: "Gold Hoarder", roles: CARRIES, score: (f) => over(f.gold, 72) - 1 },
  { title: "Plate Collector", roles: LANERS, score: (f) => over(f.plates, 70) - 2 },
  { title: "Wave Manager", roles: LANERS, score: (f) => (f.cs >= 60 && f.safe >= 55 ? (f.cs + f.safe) / 2 - 6 : 0) },
  { title: "Free Win Lane", roles: LANERS, score: (f) => (f.at10 >= 58 && f.winrate >= 52 ? (f.at10 + f.winrate) / 2 - 4 : 0) },

  // ── Top ────────────────────────────────────────────────────────────────
  { title: "Island King", roles: ["TOP"], score: (f) => (f.solo >= 55 && f.cs >= 50 ? 52 + (f.solo + f.cs) / 4 : 0) },
  { title: "Split Pusher", roles: ["TOP"], score: (f) => (f.plates >= 60 && f.kp <= 55 ? (f.plates + f.cs) / 2 : 0) },
  { title: "Weakside Warrior", roles: ["TOP"], score: (f) => (f.gold <= 45 && f.safe >= 55 ? 46 + f.safe / 3 : 0) },
  { title: "Unkillable", roles: ["TOP", "UTILITY"], score: (f) => (f.dmgTaken >= 65 && f.safe >= 55 ? (f.dmgTaken + f.safe) / 2 : 0) },
  { title: "The Juggernaut", roles: ["TOP"], score: (f) => (f.dmgTaken >= 55 && f.dmg >= 55 ? (f.dmgTaken + f.dmg) / 2 - 3 : 0) },

  // ── Jungle: camps, ganks, counter-jungling, tempo ──────────────────────
  { title: "Jungle Diff", roles: ["JUNGLE"], score: (f) => (f.kp >= 55 && f.winrate >= 50 ? 52 + (f.kp + f.winrate) / 4 : 0) },
  { title: "Power Farmer", roles: ["JUNGLE"], score: (f) => over(f.cs, 68) },
  { title: "Gank Squad", roles: ["JUNGLE"], score: (f) => (f.kp >= 62 && f.fb >= 55 ? (f.kp + f.fb) / 2 : 0) },
  { title: "Counter Jungler", roles: ["JUNGLE"], score: (f) => (f.solo >= 58 && f.cs >= 55 ? (f.solo + f.cs) / 2 - 2 : 0) },
  { title: "Tempo Setter", roles: ["JUNGLE"], score: (f) => (f.fast >= 58 && f.kp >= 55 ? (f.fast + f.kp) / 2 - 4 : 0) },
  { title: "Camp Thief", roles: ["JUNGLE"], score: (f) => (f.gold >= 60 && f.cs >= 58 ? (f.gold + f.cs) / 2 - 6 : 0) },

  // ── Mid: roaming, priority, burst ──────────────────────────────────────
  { title: "Tempo Conductor", roles: ["MIDDLE"], score: (f) => (f.kp >= 55 && f.dmg >= 50 ? 52 + (f.kp + f.dmg) / 4 : 0) },
  { title: "Roaming Threat", roles: ["MIDDLE"], score: (f) => (f.kp >= 60 && f.cs <= 55 ? (f.kp + f.fb) / 2 : 0) },
  { title: "Priority Merchant", roles: ["MIDDLE"], score: (f) => (f.at10 >= 60 && f.kp >= 50 ? (f.at10 + f.kp) / 2 - 3 : 0) },
  { title: "Burst Mage", roles: ["MIDDLE"], score: (f) => (f.dmg >= 65 && f.dmgShare >= 58 ? (f.dmg + f.dmgShare) / 2 - 2 : 0) },
  { title: "The Assassin", roles: ["MIDDLE", "JUNGLE"], score: (f) => (f.solo >= 60 && f.kills >= 58 ? (f.solo + f.kills) / 2 : 0) },

  // ── Bot: the carry seat ────────────────────────────────────────────────
  { title: "The Hypercarry", roles: ["BOTTOM"], score: (f) => (f.dmgShare >= 55 && f.dmg >= 50 ? 52 + (f.dmgShare + f.dmg) / 4 : 0) },
  { title: "Positioning God", roles: ["BOTTOM"], score: (f) => (f.dmg >= 58 && f.safe >= 62 ? (f.dmg + f.safe) / 2 : 0) },
  { title: "Late Game Insurance", roles: ["BOTTOM"], score: (f) => (f.fast <= 40 && f.dmgShare >= 55 ? (f.dmgShare + (100 - f.fast)) / 2 - 8 : 0) },
  { title: "Turret Melter", roles: ["BOTTOM"], score: (f) => (f.plates >= 58 && f.gold >= 55 ? (f.plates + f.gold) / 2 - 4 : 0) },
  { title: "Silent Carry", roles: ["BOTTOM", "MIDDLE"], score: (f) => (f.dmgShare >= 70 && f.kills <= 50 ? f.dmgShare : 0) },

  // ── Support: vision, engage, peel, roaming ─────────────────────────────
  { title: "The Warden", roles: ["UTILITY"], score: (f) => over(f.vision, 70) },
  { title: "The Bodyguard", roles: ["UTILITY"], score: (f) => (f.assists >= 50 && f.safe >= 45 ? 52 + (f.assists + f.safe) / 4 : 0) },
  { title: "The Engage", roles: ["UTILITY"], score: (f) => (f.fb >= 58 && f.dmgTaken >= 55 ? (f.fb + f.dmgTaken) / 2 : 0) },
  { title: "The Lifeline", roles: ["UTILITY"], score: (f) => (f.assists >= 65 && f.safe >= 55 ? (f.assists + f.safe) / 2 : 0) },
  { title: "Roam Enjoyer", roles: ["UTILITY"], score: (f) => (f.kp >= 60 && f.fb >= 52 ? (f.kp + f.fb) / 2 - 3 : 0) },
  { title: "Poke Support", roles: ["UTILITY"], score: (f) => (f.dmg >= 62 && f.dmgShare >= 50 ? (f.dmg + f.dmgShare) / 2 - 4 : 0) },
  { title: "Vision Denier", roles: ["UTILITY"], score: (f) => (f.vision >= 58 && f.kp >= 50 ? (f.vision + f.kp) / 2 - 6 : 0) },
  { title: "Sacrificial Play", roles: ["UTILITY"], score: (f) => (f.diesALot >= 60 && f.assists >= 58 ? (f.diesALot + f.assists) / 2 - 8 : 0) },

  // ── Shared support/jungle map-control identities ───────────────────────
  { title: "Playmaker", roles: ["JUNGLE", "MIDDLE", "UTILITY"], score: (f) => (f.kp >= 65 && f.assists >= 60 ? (f.kp + f.assists) / 2 : 0) },
  { title: "The Enabler", roles: ["JUNGLE", "UTILITY"], score: (f) => over(f.assists, 75) - 1 },
  { title: "First Blood Merchant", roles: ["JUNGLE", "UTILITY", "TOP", "MIDDLE"], score: (f) => over(f.fb, 70) },
  { title: "The Frontline", roles: ["TOP", "JUNGLE", "UTILITY"], score: (f) => over(f.dmgTaken, 70) },
  { title: "Space Creator", roles: ["TOP", "JUNGLE", "UTILITY"], score: (f) => (f.dmgTaken >= 55 && f.safe <= 45 ? f.dmgTaken - 8 : 0) },

  // ── Fighters — solo kills and executions, wherever they happen ─────────
  { title: "Duelist", roles: ["TOP", "JUNGLE", "MIDDLE"], score: (f) => over(f.solo, 70) },
  { title: "Executioner", roles: CARRIES, score: (f) => over(f.kills, 75) - 1 },
  { title: "Skirmish King", roles: SOLOS, score: (f) => (f.solo >= 55 && f.kda >= 55 ? (f.solo + f.kda) / 2 - 5 : 0) },
];

/** Whether a title's wording is true of the position holding it. */
function claimableBy(archetype: (typeof ARCHETYPES)[number], role: string): boolean {
  if (!archetype.roles) return true;
  return archetype.roles.includes(role.trim().toUpperCase() as ArchetypeRole);
}

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
      if (!claimableBy(archetype, facts.role)) continue;
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

/**
 * How much each of a role's five bars, plus winning, is worth in the OVR.
 *
 * The card is now scored on exactly what it displays. Before this, the bars
 * came from the measure vocabulary while the number came from POWER_WEIGHTS
 * — nine aggregate fields with no objectives, no turrets, no plates, no
 * laning and no damage share in them. A jungler's card showed an Objectives
 * bar while dragons and barons contributed nothing to their rating, and a
 * top laner's Turrets bar was pure decoration. Reading a card could not tell
 * you why the number was what it was.
 *
 * Every weight below keys a measure in that role's ROLE_BARS, plus `win`.
 * Winning is its own term rather than a bar because it belongs to all five
 * roles equally and is the one thing no per-role measure captures.
 *
 * The weights are judgement, not derivation — they say what the league
 * thinks each role is FOR. Tune them here; nothing else needs to know.
 *
 * WINNING IS WEIGHTED HEAVILY, and that is a correction rather than a
 * preference. Several measures are SHARES of a team's totals — damage share
 * and kill participation feed damage, presence, impact and combat between
 * them — and a share is anti-correlated with winning: a 2-0 stomp spreads
 * kills and damage across five players, while a 0-2 loss concentrates them
 * in whoever kept trying. With winning at 18 the share-driven measures
 * outvoted it, and a mid who lost 0-2 out-rated a mid who won 2-0 on the
 * same week. At 30 the result the game actually produced leads, and the
 * shares say how the player got there.
 */
export type ScoreWeights = { win: number } & Partial<Record<MeasureKey, number>>;

export const ROLE_SCORE_WEIGHTS: Record<string, ScoreWeights> = {
  // Wins lane, takes the map, survives being on an island.
  TOP: { win: 30, combat: 18, laning: 16, turrets: 12, survival: 12, impact: 12 },
  // Objectives are the job. Dragons and barons used to count for nothing.
  JUNGLE: { win: 30, combat: 16, objectives: 18, vision: 10, presence: 14, impact: 12 },
  MIDDLE: { win: 30, combat: 18, damage: 18, laning: 14, presence: 10, impact: 10 },
  // Damage is the reason a bot laner is fed everything the team has.
  BOTTOM: { win: 30, combat: 16, damage: 20, economy: 14, laning: 10, impact: 10 },
  // Vision and presence carry it; damage share barely matters, which is
  // what the old formula got most obviously wrong in the other direction.
  UTILITY: { win: 30, combat: 10, vision: 22, presence: 18, survival: 12, impact: 8 },
};

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  win: 30,
  combat: 18,
  damage: 18,
  economy: 14,
  vision: 10,
  impact: 10,
};

export function scoreWeightsForRole(roleMode: string | null | undefined): ScoreWeights {
  return (roleMode && ROLE_SCORE_WEIGHTS[roleMode]) || DEFAULT_SCORE_WEIGHTS;
}

/**
 * The card's 0-100 score: the weighted mean of its own bars and its winrate.
 *
 * Every input is already a percentile against the player's ROLE cohort, so
 * the output is on the same 0-100 scale the OVR curve expects and no
 * renormalising is needed. Divided by the weights actually used rather than
 * by 100, so a role whose weights do not sum to 100 still scores on scale.
 */
export function cardScore(
  roleMode: string | null | undefined,
  values: Record<MeasureKey, number>,
  winPctile: number,
): number {
  const weights = scoreWeightsForRole(roleMode);
  let total = 0;
  let used = 0;
  for (const [key, weight] of Object.entries(weights) as [keyof ScoreWeights, number][]) {
    if (!weight) continue;
    const value = key === "win" ? winPctile : values[key as MeasureKey];
    if (typeof value !== "number") continue;
    total += value * weight;
    used += weight;
  }
  // No usable weights would mean a role with no bars at all; the middle is
  // the only honest answer, and it keeps the curve from returning NaN.
  return used > 0 ? total / used : 50;
}

/**
 * A counting stat as a RATE, so a long game does not flatter it.
 *
 * Kills, deaths and assists are averaged per GAME, and a 45-minute game
 * simply contains more of all three than a 25-minute one. Percentiling the
 * per-game figure therefore rewards whoever happened to play the longer
 * games that week, which in a two- or three-game window is mostly luck of
 * the draw. Vision never had this problem — it was already per-minute —
 * and this is what gives the rest of the counting stats the same footing.
 *
 * A row with no recorded duration keeps its per-game value: a wrong scale
 * shared by nobody is worse than a right one shared by everyone, but zero
 * would be worse than both.
 */
function perMinute(row: PlayerAggRow, pick: (r: PlayerAggRow) => number): number {
  const minutes = row.avg_game_duration;
  return minutes > 0 ? pick(row) / minutes : pick(row);
}

/** Every bar's raw percentile for one player, before toStat()'s 20-99 squeeze.
 *  `totalsByKey` is every cohort member's per-game objective/turret work,
 *  which only the whole-league builder can assemble — a solo buildCard
 *  passes an empty map and those two bars land at the middle. Objectives and
 *  turrets are percentiled against the player's own ROLE cohort, same as
 *  every other bar: junglers take nearly every dragon/baron, so ranking a
 *  jungler's objective work against the whole league would put every
 *  jungler in the top decile at once and stop the bar from discriminating
 *  between them. */
function measureValues(
  cohort: PlayerAggRow[],
  row: PlayerAggRow,
  totals: GameTotals,
  totalsByKey: Map<string, GameTotals>,
): Record<MeasureKey, number> {
  const rc = roleCohort(cohort, row);
  const peerTotals = rc.map((r) => totalsByKey.get(playerKey(r)) ?? { objectives: 0, turrets: 0, visionWork: 0, mitigated: 0 });
  return {
    // kda and kp are already length-neutral (a ratio and a share); kills
    // and deaths are counts, so they go through perMinute.
    combat: mean([
      pct(rc, row, (r) => r.kda),
      pct(rc, row, (r) => perMinute(r, (x) => x.avg_kills)),
      pct(rc, row, (r) => r.avg_kp_pct),
      pct(rc, row, (r) => perMinute(r, (x) => x.avg_deaths), true),
    ]),
    damage: mean([pct(rc, row, (r) => r.avg_dmg_per_min), pct(rc, row, (r) => r.avg_dmg_share_pct)]),
    economy: mean([pct(rc, row, (r) => r.avg_cs_per_min), pct(rc, row, (r) => r.avg_gold_per_min)]),
    // Laning is farm lead AND beating the player in front of you. CS and
    // gold at 10 measure the first; solo kills and first bloods measure
    // the second, and nothing on the card measured it at all before. A
    // solo laner who wins their lane by killing rather than out-farming
    // used to read as an average laner.
    //
    // Farm keeps two thirds of the weight and duelling one, so this
    // sharpens the bar rather than turning it into a second Combat.
    // first_blood_involvements is a total for the window, so it divides by
    // games — there is one first blood per game however long it runs.
    laning: mean([
      pct(rc, row, (r) => r.avg_cs_at_10),
      pct(rc, row, (r) => r.avg_gold_at_10),
      mean([
        pct(rc, row, (r) => perMinute(r, (x) => x.avg_solo_kills)),
        pct(rc, row, (r) => (r.games > 0 ? r.first_blood_involvements / r.games : 0)),
      ]),
    ]),
    // Two halves, because vision_score alone cannot tell them apart.
    // Riot's score rewards having wards UP, so a player who farms uptime
    // and one who hunts the enemy's wards can land on the same number.
    // The second term is the denial-and-investment half: wards killed plus
    // control wards bought, per minute. Both halves are rates, so a longer
    // game gives no free credit — a bigger raw vision score across more
    // minutes is not more vision work.
    vision: mean([
      pct(rc, row, (r) => r.avg_vision_per_min),
      pctOf(peerTotals.map((t) => t.visionWork), totals.visionWork),
    ]),
    // Deaths per minute, not per game: surviving a 45-minute game with
    // three deaths is better than dying three times in 25, and the
    // per-game figure said they were identical.
    //
    // The second half is damage MITIGATED, not damage taken. Inverting
    // damage taken rewarded avoiding the fight, which is the opposite of
    // a top laner's job — and it put this bar in direct opposition to
    // Turrets, which needs diving and trading. Across a real week those
    // two correlated at -0.82, so no top laner could lead both and the
    // whole role's ceiling sat ten points under everyone else's.
    // Mitigation is what armour, MR and shields absorbed: it rewards
    // being in the fight AND living, which is what the bar always meant.
    survival: mean([
      pct(rc, row, (r) => perMinute(r, (x) => x.avg_deaths), true),
      pctOf(peerTotals.map((t) => t.mitigated), totals.mitigated),
    ]),
    presence: mean([pct(rc, row, (r) => r.avg_kp_pct), pct(rc, row, (r) => perMinute(r, (x) => x.avg_assists))]),
    impact: mean([pct(rc, row, (r) => r.avg_dmg_share_pct), pct(rc, row, (r) => r.avg_kp_pct)]),
    objectives: pctOf(peerTotals.map((t) => t.objectives), totals.objectives),
    turrets: pctOf(peerTotals.map((t) => t.turrets), totals.turrets),
  };
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
  /** team name (lowercased) -> abbreviation, same keying as teamImages. */
  teamAbbrs?: Map<string, string>;
  /** Chosen art skin number (card_art_prefs), 0 = base. */
  artSkin?: number;
  /** Player-chosen motto line (card_art_prefs). */
  motto?: string | null;
  /** This week's Weekly Standout — Card of the Week. */
  standout?: boolean;
  /** Every cohort member's per-game objective/turret work, keyed by
   *  playerKey — feeds the Objectives and Turrets bars, percentiled against
   *  the player's own role cohort. Absent — e.g. a solo build in tests —
   *  those two bars land at the middle, and this player's own totals are
   *  computed fresh from `games` instead of looked up. */
  totalsByKey?: Map<string, GameTotals>;
}

export function buildCard({
  row,
  cohort,
  games,
  gameLog,
  archetype,
  recordCategories = [],
  teamImages,
  teamAbbrs,
  artSkin = 0,
  motto = null,
  standout = false,
  totalsByKey = new Map<string, GameTotals>(),
}: BuildCardInput): PlayerCardData {
  const key = playerKey(row);

  // buildSeasonCards already computed every cohort member's totals once to
  // build totalsByKey — reuse this player's own entry instead of calling
  // gameTotals(games) a second time. A solo buildCard (no map) still needs
  // its own totals computed fresh.
  const totals = totalsByKey.get(key) ?? gameTotals(games);
  const values = measureValues(cohort, row, totals, totalsByKey);
  const bars = barsForRole(row.role_mode);

  // The number comes from the same measures the bars draw, so a card can be
  // read: the five bars and the win rate ARE the rating. powerRanking is no
  // longer consulted here — it scores nine aggregate fields that between
  // them contain no objectives, turrets, plates, laning or damage share.
  // Winrate goes in RAW, not as a percentile. It is already an absolute
  // 0-100 number, and every other input is a percentile only because "500
  // damage a minute" means nothing without a cohort to read it against.
  // Ranking it as well made a 2-0 week worth LESS in a role where more
  // players also went 2-0 — 95th percentile where two did, 77th where six
  // did, for the identical achievement. That is why whole roles topped out
  // ten OVR below others: the same result bought different credit
  // depending on how crowded the winners' bracket happened to be.
  const score = cardScore(row.role_mode, values, row.winrate_pct);
  const overall = Math.max(1, Math.min(99, Math.round(OVR_BASE + score * OVR_SCALE)));

  // Form: the last five results, weighted toward the streak the player is
  // currently on — still tracked for the flip-card dots and the "On A
  // Heater" archetype's streak count, even though it no longer prints as
  // its own bar (see CardSubStat's comment on the retired "form"/"clutch"
  // keys).
  const dated = [...games].sort((a, b) => (a.game_date ?? "").localeCompare(b.game_date ?? ""));
  const lastFive = lastFiveOf(dated);
  const streak = streakOf(lastFive);

  const clutchWr = clutchRate(dated, gameLog, row.winrate_pct / 100);

  const resolvedArchetype =
    archetype ??
    (() => {
      // Solo build: the player's own strongest claim, no scarcity.
      const facts = archetypeFacts(row, cohort, { streak, clutchWr });
      let best = { title: FALLBACK_ARCHETYPE, score: 0 };
      for (const candidate of ARCHETYPES) {
        if (!claimableBy(candidate, facts.role)) continue;
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
    teamImageUrl: teamName ? teamImages?.get(teamBadgeKey(teamName)) ?? null : null,
    teamAbbr: teamName ? teamAbbrs?.get(teamBadgeKey(teamName)) ?? null : null,
    role: ROLE_LABELS[row.role_mode] ?? row.role_mode,
    overall,
    tier: tierFor(overall),
    archetype: resolvedArchetype,
    signature: topChampions[0] ? { champion: topChampions[0].champion, games: topChampions[0].games } : null,
    artSkin,
    motto,
    serial: 0,
    collectionSize: cohort.length,
    topChampions,
    form: lastFive,
    highlights: computeHighlights(dated, gameLog),
    badges: computeBadges(row, dated, recordCategories),
    standout,
    subStats: bars.map((barKey) => ({ key: barKey, label: MEASURE_LABELS[barKey], value: toStat(values[barKey]) })),
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
  /** team name (lowercased) -> abbreviation, same keying as teamImages. */
  teamAbbrs?: Map<string, string>;
  /** player key -> chosen art (skin + motto) from card_art_prefs. */
  artPrefs?: Map<string, { skin: number; motto: string | null }>;
}

/** The whole league's cards with league-wide scarce archetypes, best
 *  overall first. */
export function buildSeasonCards({
  cohort,
  gamesByPlayer,
  gameLog,
  recordsByPlayer,
  teamImages,
  teamAbbrs,
  artPrefs,
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

  // Objective and turret work live on the per-game rows, not on the agg
  // view, so their cohort has to be assembled here where every player's
  // games are in hand. measureValues percentiles each player against just
  // their own role's slice of this map (roleCohort), not the flat map.
  // match_id -> minutes, so objective and turret work can be a rate rather
  // than a per-game count. Built once for the whole cohort.
  const durations = new Map<string, number>();
  for (const [matchId, meta] of gameLog) {
    if (meta.durationMin > 0) durations.set(matchId, meta.durationMin);
  }
  const totalsByKey = new Map<string, GameTotals>();
  for (const row of cohort) {
    const key = playerKey(row);
    totalsByKey.set(key, gameTotals(gamesByPlayer.get(key) ?? [], durations));
  }

  const cards = cohort
    .map((row) => {
      const key = playerKey(row);
      const prefs = artPrefs?.get(key) ?? null;
      return buildCard({
        row,
        cohort,
        games: gamesByPlayer.get(key) ?? [],
        gameLog,
        archetype: archetypes.get(key),
        recordCategories: recordsByPlayer?.get(key) ?? [],
        teamImages,
        teamAbbrs,
        totalsByKey,
        artSkin: prefs?.skin ?? 0,
        motto: prefs?.motto ?? null,
      });
    })
    .sort((a, b) => b.overall - a.overall || a.name.localeCompare(b.name))
    // Collector serials: rank in the sorted collection, best card = #001.
    .map((card, index) => ({ ...card, serial: index + 1 }));

  // Cards of the Week: the highest-rated card in each role. Judged by the
  // cards' own OVR (not the homepage's weekly-power pipeline, whose
  // slightly different aggregation can disagree with the ratings printed
  // on the cards) — the crown always sits on the role's top card, and it
  // still changes hands as ratings move week to week.
  const crowned = new Set<string>();
  return cards.map((card) => {
    if (crowned.has(card.role)) return card;
    crowned.add(card.role);
    return { ...card, standout: true };
  });
}

/** The shared player key ("name#tag", lowercased) — exported so data
 *  layers key their maps the same way the engine does. */
export function cardPlayerKey(summonerName: string, tag: string): string {
  return playerKey({ summoner_name: summonerName, tag });
}
