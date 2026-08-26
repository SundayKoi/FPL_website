// Moment cards: the rare single-game performance, frozen as its own card.
//
// A player card is a season average — it smooths away the one night someone
// went off. This is the opposite: one game, the real stat line, the date it
// happened.
//
// SCARCITY IS THE POINT. Three independent brakes, because thresholds alone
// are a guess about what is rare and a guess can be wrong:
//
//   1. Compound triggers. Almost nothing mints on a single stat — a
//      zero-death game alone happens several times a week in amateur play,
//      so it has to arrive with carry attached.
//   2. One per player per week. A good night is one moment, not three.
//   3. A hard league-wide weekly cap, applied after ranking by rarity. This
//      is the brake that actually holds: however wild a week gets, the
//      number minted is bounded, and the ones that survive are the rarest
//      of what happened rather than the first detected.

import type { PlayerCardData } from "./build";

/** Moments minted per league per week, after ranking. Roughly one per team
 *  per season at a 12-team league. */
export const MOMENTS_PER_WEEK = 2;

export interface MomentStatRow {
  match_id: string | null;
  season: string | null;
  game_date: string | null;
  summoner_name: string | null;
  tag: string | null;
  team_name: string | null;
  champion: string | null;
  role: string | null;
  win: boolean | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  solo_kills: number | null;
  penta_kills: number | null;
  quadra_kills: number | null;
  largest_killing_spree: number | null;
  kill_participation_pct: number | null;
  damage_share_pct: number | null;
  objectives_stolen: number | null;
  largest_critical_strike: number | null;
  bounty_gold: number | null;
  nexus_kills: number | null;
  solo_turrets_late_game: number | null;
  effective_heal_and_shield: number | null;
  max_cs_advantage_on_lane_opponent: number | null;
  max_level_lead_on_lane_opponent: number | null;
  damage_mitigated: number | null;
  on_my_way_pings: number | null;
  game_duration_min: number | null;
}

export interface MomentTrigger {
  key: string;
  /** What the card calls itself. */
  title: string;
  /** Higher wins the weekly cap. Spaced out so ties are rare and a tie
   *  break never decides between two genuinely different rarities. */
  rarity: number;
  qualifies: (row: MomentStatRow) => boolean;
  /** The one line under the title, built from the real numbers. */
  headline: (row: MomentStatRow) => string;
}

const num = (value: number | null | undefined): number => value ?? 0;
const kda = (row: MomentStatRow) => `${num(row.kills)}/${num(row.deaths)}/${num(row.assists)}`;

