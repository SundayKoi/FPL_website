// Which edition a week prints.
//
// The Tuesday drop and the manual archiver both have to answer the same
// question — is this an ordinary week, or the week somebody's split ended?
// — and they have to answer it identically, or a week rebuilt by hand comes
// out as a different edition from the one the drop would have minted.
//
// Framework-free, like editions.ts and queries.ts: both callers are scripts
// running under tsx with a service client.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerCardData } from "./build";
import { fetchSeasonFixtures, fetchWeekCards } from "./queries";
import { isPlayoffWeek, planSendoff, type SendoffPlan } from "./sendoff";

export type EditionKind = "weekly" | "sendoff";

export interface WeekEdition {
  kind: EditionKind;
  /** What to archive. Empty means "leave the week alone" — archiveEdition
   *  returns early on it rather than pruning an edition to nothing. */
  cards: PlayerCardData[];
  /** Set on a send-off: what the drop posts, and what names the edition in
   *  the shop. Null on a weekly print. */
  plan: SendoffPlan | null;
}

/**
 * The edition for `week`.
 *
 * A week holding a playoff fixture is a SEND-OFF: every player whose team's
 * split ended that week prints once, rated on the whole split, stamped with
 * how far they got (src/lib/cards/sendoff.ts). Every other week is the
 * ordinary weekly print, rated on that week's games against that week's
 * cohort.
 *
 * `seasonCards` is a thunk because the drop already holds the season build
 * and must not fetch it twice, while the archiver — which does not — should
 * not pay for it on a week that turns out to be an ordinary one.
 *
 * A send-off week whose fixtures are undecided returns no cards. That is
 * deliberate: nothing prints until the scores land, and the next run (or a
 * manual `npx tsx scripts/archive-card-edition.ts <week>`) fills the week in
 * once they have. The alternative — falling back to the weekly print — would
 * archive an edition of the ten people who played the semifinal, rated
 * against each other, which is the exact card the Send-off exists to stop.
 */
export async function buildEditionForWeek(
  supabase: SupabaseClient,
  season: string,
  week: string,
  seasonCards: () => Promise<PlayerCardData[]>,
): Promise<WeekEdition> {
  const fixtures = await fetchSeasonFixtures(supabase, season);
  if (!isPlayoffWeek(fixtures, week)) {
    return { kind: "weekly", cards: await fetchWeekCards(supabase, season, week), plan: null };
  }
  const plan = planSendoff(await seasonCards(), fixtures, week);
  return { kind: "sendoff", cards: plan.cards, plan };
}
