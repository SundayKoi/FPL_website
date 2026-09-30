// Archetype titles: the pool of titles a card can carry and the league-wide
// scarce assignment that hands them out. Split out of build.ts, which
// re-exports the public names.

import type { PlayerAggRow } from "@/lib/stats/types";
import { FALLBACK_ARCHETYPE, playerKey } from "./cardKeys";
import { mean } from "./measures";
import { createCardPercentiles, type CardPercentile } from "./percentiles";

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

function archetypeFacts(row: PlayerAggRow, extras: ArchetypeExtras, percentile: CardPercentile): ArchetypeFacts {
  return {
    role: row.role_mode,
    winrate: row.winrate_pct,
    pentas: row.total_pentas,
    streak: extras.streak,
    clutchWr: extras.clutchWr,
    kda: percentile(row, "kda"),
    dmg: percentile(row, "avg_dmg_per_min"),
    dmgShare: percentile(row, "avg_dmg_share_pct"),
    dmgTaken: percentile(row, "avg_dmg_taken_per_min"),
    kills: percentile(row, "avg_kills"),
    assists: percentile(row, "avg_assists"),
    diesALot: percentile(row, "avg_deaths"),
    safe: percentile(row, "avg_deaths", true),
    kp: percentile(row, "avg_kp_pct"),
    cs: percentile(row, "avg_cs_per_min"),
    gold: percentile(row, "avg_gold_per_min"),
    at10: mean([
      percentile(row, "avg_cs_at_10"),
      percentile(row, "avg_gold_at_10"),
      percentile(row, "avg_xp_at_10"),
    ]),
    vision: percentile(row, "avg_vision_per_min"),
    solo: percentile(row, "avg_solo_kills"),
    fb: percentile(row, "firstBloodsPerGame"),
    plates: percentile(row, "platesPerGame"),
    multi: percentile(row, "multiKillsPerGame"),
    // Short average games, percentile-inverted: high = closes games out.
    fast: percentile(row, "avg_game_duration", true),
    gamesPct: percentile(row, "games"),
  };
}

/** Score 0 = doesn't qualify. `over` gates a percentile on a floor. */
const over = (value: number, min: number): number => (value >= min ? value : 0);

/** The five positions a title can be gated to. `role_mode` speaks these
 *  codes; build.ts's ROLE_LABELS turns them into the words printed on
 *  the card. */
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

/** Every title the pool can mint. An expedition reads each one as an edge
 *  (expeditions/archetypes.ts), and its test fails on a title with none. */
export const ARCHETYPE_TITLES = ARCHETYPES.map((a) => a.title);

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
export function assignArchetypes(
  cohort: PlayerAggRow[],
  extrasByKey: Map<string, ArchetypeExtras>,
  percentile = createCardPercentiles(cohort),
): Map<string, string> {
  const claims: { key: string; title: string; score: number }[] = [];
  for (const row of cohort) {
    const key = playerKey(row);
    const facts = archetypeFacts(row, extrasByKey.get(key) ?? { streak: 0, clutchWr: row.winrate_pct / 100 }, percentile);
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

/** A solo build's title: the player's own strongest claim, no scarcity. */
export function soloArchetype(row: PlayerAggRow, extras: ArchetypeExtras, percentile: CardPercentile): string {
  const facts = archetypeFacts(row, extras, percentile);
  let best = { title: FALLBACK_ARCHETYPE, score: 0 };
  for (const candidate of ARCHETYPES) {
    if (!claimableBy(candidate, facts.role)) continue;
    const s = candidate.score(facts);
    if (s > best.score) best = { title: candidate.title, score: s };
  }
  return best.title;
}
