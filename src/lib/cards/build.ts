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
//
// TWO RATINGS LIVE HERE. Seasons up to Premier S5 and Academy A1 are rated
// by the measures below (legacyRating) and always will be — see
// LEGACY_RATING_SEASONS in styleYardsticks.ts. From S6 and A2 on, a card is
// rated by playstyle (styleRating.ts): 30% winning, 40% fundamentals, 30%
// how well the player did their champion's job, graded against the league's
// history of that style. That history is regenerated at every season
// rollover by scripts/build-style-yardstick.ts.

import { championDisplayName } from "@/lib/match-draft/champions";
import type { PlayerAggRow } from "@/lib/stats/types";
import { soloArchetype, type ArchetypeExtras, assignArchetypes } from "./archetypeTitles";
import { cardSlug, playerKey, teamBadgeKey, tierFor } from "./cardKeys";
import { MEASURE_LABELS, type MeasureKey, type StyleMeasureKey, barsForRole, gameTotals, mean, pctOf, type GameTotals } from "./measures";
import { createCardPercentiles, roleCohort, type CardPercentile } from "./percentiles";
import { cardScore } from "./score";
import { rateByStyle, type StyleRating, type StyleYardstick } from "./styleRating";

// The engine's pieces live in their own modules; these re-exports keep
// every existing `from "./build"` import working.
export { ARCHETYPE_TITLES, assignArchetypes, type ArchetypeExtras } from "./archetypeTitles";
export { FALLBACK_ARCHETYPE, cardPlayerKey, cardSlug, teamBadgeKey, tierFor } from "./cardKeys";
export { CARD_METRICS, createCardPercentiles, type CardMetric, type CardPercentile } from "./percentiles";
export { DEFAULT_SCORE_WEIGHTS, ROLE_SCORE_WEIGHTS, cardScore, scoreWeightsForRole, type ScoreWeights } from "./score";

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
  /** Read only by the style rating (styleRating.ts), which grades each game
   *  on its champion's job and needs the game's own role, its lane opponent
   *  (same role, other team), and the job stats themselves. Optional, like
   *  the columns above: the rating that came before never reads them. */
  role?: string | null;
  game_duration_min?: number | null;
  damage_share_pct?: number | null;
  damage_taken?: number | null;
  solo_kills?: number | null;
  time_ccing_others_s?: number | null;
  effective_heal_and_shield?: number | null;
  cs_at_10?: number | null;
  gold_at_10?: number | null;
  xp_at_10?: number | null;
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
   *  whatever a card holds. StyleMeasureKey is what a style-rated card
   *  (S6/A2 onward) carries; its "style" bar is labelled per card. */
  key: MeasureKey | StyleMeasureKey | "form" | "clutch";
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
  /** Set only on a pulled roster plate — see TeamPrint. Like `moment` and
   *  `champWin`, the renderer branches on this before reading a rating. */
  team?: import("./teamCards").TeamPrint | null;
  /** Set on a copy that won a Weekly Draw — cosmetic provenance only;
   *  dust pricing never reads it. weekStart is the drawn week's Monday. */
  drawWin?: { weekStart: string } | null;
  /** Set on a copy that came back marked from an expedition — cosmetic
   *  provenance only, never read by dust pricing. Replaceable only
   *  upward (trail < sigil < legend); see lib/expeditions/config.ts. */
  expedition?: { mark: "trail" | "sigil" | "legend"; tier: string; date: string } | null;
  /** Set on a copy that came home changed from an expedition — one per
   *  copy, permanent until an Exorcism, and READ by Fantasy scoring and
   *  dust pricing (src/lib/cards/mutations.ts). `run` is the
   *  expedition_runs id that did it. */
  mutation?: { key: "irradiated" | "hardened" | "haunted" | "cursed" | "voidtouched" | "voidborn"; date: string; run: number } | null;
  /** Set on a copy an expedition found rather than a pack: a moment on
   *  the squad echoed, and the route dropped this card from the moment's
   *  game. Cosmetic provenance only; nothing prices it. */
  echo?: { run: number; moment: number; date: string } | null;
  /** Set while a copy is benched after an expedition went badly — no
   *  expeditions until `until`. Cleared by the next stamp or ignored once
   *  it has passed; never read by pricing. */
  wounded?: { until: string; run: number } | null;
  /** The roads this copy has walked: stamped by the expedition claim's
   *  trigger on every survivor (20261010000001), read by
   *  src/lib/expeditions/trail.ts for the titles it earns. Never read by
   *  pricing; a Wayfarer's one extra shine is the whole mechanical effect. */
  trail?: { miles: number; runs: number; deepest: string } | null;
  /** Set only on a campaign relic (src/lib/expeditions/campaigns.ts): a
   *  one-off print of a finale survivor in the campaign's frame, minted
   *  by advance_expedition_campaign. Worth a relic's shine and kept off
   *  the routes that can lose a card; dusts as its tier. */
  campaign?: { key: "broken_map" | "lost_print"; date: string; campaign: number; runs: number[]; from: number } | null;
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
  /** Explicit cosmetic art champion. Null/absent on older frozen copies; live
   *  renderers fall back to the calculated signature champion. */
  artChampion?: string | null;
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
  /** Eastern-calendar week used by a live homepage/card-hub snapshot.
   * Null means the reader fell back to a season-wide build. */
  snapshotWeek?: string | null;
  pentas: number;
  season: string;
  /** Stamped on copies opened inside a Live Drops window — the label the
   *  admin gave the window. Frozen at mint like everything else here. */
  live?: { label: string } | null;
  /** Stamped on the FIRST copy to match a week's chase. */
  chase?: { title: string } | null;
  /** The Send-off: a playoff-edition print, stamped with how far the
   *  player's team got. Set by the edition builder on the week a team's
   *  split ended (src/lib/cards/sendoff.ts) and frozen on pulled copies
   *  like every other stamp. Never read by pricing; the renderer draws the
   *  stamp and, for a champion, the frame. Inline type import for the same
   *  reason as `team`: sendoff.ts imports PlayerCardData from here. */
  sendoff?: import("./sendoff").SendoffMark | null;
  /** The player's playoff run — the games they played from the bracket's
   *  first week onward — attached by fetchSeasonCards off the season's
   *  fixtures, and null before the bracket or for a player who never
   *  played in it. A Send-off prints this as its record line in place of
   *  the season's (sendoff.ts): the season's W-L on a playoff card reads
   *  as the series score it is not. */
  playoffs?: { wins: number; losses: number } | null;
  /** The finishes — src/lib/packs/rarities.ts rolls them at mint, over the
   *  parallel and the ink, and freezes them here like every other stamp.
   *  Shiny: the art hue-shifted, priced ×SHINY_DUST_MULT. */
  shiny?: boolean | null;
  /** Secret: a print numbered PAST the checklist — `number` is the
   *  over-number (collection size + how many Secrets had been found before
   *  it this season), `of` the checklist it overran. Priced
   *  ×SECRET_DUST_MULT; one per pack at most. */
  secret?: { number: number; of: number } | null;
  /** StatTrak: a counter of the pictured player's Fantasy Pts (the stats
   *  tab's tally, game by game) for every game played while this copy is
   *  held — fielded or not. `points` is bumped by the weekly drop,
   *  `through` is the last game counted, and both reset when the copy
   *  changes hands; `since` is when the count started. Never priced. */
  stattrak?: { points: number; since: string; through?: string | null } | null;
  /** How many times this copy has been fielded (expedition launch,
   *  scored Fantasy week). Bumped by SQL (wear_cards, migration 20260922);
   *  read as a grade by src/lib/cards/wear.ts. Never priced. */
  wear?: number | null;
  /** The Dribb card (src/lib/cards/dribb.ts): `number` is which of the
   *  five this copy is, in the order found. Set only by the pack roller;
   *  the renderer draws the Aether Rift treatment off it, dust refuses it,
   *  and expeditions treat it as one of five. */
  dribb?: { number: number; of: number } | null;
  /** The On Air print — one of the casters, minted inside a Live Drops window. */
  onAir?: { profileId: string; name: string; number: number; of: number; window: string } | null;
  /** The owner sealed the copy: `wear` is the count frozen at that moment,
   *  `at` when. A slabbed copy can never be fielded again — refused in SQL
   *  for expeditions and server-side for Fantasy — and the slab itself can
   *  never be removed (slab_seal trigger). */
  slab?: { wear: number; at: string } | null;
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