/** Ordered by rarity so the list reads as a ladder; the cap sorts anyway. */
export const MOMENT_TRIGGERS: MomentTrigger[] = [
  {
    key: "pentakill",
    title: "PENTAKILL",
    rarity: 100,
    // The one trigger that stands alone — a penta needs no help being rare.
    qualifies: (row) => num(row.penta_kills) >= 1,
    headline: (row) => `Five in a row · ${kda(row)}`,
  },
  {
    key: "baron_steal",
    title: "THE STEAL",
    rarity: 85,
    qualifies: (row) => num(row.objectives_stolen) >= 1,
    headline: (row) => `${num(row.objectives_stolen)} objective${num(row.objectives_stolen) === 1 ? "" : "s"} stolen · ${kda(row)}`,
  },
  {
    key: "godlike",
    title: "GODLIKE",
    rarity: 75,
    // 8+ is legendary and beyond; pairing with a win keeps out the spree
    // that happened while the game was already lost.
    qualifies: (row) => num(row.largest_killing_spree) >= 8 && row.win === true,
    headline: (row) => `${num(row.largest_killing_spree)}-kill spree · ${kda(row)}`,
  },
  {
    key: "quadra",
    title: "QUADRA KILL",
    rarity: 70,
    qualifies: (row) => num(row.quadra_kills) >= 1 && row.win === true,
    headline: (row) => `Four at once · ${kda(row)}`,
  },
  {
    key: "solo_carry",
    title: "SOLO CARRY",
    rarity: 65,
    qualifies: (row) => num(row.solo_kills) >= 4 && row.win === true,
    headline: (row) => `${num(row.solo_kills)} solo kills · ${kda(row)}`,
  },
  {
    key: "flawless",
    title: "FLAWLESS",
    rarity: 60,
    // Deathless is not enough on its own — it also has to be a game they
    // were actually in, hence the kill participation.
    qualifies: (row) =>
      num(row.deaths) === 0 && num(row.kill_participation_pct) >= 70 && row.win === true,
    headline: (row) => `No deaths · ${Math.round(num(row.kill_participation_pct))}% KP`,
  },
  {
    key: "backdoor",
    title: "THE BACKDOOR",
    rarity: 80,
    // A nexus last-hit alone is one per winning game; two SOLO late-game
    // towers on top is what separates "pressed the button" from "won it
    // alone while the team fought elsewhere".
    qualifies: (row) => num(row.nexus_kills) >= 1 && num(row.solo_turrets_late_game) >= 2,
    headline: (row) => `Ended it alone · ${num(row.solo_turrets_late_game)} solo late towers`,
  },
  {
    key: "bounty_hunter",
    title: "BOUNTY HUNTER",
    rarity: 58,
    // A four-figure bounty haul means someone else's spree economy got
    // personally dismantled.
    qualifies: (row) => num(row.bounty_gold) >= 1000 && row.win === true,
    headline: (row) => `${num(row.bounty_gold)}g of bounties collected · ${kda(row)}`,
  },
  {
    key: "nuke",
    title: "THE NUKE",
    rarity: 55,
    // One number, one screenshot. No win gate — a 1500 crit is the story
    // whatever the scoreboard said.
    qualifies: (row) => num(row.largest_critical_strike) >= 1500,
    headline: (row) => `${num(row.largest_critical_strike)} damage in one hit · ${kda(row)}`,
  },
  {
    key: "lane_kingdom",
    title: "LANE KINGDOM",
    rarity: 52,
    qualifies: (row) =>
      num(row.max_cs_advantage_on_lane_opponent) >= 50 &&
      num(row.max_level_lead_on_lane_opponent) >= 2 &&
      row.win === true,
    headline: (row) =>
      `+${Math.round(num(row.max_cs_advantage_on_lane_opponent))} CS and ${num(row.max_level_lead_on_lane_opponent)} levels on lane`,
  },
  {
    key: "damage_monster",
    title: "THE WHOLE TEAM",
    rarity: 50,
    qualifies: (row) => num(row.damage_share_pct) >= 40 && row.win === true,
    headline: (row) => `${Math.round(num(row.damage_share_pct))}% of the team's damage · ${kda(row)}`,
  },
  {
    key: "raid_boss",
    title: "THE RAID BOSS",
    rarity: 48,
    qualifies: (row) => num(row.damage_mitigated) >= 25000 && row.win === true,
    headline: (row) => `${(num(row.damage_mitigated) / 1000).toFixed(1)}k damage soaked · ${kda(row)}`,
  },
  {
    key: "bodyguard",
    title: "BODYGUARD",
    rarity: 47,
    // The support moment that is not wards: heal + shield that actually
    // landed (Riot's "effective" number discounts overheal).
    qualifies: (row) => num(row.effective_heal_and_shield) >= 12000 && row.win === true,
    headline: (row) => `${(num(row.effective_heal_and_shield) / 1000).toFixed(1)}k healed & shielded · ${kda(row)}`,
  },
  {
    key: "on_my_way",
    title: "HE'S ON HIS WAY",
    rarity: 40,
    // Pure comedy, and deliberately no win gate: sixty OMW pings is a
    // performance in its own right.
    qualifies: (row) => num(row.on_my_way_pings) >= 60,
    headline: (row) => `${num(row.on_my_way_pings)} "on my way" pings · ${kda(row)}`,
  },
];

/**
 * Which colorway a trigger prints in. Families, not per-trigger colors, so
 * a new trigger never needs new CSS: ember burns for kill drama, void for
 * heists and objectives, ice for perfection and defiance, gold for the
 * guardian and the comedian.
 */
export type MomentFamily = "ember" | "void" | "ice" | "gold";

const MOMENT_FAMILIES: Record<string, MomentFamily> = {
  pentakill: "ember",
  quadra: "ember",
  godlike: "ember",
  solo_carry: "ember",
  damage_monster: "ember",
  nuke: "ember",
  baron_steal: "void",
  backdoor: "void",
  bounty_hunter: "void",
  flawless: "ice",
  lane_kingdom: "ice",
  raid_boss: "ice",
  bodyguard: "gold",
  on_my_way: "gold",
};

