// Client-safe shapes shared by the Gauntlet's actions, queries and UI —
// "use server" modules may only export async functions, so the row type
// and the fee live here.

import type { Autopsy } from "./autopsy";
import { bossEffects } from "./bosses";
import { ascensionRules } from "./ascension";
import { openerEffects } from "./openers";
import type { OpponentTeam } from "./opponents";
import { aggregateEffects, mergeRelicEffects } from "./relics";
import { heirloomEffects, type StoredHeirloom } from "./heirlooms";
import { aggregateTraits, conditionEffects, mergeTraitEffects } from "./traits";
import { ghostTraitEffects } from "./ghosts";
import { mutationEffects, type GauntletCard, type HalfState, type MatchContext, type MatchResult } from "./sim";

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
  /** The shelf relic brought along, and the five it is read against — a
   *  plate is worth nothing without the roster it belongs to. */
  heirloom?: StoredHeirloom | null,
  lineup: GauntletCard[] = [],
  /** The run's ascension: how much of a ghost's build defends, and
   *  whether the pit is theirs every round. */
  ascension = 0,
  /** The opener the run brought (src/lib/gauntlet/openers.ts). */
  opener: string | null = null,
): MatchContext {
  const rules = ascensionRules(ascension);
  // A ghost's "traits" are their BUILD: the relics they were holding when
  // they stood here. Flats add on top of any authored traits, so a future
  // ghost that also wears one is not a special case.
  const traits = aggregateTraits(opponent?.traits ?? []);
  const foe = opponent?.ghost
    ? mergeTraitEffects(traits, ghostTraitEffects(opponent.ghost.relics, rules.ghostPotency))
    : traits;
  return {
    effects: mergeRelicEffects(
      mergeRelicEffects(
        mergeRelicEffects(aggregateEffects(relicKeys), heirloomEffects(heirloom, lineup)),
        mutationEffects(lineup),
      ),
      openerEffects(opener),
    ),
    foe,
    arena: conditionEffects(opponent?.condition),
    boss: { ...bossEffects(opponent?.boss), ...(rules.holdsPit ? { holdsPit: true } : {}) },
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
  /** The shelf relic brought into the run, frozen at entry. Null on a run
   *  started before heirlooms shipped, and on one that brought nothing. */
  heirloom: StoredHeirloom | null;
  /** The seed this run's own eight opponents are drawn with. Null on runs
   *  started before the private draw shipped — those keep the week's. */
  ghost_seed: number | null;
  /** The purse so far: real dollars, banked between fights or lost with
   *  the run (src/lib/gauntlet/purse.ts). Undefined on a row read before
   *  the purse migration; treat as 0. */
  purse?: number;
  /** What the purse actually paid — set once by gauntlet_cash_out. */
  purse_paid?: number;
  /** The ascension the run was fought at (src/lib/gauntlet/ascension.ts).
   *  Undefined on a row read before the ladder; treat as 0. */
  ascension?: number;
  /** The opener brought along (src/lib/gauntlet/openers.ts), or null. */
  opener?: string | null;
}
