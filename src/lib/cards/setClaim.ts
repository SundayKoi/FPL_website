import "server-only";

// Claiming a roster set. Takes a Discord id on trust, so it lives behind
// "server-only" and is composed in ./setActions.ts AFTER the session says
// who is calling — the same split expeditions keep between runs.ts and
// actions.ts, for the same reason: an exported "use server" function is an
// endpoint anybody can post to.
//
// The set is recomputed here from the frozen edition and the caller's own
// shelf. NOTHING about which copies are spent comes from the client: a
// browser that could name the five would be a browser that could name five
// cards it doesn't own.

import { createBettingServiceClient } from "@/lib/betting/service-client";
import { GOLD, postCardsWebhook } from "@/lib/packs/announce";
import { buildWeekSets, TEAM_SET_BONUS } from "./sets";
import { fetchSetClaimState, fetchSetEditionCards, fetchWeekCopyIds, setKey } from "./setQueries";

export type ClaimSetResult =
  | { ok: true; teamName: string; weekStart: string; amount: number; balance: number }
  | { ok: false; error: string };

/** Never a raw Postgres error — same contract as friendlyExpeditionError. */
function friendly(message: string): string {
  if (/card_set_claims_once|duplicate key value.*card_set_claims/i.test(message)) {
    return "You've already been paid for that set.";
  }
  if (/card_set_claim_copies|duplicate key value/i.test(message)) {
    return "One of those cards has already completed this set for somebody else.";
  }
  if (/cards not owned for that week/i.test(message)) return "Those cards aren't yours, or aren't from that week.";
  if (/a set is five distinct cards/i.test(message)) return "A set is five different cards.";
  if (/unknown user/i.test(message)) return "Account not found — try signing in again.";
  return "That claim didn't go through. Try again in a moment.";
}

export async function claimTeamSetFor(
  discordId: string,
  season: string,
  weekStart: string,
  teamName: string,
): Promise<ClaimSetResult> {
  const service = createBettingServiceClient();
  // Both reads are scoped to the ONE week being claimed. This used to pull
  // the whole collection and the whole edition — every copy of every week
  // with its frozen card json — to end up naming five ids, which put the
  // slowest query in the feature between the click and the money.
  const [copies, editionCards] = await Promise.all([
    fetchWeekCopyIds(service, discordId, season, weekStart),
    fetchSetEditionCards(service, season, [weekStart]),
  ]);
  if (editionCards.length === 0) return { ok: false, error: "That week hasn't been archived yet." };

  const state = await fetchSetClaimState(service, discordId, season, copies.map((copy) => copy.id));
  if (state.claimed.has(setKey(weekStart, teamName))) {
    return { ok: false, error: "You've already been paid for that set." };
  }

  const set = buildWeekSets(editionCards, copies, weekStart, state.spent).find(
    (candidate) => candidate.teamName === teamName,
  );
  if (!set) return { ok: false, error: "No set for that team in that week." };
  if (!set.complete) {
    const missing = set.members.filter((member) => member.copyId === null).length;
    return { ok: false, error: `You're still ${missing} card${missing === 1 ? "" : "s"} short of that set.` };
  }

  const { data, error } = await service.rpc("claim_team_set", {
    p_user: discordId,
    p_season: season,
    p_week: weekStart,
    p_team: teamName,
    p_copies: set.copyIds,
    p_amount: TEAM_SET_BONUS,
  });
  if (error) return { ok: false, error: friendly(error.message) };
  const row = (data as { claim_id: number; balance: number }[] | null)?.[0];

  // Best effort, after the money: a webhook outage must not swallow a paid
  // claim. Same ordering claim_expedition's announce keeps.
  try {
    await postCardsWebhook({
      title: "🏅 Roster set completed",
      description:
        `Someone put together all five ${teamName} cards from the week of ${weekStart} — ` +
        `+$${TEAM_SET_BONUS}.`,
      color: GOLD,
    });
  } catch {
    // ignored on purpose
  }

  return {
    ok: true,
    teamName,
    weekStart,
    amount: TEAM_SET_BONUS,
    balance: Number(row?.balance ?? 0),
  };
}