/** Ember as the fallback: a retired or unknown trigger still prints in the
 *  family the loudest moments use, never unstyled. */
export function momentFamilyOf(triggerKey: string | null | undefined): MomentFamily {
  return MOMENT_FAMILIES[triggerKey ?? ""] ?? "ember";
}

/** 1 -> "1st" — the mint ordinal a copy's serial chip prints. */
export function mintOrdinal(serial: number): string {
  const mod100 = serial % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${serial}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[serial % 10] ?? "th";
  return `${serial}${suffix}`;
}

/** 31.7 minutes -> "31:42". Null stays null: an old moment minted before
 *  the clock was captured shows no clock rather than a fake one. */
export function gameClock(durationMin: number | null | undefined): string | null {
  if (durationMin === null || durationMin === undefined || !Number.isFinite(durationMin)) return null;
  const totalSeconds = Math.round(durationMin * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export interface MomentCandidate {
  season: string;
  matchId: string;
  slug: string;
  summonerName: string;
  tag: string;
  teamName: string | null;
  champion: string | null;
  role: string | null;
  triggerKey: string;
  title: string;
  headline: string;
  rarity: number;
  gameDate: string | null;
  /** The other team in the match, derived from the match's own rows. */
  opponent: string | null;
  durationMin: number | null;
}

/** Magnitude within a trigger, for breaking ties between two of the same
 *  kind — the bigger penta game wins. Deliberately crude: it only ever
 *  decides between candidates that already tied on rarity. */
function magnitude(row: MomentStatRow): number {
  return (
    num(row.penta_kills) * 1000 +
    num(row.objectives_stolen) * 500 +
    num(row.largest_killing_spree) * 50 +
    num(row.solo_kills) * 25 +
    num(row.kills) * 5 +
    num(row.kill_participation_pct)
  );
}

/**
 * Every qualifying performance in `rows`, best trigger per row.
 *
 * `slugOf` is injected rather than imported so this module stays free of
 * the card build pipeline — the caller already has cardSlug.
 */
export function findMomentCandidates(
  rows: MomentStatRow[],
  slugOf: (summonerName: string, tag: string) => string,
): MomentCandidate[] {
  // Every match's team names, so a candidate can name its opponent — the
  // rows themselves are the source: both teams' players are in the ingest.
  const matchTeams = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.match_id || !row.team_name) continue;
    const teams = matchTeams.get(row.match_id) ?? new Set<string>();
    teams.add(row.team_name);
    matchTeams.set(row.match_id, teams);
  }
  const opponentOf = (row: MomentStatRow): string | null => {
    if (!row.match_id || !row.team_name) return null;
    for (const team of matchTeams.get(row.match_id) ?? []) {
      if (team !== row.team_name) return team;
    }
    return null;
  };

  const candidates: MomentCandidate[] = [];
  for (const row of rows) {
    if (!row.match_id || !row.season || !row.summoner_name || !row.tag) continue;
    // Best trigger for this game only — one performance is one moment, so
    // a penta that was also a flawless game does not mint twice.
    let best: MomentTrigger | null = null;
    for (const trigger of MOMENT_TRIGGERS) {
      if (!trigger.qualifies(row)) continue;
      if (!best || trigger.rarity > best.rarity) best = trigger;
    }
    if (!best) continue;
    candidates.push({
      season: row.season,
      matchId: row.match_id,
      slug: slugOf(row.summoner_name, row.tag),
      summonerName: row.summoner_name,
      tag: row.tag,
      teamName: row.team_name,
      champion: row.champion,
      role: row.role,
      triggerKey: best.key,
      title: best.title,
      headline: best.headline(row),
      rarity: best.rarity,
      gameDate: row.game_date,
      opponent: opponentOf(row),
      durationMin: row.game_duration_min,
    });
  }
  return candidates;
}

/**
 * The candidates that actually mint: one per player, then the rarest `limit`
 * of what is left.
 *
 * Ranking before capping is what makes the cap fair — take the first N
 * detected and a pentakill can lose its slot to a vision score purely
 * because of row order.
 */
