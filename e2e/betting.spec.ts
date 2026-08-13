import { expect, test, type Page } from "@playwright/test";

/**
 * Markets betting, end to end against the real running app + local
 * Supabase: a member signs in, opens the seeded market, stakes 100 on the
 * team an already-seeded loser bet 500 against — then a seeded admin
 * resolves the market for that team, and the member's payout/profit show up
 * on their profile.
 *
 * (No cashoutPickem coverage here — pick'em cash-out was dropped from this
 * repo entirely; this spec covers the markets flow the brief describes.)
 *
 * Fixture (scripts/seed-demo.ts's betting section): "Betting FC" (BFC) vs
 * "Wager United" (WUN", one OPEN market, rake_bps 0, lock_at ~1h55m out, and
 * a third seeded user already holding a 500 stake on Wager United. That
 * pre-existing losing stake is what makes the member's own bet pay out
 * something other than a flat refund (see _resolve_market in
 * 20260813000003_betting_market_rpcs.sql: an empty losing pool just refunds
 * everyone) — with rake 0, resolving for Betting FC pays the member
 * 100 (stake back) + 100 * 500 / 100 (100% of the solo-loser pool,
 * pro-rata over a solo winner) = 600, i.e. +500 profit.
 */

const MEMBER_EMAIL = "e2e-betting-member@test.local";
const ADMIN_EMAIL = "e2e-betting-admin@test.local";
const PASSWORD = "password123";
const MARKET_TITLE = "Betting FC vs Wager United";

async function signIn(page: Page, email: string, redirect: string) {
  await page.goto(`/login?redirect=${encodeURIComponent(redirect)}`);
  await page.getByPlaceholder("email").fill(email);
  await page.getByPlaceholder("password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(redirect);
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("/");
}

test("member bets, admin resolves, member's profile shows the payout", async ({ page }) => {
  // === Member: sign in, open the market, stake 100 on Betting FC ===========
  await signIn(page, MEMBER_EMAIL, "/betting");

  // Signup-bonus balance from the seed, formatted by fmtPoints ("$1,000").
  await expect(page.getByText("$1,000", { exact: true })).toBeVisible();

  await page.getByRole("link").filter({ hasText: "Betting FC" }).click();
  await page.waitForURL(/\/betting\/market\/\d+/);
  await expect(page.getByRole("heading", { name: /Betting FC.*Wager United/ })).toBeVisible();

  // Team A (Betting FC) is BetPanel's default side already, but select it
  // explicitly so the bet doesn't depend on that default staying true.
  await page.getByRole("button", { name: "BFC", exact: true }).click();
  await page.locator("#bet-amount").fill("100");
  await page.getByRole("button", { name: "BUY", exact: true }).click();

  // Balance chip drops by the 100 stake ($1,000 -> $900) — proves the bet
  // actually posted (place_bet's balance write), not just an optimistic UI.
  await expect(page.getByText("$900", { exact: true })).toBeVisible();

  await signOut(page);

  // === Admin: sign in, resolve the market for the team the member backed ===
  await signIn(page, ADMIN_EMAIL, "/admin/betting");

  const marketRow = page.locator("li", { hasText: MARKET_TITLE });
  await expect(marketRow).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await marketRow.getByRole("combobox").selectOption({ label: "BFC wins" });
  await marketRow.getByRole("button", { name: "Resolve", exact: true }).click();

  await expect(marketRow.getByText("RESOLVED")).toBeVisible();
  await expect(marketRow.getByText("Winner: BFC")).toBeVisible();

  await signOut(page);

  // === Member again: profile shows the settled bet's payout/profit ========
  await signIn(page, MEMBER_EMAIL, "/betting/profile");

  // The profile page's stat boxes (ProfilePage's <StatBox>) render as a
  // label div immediately followed by a value div — scope each assertion to
  // its own box via that structure, since the raw value text alone can
  // collide: "$1,500" also sits in the nav's balance chip, and "$500" (Net
  // profit) equals biggest_win's own "$500" (only one graded, winning bet).
  function statValue(label: string) {
    return page.getByText(label, { exact: true }).locator("xpath=following-sibling::div[1]");
  }

  // Balance: $1,000 - 100 (stake) + 600 (payout) = $1,500.
  await expect(statValue("Balance")).toHaveText("$1,500");
  // Record: one graded bet, and it won (payout 600 > stake 100).
  await expect(statValue("Record")).toHaveText("1W / 0L");
  // Net profit, from the ledger (bet_place -100, bet_payout +600): $500.
  await expect(statValue("Net profit")).toHaveText("$500");
  // Recent Settled row: "+$500" (unambiguous — nothing else on the page
  // renders a leading "+").
  await expect(page.getByText("+$500", { exact: true })).toBeVisible();
});
