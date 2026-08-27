// Client-safe shapes shared by the Gauntlet's actions, queries and UI —
// "use server" modules may only export async functions, so the row type
// and the fee live here.

import type { OpponentTeam } from "./opponents";
import type { GauntletCard, HalfState, MatchResult } from "./sim";

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
  last_result: (MatchResult & { round: number }) | null;
  /** Non-null while a fight is paused at minute 20 waiting on the call. */
  crossroads: GauntletCrossroads | null;
}
