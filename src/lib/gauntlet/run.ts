// Client-safe shapes shared by the Gauntlet's actions, queries and UI —
// "use server" modules may only export async functions, so the row type
// and the fee live here.

import type { Autopsy } from "./autopsy";
import { bossEffects } from "./bosses";
import type { OpponentTeam } from "./opponents";
import { aggregateEffects } from "./relics";
import { aggregateTraits, conditionEffects, mergeTraitEffects } from "./traits";
import { ghostTraitEffects } from "./ghosts";
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
 *  relics, their traits, the round's condition, the wall's rule on a boss
 *  round, and the opponent's game plan. */
export function matchContextFor(
  relicKeys: string[],
  opponent: OpponentTeam | null,
  /** Picks between the situations sharing a momentum band. Pass the
   *  week+round seed — the same one the opponent cast is drawn from — so
   *  a week's round-four call is the same call for everyone in it. */
  situationSeed?: number,
): MatchContext {
  // A ghost's "traits" are their BUILD: the relics they were holding when
  // they stood here. Flats add on top of any authored traits, so a future
  // ghost that also wears one is not a special case.
  const traits = aggregateTraits(opponent?.traits ?? []);
  const foe = opponent?.ghost
    ? mergeTraitEffects(traits, ghostTraitEffects(opponent.ghost.relics))
    : traits;
  return {
    effects: aggregateEffects(relicKeys),
    foe,
    arena: conditionEffects(opponent?.condition),
    boss: bossEffects(opponent?.boss),
    situationSeed,
    plan: opponent?.plan,
    foeCall: opponent?.ghost?.choiceKey ?? undefined,
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
  /** The seed this run's own eight opponents are drawn with. Null on runs
   *  started before the private draw shipped — those keep the week's. */
  ghost_seed: number | null;
}
