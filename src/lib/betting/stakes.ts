import { fmtPoints } from "./format";

/**
 * The floor under every stake in the betting game — a market bet
 * (`place_bet`) and a pick'em card (`place_pickem_card`) alike, on the web
 * and in Discord alike.
 *
 * Its own module for the same reason daily.ts is one: the number belongs to
 * the bet panels (client components), the server actions, and the Discord
 * modal handler, and none of those can import from the others.
 *
 * The database is the authority — both RPCs raise `minimum stake is 250`
 * whatever reaches them, so a caller that skips these checks still can't get
 * a smaller stake in. What lives here is the copy that stops a doomed
 * request before it travels, and the copy that tells the bettor why.
 * Mirrors the literal in
 * supabase/migrations/20261016000001_betting_minimum_stake.sql — change the
 * two together.
 */
export const MIN_STAKE = 250;

/** The one sentence every surface uses when a stake is under the floor. */
export const MIN_STAKE_ERROR = `Minimum stake is ${fmtPoints(MIN_STAKE)}.`;
