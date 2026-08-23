// Who gets paid for a fantasy week, and how much.
//
// Split out from the scoring job on purpose: deciding the podium is pure
// arithmetic over (discordId, score) pairs, while paying it out is a
// two-step claim-then-pay dance against `fantasy_payout`
// (20260826000015_card_packs_fantasy.sql). Keeping the decision here means
// the money rules are testable without a database, and the job is left with
// nothing but the ledger contract to get right.

import { WEEKLY_PAYOUTS } from "./config";

/** One week's entry, reduced to the only two things a payout depends on. */
export interface PayoutEntry {
  discordId: string;
  score: number;
}

export interface PlannedPayout {
  discordId: string;
  /** 1-based finishing position among the *paid* entries. */
  rank: number;
  amount: number;
}

/**
 * The week's payouts, best score first.
 *
 * Rules, all deliberately blunt:
 *
 *   - Only a score strictly above zero is eligible. A lineup of five players
 *     who all sat out earns nothing rather than sneaking onto an empty
 *     podium; a week nobody played pays nobody.
 *   - Fewer eligible entries than payout tiers just means the lower tiers go
 *     unpaid — the pot is not redistributed.
 *   - **Ties are broken by input order, and the tied pair does not split the
 *     money**: whoever the caller listed first takes the higher tier and its
 *     full amount. The scoring job hands entries in submission order, so in
 *     practice the earlier submission wins a tie. Exact ties on a
 *     one-decimal power score are vanishingly rare, and "share 1st and 2nd"
 *     would put a fractional amount into a `bigint` column.
 *   - Non-positive tiers are dropped, since `fantasy_payout` rejects an
 *     amount <= 0; ranks still count from the top of the podium.
 *
 * Self-sufficient: `entries` need not be pre-sorted. The sort is stable on
 * ties by construction (it compares the original index), so the result never
 * depends on the engine's sort stability.
 */
export function planPayouts(
  entries: PayoutEntry[],
  payouts: number[] = WEEKLY_PAYOUTS,
): PlannedPayout[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.score > 0)
    .sort((a, b) => b.entry.score - a.entry.score || a.index - b.index)
    .slice(0, payouts.length)
    .map(({ entry }, position) => ({
      discordId: entry.discordId,
      rank: position + 1,
      amount: payouts[position],
    }))
    .filter((plan) => plan.amount > 0);
}