export function selectMoments(
  candidates: MomentCandidate[],
  rowsBySlug: Map<string, MomentStatRow>,
  limit: number = MOMENTS_PER_WEEK,
): MomentCandidate[] {
  const bestPerPlayer = new Map<string, MomentCandidate>();
  for (const candidate of candidates) {
    const held = bestPerPlayer.get(candidate.slug);
    if (!held || candidate.rarity > held.rarity) {
      bestPerPlayer.set(candidate.slug, candidate);
    }
  }
  return [...bestPerPlayer.values()]
    .sort((a, b) => {
      if (b.rarity !== a.rarity) return b.rarity - a.rarity;
      const rowA = rowsBySlug.get(`${a.matchId}:${a.slug}`);
      const rowB = rowsBySlug.get(`${b.matchId}:${b.slug}`);
      const magA = rowA ? magnitude(rowA) : 0;
      const magB = rowB ? magnitude(rowB) : 0;
      // Slug last so the result is deterministic — two identical games
      // must not mint differently between runs.
      return magB - magA || a.slug.localeCompare(b.slug);
    })
    .slice(0, Math.max(0, limit));
}

/** What card_inventory's flat `tier` column holds for a pulled moment.
 *  Not one of the eight card tiers — a moment has no rating — but that
 *  column is plain text and is what dust pricing reads, so marking it here
 *  keeps every reader honest without a new column. */
export const MOMENT_TIER = "moment";

/** Dust for a pulled moment. Flat, like the autograph bonus and for the
 *  same reason: a moment has no tier to scale off, and every one of them is
 *  equally a one-of-a-kind. Sits below SIGNED_DUST_BASE so the autograph
 *  stays the top of the dust table, and well under PACK_COST × the pull
 *  rate, so moments cannot turn packs into an income. */
export const MOMENT_DUST = 1000;

/**
 * Chance that a pack contains a moment, when one exists for the week being
 * opened.
 *
 * Deliberately checked per PACK, not per card: at 2% roughly one pack in
 * fifty carries one, and a week with two moments minted has them competing
 * for that single slot rather than each rolling separately.
 */
export const MOMENT_PULL_CHANCE = 0.02;

/** The card-shaped wrapper a pulled moment is stored and rendered as.
 *
 *  Rating fields carry placeholders and are never displayed — PlayerCard3D
 *  branches on `moment` before it reads any of them. They exist because
 *  card_inventory's columns are NOT NULL, and inventing a rating for a
 *  moment would be a worse lie than storing an obvious zero. */
export function momentToCard(moment: LeagueMomentLike, season: string, copySerial?: number): PlayerCardData {
  return {
    moment: {
      id: moment.id,
      title: moment.title,
      headline: moment.headline,
      summonerName: moment.summonerName,
      champion: moment.champion,
      teamName: moment.teamName,
      weekStart: moment.weekStart,
      playerSlug: moment.slug,
      triggerKey: moment.triggerKey ?? null,
      opponent: moment.opponent ?? null,
      durationMin: moment.durationMin ?? null,
      // Stamped at pull time — which mint of this moment the copy is.
      // Frozen like everything else in the json; older copies carry none
      // until the backfill writes theirs.
      ...(copySerial ? { copySerial } : {}),
    },
    // A slug of its own: "do I own this player" must not answer yes because
    // you hold their moment, and two moments must not collapse into one
    // shelf entry the way two copies of a player do.
    slug: `moment-${moment.id}`,
    name: moment.summonerName,
    tag: "",
    teamName: moment.teamName,
    teamImageUrl: null,
    role: moment.role ?? "",
    overall: 0,
    tier: { key: "gold", label: "Moment" },
    archetype: moment.title,
    signature: null,
    artSkin: 0,
    motto: null,
    serial: 0,
    collectionSize: 0,
    topChampions: [],
    form: [],
    subStats: [],
    highlights: [],
    badges: [],
    standout: false,
    wins: 0,
    losses: 0,
    winratePct: 0,
    level: 0,
    pentas: 0,
    season,
  };
}

/** The shape momentToCard needs — satisfied by LeagueMoment from queries.ts
 *  without this module having to import it and take the whole query layer
 *  with it. */
export interface LeagueMomentLike {
  id: number;
  title: string;
  headline: string;
  summonerName: string;
  champion: string | null;
  teamName: string | null;
  role?: string | null;
  weekStart: string;
  slug: string;
  triggerKey?: string | null;
  opponent?: string | null;
  durationMin?: number | null;
}