const ROLE_LABELS: Record<string, string> = {
  TOP: "Top",
  JUNGLE: "Jungle",
  MIDDLE: "Mid",
  BOTTOM: "Bot",
  UTILITY: "Support",
};

/** Maps a 0-100 percentile onto the 20-99 sub-stat scale (nobody's bar
 *  should look empty — even the league's last place grinds games). */
function toStat(percentile: number): number {
  return Math.round(20 + Math.max(0, Math.min(100, percentile)) * 0.79);
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
  percentile: CardPercentile,
): Record<MeasureKey, number> {
  const rc = roleCohort(cohort, row);
  const peerTotals = rc.map((r) => totalsByKey.get(playerKey(r)) ?? { objectives: 0, turrets: 0, visionWork: 0, mitigated: 0 });
  return {
    // kda and kp are already length-neutral (a ratio and a share); kills
    // and deaths are counts, so they go through perMinute.
    combat: mean([
      percentile(row, "kda"),
      percentile(row, "killsPerMinute"),
      percentile(row, "avg_kp_pct"),
      percentile(row, "deathsPerMinute", true),
    ]),
    damage: mean([percentile(row, "avg_dmg_per_min"), percentile(row, "avg_dmg_share_pct")]),
    economy: mean([percentile(row, "avg_cs_per_min"), percentile(row, "avg_gold_per_min")]),
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
      percentile(row, "avg_cs_at_10"),
      percentile(row, "avg_gold_at_10"),
      mean([
        percentile(row, "soloKillsPerMinute"),
        percentile(row, "firstBloodsPerGameOrZero"),
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
      percentile(row, "avg_vision_per_min"),
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
      percentile(row, "deathsPerMinute", true),
      pctOf(peerTotals.map((t) => t.mitigated), totals.mitigated),
    ]),
    presence: mean([percentile(row, "avg_kp_pct"), percentile(row, "assistsPerMinute")]),
    impact: mean([percentile(row, "avg_dmg_share_pct"), percentile(row, "avg_kp_pct")]),
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
  /** Chosen cosmetic champion. Null means use the calculated signature champ. */
  artChampion?: string | null;
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
  /** The player's style rating (styleRating.ts), for a season rated by
   *  playstyle — S6 and A2 onward. Absent, the card is rated the way every
   *  season before those was. buildSeasonCards fills it in. */
  rating?: StyleRating;
}

/**
 * The rating every season up to S5 and A1 was printed with, and still is:
 * those seasons' live cards, and any rebuild of their editions, must keep
 * producing exactly the numbers already frozen on copies people own.
 */
function legacyRating(
  row: PlayerAggRow,
  cohort: PlayerAggRow[],
  totals: GameTotals,
  totalsByKey: Map<string, GameTotals>,
  percentile: CardPercentile,
): { overall: number; subStats: CardSubStat[] } {
  const values = measureValues(cohort, row, totals, totalsByKey, percentile);
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
  return {
    overall,
    subStats: bars.map((barKey) => ({ key: barKey, label: MEASURE_LABELS[barKey], value: toStat(values[barKey]) })),
  };
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
  artChampion = null,
  motto = null,
  standout = false,
  totalsByKey = new Map<string, GameTotals>(),
  rating,
}: BuildCardInput, percentile = createCardPercentiles(cohort)): PlayerCardData {
  const key = playerKey(row);

  // buildSeasonCards already computed every cohort member's totals once to
  // build totalsByKey — reuse this player's own entry instead of calling
  // gameTotals(games) a second time. A solo buildCard (no map) still needs
  // its own totals computed fresh.
  const { overall, subStats } = rating
    ? { overall: rating.overall, subStats: rating.bars.map((bar) => ({ key: bar.key, label: bar.label, value: toStat(bar.value) })) }
    : legacyRating(row, cohort, totalsByKey.get(key) ?? gameTotals(games), totalsByKey, percentile);

  // Form: the last five results, weighted toward the streak the player is
  // currently on — still tracked for the flip-card dots and the "On A
  // Heater" archetype's streak count, even though it no longer prints as
  // its own bar (see CardSubStat's comment on the retired "form"/"clutch"
  // keys).
  const dated = [...games].sort((a, b) => (a.game_date ?? "").localeCompare(b.game_date ?? ""));
  const lastFive = lastFiveOf(dated);
  const streak = streakOf(lastFive);

  const clutchWr = clutchRate(dated, gameLog, row.winrate_pct / 100);

  // Solo build: the player's own strongest claim, no scarcity.
  const resolvedArchetype = archetype ?? soloArchetype(row, { streak, clutchWr }, percentile);

  // Champion pool: most-played first, then win rate, then KDA, then the
  // name. raw_stats stores Riot's internal championName ("MonkeyKing",
  // "MissFortune") — canonicalize to display names so art resolves and
  // aliases merge.
  //
  // KDA sits between win rate and the alphabet because the two champions
  // that reach it are already tied on how often they were played and how
  // often they won: the only question left is which one was played BETTER,
  // and the alphabet cannot answer that. It is aggregate rather than a mean
  // of per-game ratios — (all kills + all assists) over all deaths — so one
  // deathless game cannot outvote a fortnight of them.
  //
  // Deaths floor at 1 for the division. A perfect record would otherwise be
  // Infinity, which sorts fine but stops being a number the moment anything
  // else touches it.
  const byChampion = new Map<
    string,
    { games: number; wins: number; kills: number; deaths: number; assists: number }
  >();
  for (const g of dated) {
    const name = g.champion?.trim();
    if (!name) continue;
    const display = championDisplayName(name);
    const entry = byChampion.get(display) ?? { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
    entry.games += 1;
    if (g.win === true) entry.wins += 1;
    entry.kills += g.kills ?? 0;
    entry.deaths += g.deaths ?? 0;
    entry.assists += g.assists ?? 0;
    byChampion.set(display, entry);
  }
  const topChampions = [...byChampion.entries()]
    .map(([champion, stats]) => ({
      champion,
      games: stats.games,
      wins: stats.wins,
      kda: (stats.kills + stats.assists) / Math.max(stats.deaths, 1),
    }))
    .sort(
      (a, b) =>
        b.games - a.games ||
        b.wins / b.games - a.wins / a.games ||
        b.kda - a.kda ||
        a.champion.localeCompare(b.champion),
    )
    // kda was for the sort, not for the card: topChampions is part of every
    // frozen copy's json, and widening that shape would make old copies and
    // new ones disagree about what a champion entry is.
    .map(({ champion, games, wins }) => ({ champion, games, wins }))
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
    artChampion: artChampion ?? (topChampions[0]?.champion ?? null),
    artSkin,
    motto,
    serial: 0,
    collectionSize: cohort.length,
    topChampions,
    form: lastFive,
    highlights: computeHighlights(dated, gameLog),
    badges: computeBadges(row, dated, recordCategories),
    standout,
    subStats,
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
  /** player key -> chosen art (champion, skin + motto) from card_art_prefs. */
  artPrefs?: Map<string, { artChampion?: string | null; skin: number; motto: string | null }>;
  /**
   * The history this season is graded against, when the season is rated by
   * playstyle (styleRating.ts) — S6 and A2 onward. Null or absent rates the
   * way every season before those was, which is what S1-S5 and A1 must keep
   * doing. The data layer decides (styleYardsticks.ts): the season is the
   * one thing it knows and this function does not.
   */
  yardstick?: StyleYardstick | null;
}

/**
 * Every cohort member's per-game objective, turret, vision and mitigation
 * work. It lives on the per-game rows, not on the agg view, so it has to be
 * assembled where every player's games are in hand; measureValues and the
 * style rating each percentile a player against their own role's slice.
 * Rates rather than per-game counts, over match_id -> minutes built once.
 */
function cohortTotals(
  cohort: PlayerAggRow[],
  gamesByPlayer: Map<string, CardGameRow[]>,
  gameLog: Map<string, CardGameMeta>,
): Map<string, GameTotals> {
  const durations = new Map<string, number>();
  for (const [matchId, meta] of gameLog) {
    if (meta.durationMin > 0) durations.set(matchId, meta.durationMin);
  }
  const totalsByKey = new Map<string, GameTotals>();
  for (const row of cohort) {
    const key = playerKey(row);
    totalsByKey.set(key, gameTotals(gamesByPlayer.get(key) ?? [], durations));
  }
  return totalsByKey;
}

function styleRatings(
  cohort: PlayerAggRow[],
  gamesByPlayer: Map<string, CardGameRow[]>,
  gameLog: Map<string, CardGameMeta>,
  yardstick: StyleYardstick,
  percentile: CardPercentile,
  totalsByKey: Map<string, GameTotals>,
): Map<PlayerAggRow, StyleRating> {
  return rateByStyle({
    cohort,
    gamesOf: (row) => gamesByPlayer.get(playerKey(row)) ?? [],
    allGames: [...gamesByPlayer.values()].flat(),
    gameLog,
    yardstick,
    percentile,
    totalsOf: (row) => totalsByKey.get(playerKey(row)) ?? { objectives: 0, turrets: 0, visionWork: 0, mitigated: 0 },
  });
}

/**
 * The style ratings buildSeasonCards prints for a playstyle-rated window,
 * unrounded. Exported for the yardstick generator, which fits the OVR curve
 * to these scores — through this function, so the fit can never drift from
 * what the cards themselves compute.
 */
export function seasonStyleRatings({
  cohort,
  gamesByPlayer,
  gameLog,
  yardstick,
}: Pick<BuildSeasonCardsInput, "cohort" | "gamesByPlayer" | "gameLog"> & { yardstick: StyleYardstick }): Map<PlayerAggRow, StyleRating> {
  const percentile = createCardPercentiles(cohort);
  return styleRatings(cohort, gamesByPlayer, gameLog, yardstick, percentile, cohortTotals(cohort, gamesByPlayer, gameLog));
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
  yardstick = null,
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
  const percentile = createCardPercentiles(cohort);
  const archetypes = assignArchetypes(cohort, extrasByKey, percentile);
  const totalsByKey = cohortTotals(cohort, gamesByPlayer, gameLog);
  // A season rated by playstyle is rated as a whole here — every player's
  // games are graded against the style yardstick, and the lane opponents and
  // team totals those grades need are other players' rows.
  const ratings = yardstick ? styleRatings(cohort, gamesByPlayer, gameLog, yardstick, percentile, totalsByKey) : null;

  const cards = cohort
    .map((row) => {
      const key = playerKey(row);
      const prefs = artPrefs?.get(key) ?? null;
      const card = buildCard({
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
        artChampion: prefs?.artChampion ?? null,
        motto: prefs?.motto ?? null,
        rating: ratings?.get(row),
      }, percentile);
      const eligible = new Set(
        (gamesByPlayer.get(key) ?? [])
          .map((game) => game.champion?.trim())
          .filter((champion): champion is string => Boolean(champion))
          .map((champion) => championDisplayName(champion)),
      );
      // A null art champion is the legacy skin-only preference and belongs to
      // the computed signature champion. A named override must still be
      // played in this split; if match corrections make it invalid, reads fall
      // back to the computed champion/base without mutating the saved row.
      if (prefs?.artChampion && !eligible.has(championDisplayName(prefs.artChampion))) {
        return { ...card, artChampion: card.signature?.champion ?? null, artSkin: 0 };
      }
      return {
        ...card,
        artChampion: prefs?.artChampion ? championDisplayName(prefs.artChampion) : card.signature?.champion ?? null,
      };
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
