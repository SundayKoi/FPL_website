// What /daily pays — the floor every other income in the game is measured
// against.
//
// Its own module because two very different places need the number and
// neither should restate it: the Discord handler that pays it, and the
// expedition payout tables, whose whole guardrail is "never out-earn a
// click of /daily". src/lib/betting/discord/commands.ts pulls in
// `server-only`, so a pure constant living there is a constant nothing
// else can check.
//
// Ports bot/config.py's BotSettings defaults (DAILY_AMOUNT /
// DAILY_STREAK_STEP / DAILY_STREAK_MAX env vars in the source bot).

export const DAILY_AMOUNT = 250;
export const DAILY_STREAK_STEP = 50;
export const DAILY_STREAK_MAX = 7;

/** What the seventh day of a streak pays — the most anyone can get for a
 *  click, no cards and no wait, and the ceiling the expedition board is
 *  balanced under. */
export const MAXED_DAILY_STREAK = DAILY_AMOUNT + DAILY_STREAK_STEP * (DAILY_STREAK_MAX - 1);

/** What a wallet opens with — credited once per Discord id, by
 *  `grant_signup_bonus`, the first time the web login or a slash command
 *  touches it. The same number on both paths, from this one place. */
export const SIGNUP_BONUS_AMOUNT = 1000;

/** What /weekly pays on a fresh streak — see claim_weekly_streak. */
export const WEEKLY_AMOUNT = 1000;

/** What one daily game pays — FPL'dle, Higher or Lower, The Daily Stu —
 *  and it is ONE reward across all of them: the first game finished in a
 *  day claims it. Mirrors the literal in the daily-game RPCs
 *  (supabase/migrations/20260831175655_daily_game_shared_reward.sql). */
export const DAILY_GAME_REWARD = 200;

/** The patron flame's cut on recurring rewards: /daily, /weekly, the daily
 *  games and scheduled match wins pay half again their base. Mirrors
 *  calculate_recurring_reward (p_base * 3 / 2). */
export const PATRON_RECURRING_MULT = 1.5;

/** A recurring reward with the flame lit. */
export function patronRecurring(base: number): number {
  return Math.floor(base * PATRON_RECURRING_MULT);
}

/** The one sentence about the daily reward. Four surfaces described it
 *  four ways, and The Daily Stu's read as a fifth, separate pot. */
export const DAILY_REWARD_SENTENCE =
  `One shared reward a day: the first daily game you finish — FPL'dle, Higher or Lower or The Daily Stu — ` +
  `pays $${DAILY_GAME_REWARD} betting dollars, or $${patronRecurring(DAILY_GAME_REWARD)} while your patron flame is active. ` +
  `Resets at midnight Eastern.`;
