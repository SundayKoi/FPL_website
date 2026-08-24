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
  vision_score_per_min: number | null;
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
    key: "damage_monster",
    title: "THE WHOLE TEAM",
    rarity: 50,
    qualifies: (row) => num(row.damage_share_pct) >= 40 && row.win === true,
    headline: (row) => `${Math.round(num(row.damage_share_pct))}% of the team's damage · ${kda(row)}`,
  },
  {
    key: "vision_lock",
    title: "LIGHTS ON",
    rarity: 45,
    qualifies: (row) => num(row.vision_score_per_min) >= 3 && row.win === true,
    headline: (row) => `${num(row.vision_score_per_min).toFixed(1)} vision/min · ${kda(row)}`,
  },
];

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
