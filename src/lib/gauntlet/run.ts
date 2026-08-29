// Client-safe shapes shared by the Gauntlet's actions, queries and UI —
// "use server" modules may only export async functions, so the row type
// and the fee live here.

import type { Autopsy } from "./autopsy";
import { bossEffects } from "./bosses";
import type { OpponentTeam } from "./opponents";
import { aggregateEffects } from "./relics";
import { aggregateTraits, conditionEffects } from "./traits";
import type { GauntletCard, HalfState, MatchContext, MatchResult } from "./sim";

/** What a run costs to start. A sink by design: prizes stay under the
 *  fees paid league-wide, same guardrail as pack dust. */
export const GAUNTLET_ENTRY_FEE = 50;

/** A fight paused at minute 20: the first half's state and the CSPRNG
 *  seed the second half will resolve with — stored BEFORE resolution,
 *  same discipline as round_seed. */
export interface GauntletCrossroads {
  state: HalfState;
  seed2: number;
}

/** The modifiers a round resolves under, assembled in one place so the
 *  server's fight and the client's odds preview can never disagree: your
 *  relics, their traits, the round's condition, and the wall's rule on a
 *  boss round. */
export function matchContextFor(
  relicKeys: string[],
  opponent: OpponentTeam | null,
  /** Picks between the situations sharing a momentum band. Pass the
   *  week+round seed — the same one the opponent cast is drawn from — so
   *  a week's round-four call is the same call for everyone in it. */
  situationSeed?: number,
): MatchContext {
  return {
    effects: aggregateEffects(relicKeys),
    foe: aggregateTraits(opponent?.traits ?? []),
    arena: conditionEffects(opponent?.condition),
    boss: bossEffects(opponent?.boss),
    situationSeed,
  };
}

/** A resolved round as the run row stores it — the whole tape plus the
 *  post-match read, so a refresh redraws the same game and the same
 *  explanation. */
export type StoredMatchResult = MatchResult & { round: number; autopsy?: Autopsy };

export interface GauntletRunRow {
  id: number;
  discord_id: string;
  season: string;
  week_start: string;
  lineup: GauntletCard[];
  lineup_avg: number;
  round: number;
  score: number;
  relics: string[];
  relic_offer: string[] | null;
  bench_swap_used: boolean;
  status: "active" | "fallen" | "banked" | "cleared";
  round_seed: number | null;
  next_opponent: OpponentTeam | null;
  last_result: StoredMatchResult | null;
  /** Non-null while a fight is paused at minute 20 waiting on the call. */
  crossroads: GauntletCrossroads | null;
}
