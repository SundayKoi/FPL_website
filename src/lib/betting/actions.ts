"use server";

import { revalidatePath } from "next/cache";
import { getBettingUser } from "./wallet";
import { createBettingServiceClient } from "./service-client";

type ActionResult = { ok: true; balance: number } | { ok: false; error: string };

/**
 * `place_bet` (supabase/migrations/20260813000003_betting_market_rpcs.sql)
 * raises plain-text exceptions — map the ones a bettor can actually trigger
 * to friendly copy; anything unrecognized falls back to a generic message
 * (never surface a raw Postgres error to the UI).
 */
function friendlyPlaceBetError(message: string): string {
  if (/insufficient balance/i.test(message)) return "Insufficient balance.";
  if (/amount must be positive/i.test(message)) return "Enter a valid bet amount.";
  if (/no draw option/i.test(message)) return "This market has no draw option.";
  if (/not in market/i.test(message)) return "Invalid team selection.";
  if (/not open/i.test(message)) return "This market isn't open for betting.";
  if (/locked/i.test(message)) return "This market has locked — betting is closed.";
  if (/unknown market/i.test(message)) return "Market not found.";
  if (/unknown user/i.test(message)) return "Account not found — try signing in again.";
  return "Something went wrong placing that bet.";
}

/** Same idea for `cashout_bet`'s exception messages. */
function friendlyCashoutError(message: string): string {
  if (/unknown or settled bet/i.test(message)) return "That bet no longer exists or has already settled.";
  if (/not your bet/i.test(message)) return "That isn't your bet.";
  if (/locked/i.test(message)) return "Betting has locked — cashout is no longer available.";
  if (/unknown user/i.test(message)) return "Account not found — try signing in again.";
  return "Something went wrong cashing out.";
}

/**
 * Same idea for `place_pickem_card`'s exception messages
 * (supabase/migrations/20260813000004_betting_pickem_store_seasons.sql).
 * Controller ruling: `cashoutPickem` was dropped from this task entirely —
 * no such RPC exists in the source (pick'em cards have no player cashout).
 */
function friendlyPlacePickemCardError(message: string): string {
  if (/insufficient balance/i.test(message)) return "Insufficient balance.";
  if (/amount must be positive/i.test(message)) return "Enter a valid card amount.";
  if (/every series/i.test(message)) return "Pick a team for every series.";
  if (/pick-em is locked/i.test(message)) return "This pick'em has locked — entries are closed.";
  if (/unknown pick-em/i.test(message)) return "Pick'em not found.";
  if (/unknown user/i.test(message)) return "Account not found — try signing in again.";
  return "Something went wrong placing that card.";
}

/**
 * Places a bet on behalf of the signed-in caller. The Discord id is
 * re-derived from the session server-side (never trusted from the client) —
 * only marketId/teamId/amount travel over the wire. teamId -1 is the RPC's
 * "the Draw" sentinel (only valid when the market has draw_enabled).
 */
export async function placeBet(marketId: number, teamId: number, amount: number): Promise<ActionResult> {
  if (!Number.isInteger(marketId) || !Number.isInteger(teamId)) {
    return { ok: false, error: "Invalid bet." };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter a valid bet amount." };
  }

  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in to place a bet." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };

  const service = createBettingServiceClient();
  const { data, error } = await service.rpc("place_bet", {
    p_user: user.discordId,
    p_market: marketId,
    p_team: teamId,
    p_amount: Math.trunc(amount),
  });
  if (error) return { ok: false, error: friendlyPlaceBetError(error.message) };

  revalidatePath("/betting");
  return { ok: true, balance: data as number };
}

/**
 * Withdraws the caller's own bet before the market locks, minus the 5% fee
 * baked into `cashout_bet`. Only the bet id travels from the client — the
 * RPC re-checks ownership (`not your bet`) server-side regardless.
 */
export async function cashoutBet(betId: number): Promise<ActionResult> {
  if (!Number.isInteger(betId)) {
    return { ok: false, error: "Invalid bet." };
  }

  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in to cash out." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };

  const service = createBettingServiceClient();
  const { data, error } = await service.rpc("cashout_bet", { p_user: user.discordId, p_bet: betId });
  if (error) return { ok: false, error: friendlyCashoutError(error.message) };

  revalidatePath("/betting");
  return { ok: true, balance: data as number };
}

/**
 * Places (or replaces) the caller's card on a pick'em. `picks` maps each
 * leg's market_id to the chosen team_id — the RPC's jsonb key is the
 * market_id's *text* representation, so it's stringified here rather than
 * trusting the client to shape it correctly. The Discord id is re-derived
 * from the session server-side, same as placeBet.
 */
export async function placePickemCard(pickemId: number, picks: Record<number, number>, amount: number): Promise<ActionResult> {
  if (!Number.isInteger(pickemId)) {
    return { ok: false, error: "Invalid pick'em." };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter a valid card amount." };
  }
  const entries = Object.entries(picks);
  if (entries.length === 0 || entries.some(([, teamId]) => !Number.isInteger(teamId))) {
    return { ok: false, error: "Pick a team for every series." };
  }

  const user = await getBettingUser();
  if (!user) return { ok: false, error: "Sign in to play the pick'em." };
  if (!user.allowed) return { ok: false, error: "FPL Better members only." };

  const service = createBettingServiceClient();
  const { data, error } = await service.rpc("place_pickem_card", {
    p_user: user.discordId,
    p_pickem: pickemId,
    p_picks: Object.fromEntries(entries),
    p_amount: Math.trunc(amount),
  });
  if (error) return { ok: false, error: friendlyPlacePickemCardError(error.message) };

  revalidatePath("/betting");
  return { ok: true, balance: data as number };
}
