/**
 * Maps `place_bet`'s raw `raise exception` text
 * (supabase/migrations/20260813000003_betting_market_rpcs.sql) to friendly
 * copy — anything unrecognized falls back to a generic message (never
 * surface a raw Postgres error to the user). Shared by actions.ts (the web
 * betting form) and discord/components.ts (the bet-button stake modal) —
 * previously duplicated verbatim between the two; extracted here since
 * actions.ts's `"use server"` directive means its functions can't be
 * imported directly by a non-action module. No `"use server"` here — plain
 * shared code, importable from either side.
 */
export function friendlyPlaceBetError(message: string): string {
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
