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
