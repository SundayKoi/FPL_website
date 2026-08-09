import { expect, test, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * Two captains run one auction to settlement — the realtime auction loop,
 * end to end, against the real running app + local Supabase.
 *
 * Behavioral contract (this is what actually matters; selectors below are
 * just the app's real copy as of Tasks 13-15):
 *   1. Captain 1 nominates a player -> the lot appears on captain 2's board
 *      WITHOUT a page refresh (realtime propagation).
 *   2. Captain 2 outbids -> the new price appears on captain 1's board
 *      WITHOUT a refresh.
 *   3. The countdown expires -> the sale settles on BOTH boards without a
 *      refresh: the player lands on the winning team's roster / pool entry,
 *      and the center stage returns to a "waiting to nominate" state.
 */

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByPlaceholder("email").fill(email);
  await page.getByPlaceholder("password").fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("/");
}

test("two captains run one auction to settlement", async ({ browser }) => {
  execSync("npx tsx e2e/seed.ts", { stdio: "inherit" });
  const draftId = readFileSync("e2e/.draft-id", "utf8").trim();

  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const cap1 = await ctx1.newPage();
  const cap2 = await ctx2.newPage();

  await signIn(cap1, "e2e-cap1@test.local");
  await signIn(cap2, "e2e-cap2@test.local");

  await cap1.goto(`/draft/${draftId}`);
  await cap2.goto(`/draft/${draftId}`);

  // Wait for the realtime subscription to settle and the initial board state
  // to load on both boards before doing anything — avoids nominating into a
  // client that hasn't subscribed yet.
  await expect(cap1.getByText("You are")).toBeVisible();
  await expect(cap2.getByText("You are")).toBeVisible();
  await expect(cap1.getByText(/Waiting for .* to nominate/)).toBeVisible();
  await expect(cap2.getByText(/Waiting for .* to nominate/)).toBeVisible();

  // Captain 1 (E2E Alpha, on the clock) nominates Mid1 explicitly — the
  // picker lists players alphabetically, so "first button" is not stable.
  // Nominating pops a confirm() dialog; accept it.
  cap1.once("dialog", (dialog) => void dialog.accept());
  await cap1.getByRole("button", { name: /^Nominate Mid1/ }).click();

  // cap1's own click already updates its own board locally; the interesting
  // assertion is that the lot appears on captain 2's board too, WITHOUT a
  // page refresh (realtime propagation) — check that first, cap1's copy
  // second, since cap1's is not the one under test.
  await expect(cap2.getByRole("heading", { name: "Mid1" })).toBeVisible();
  await expect(cap1.getByRole("heading", { name: "Mid1" })).toBeVisible();

  // Captain 2 outbids via the quick-bid button (opening bid 10 -> quick-bid 11).
  await cap2.getByRole("button", { name: "Bid 11" }).click();

  // The new price propagates to captain 1's board WITHOUT a refresh. Match
  // the bid feed's exact line copy (BidFeed.tsx: "{team} bid {amount} on
  // {player}") rather than the center-stage price alone, so this can't be
  // confused with the "Bid 11" quick-bid button text on cap1's own board.
  await expect(cap1.getByText("E2E Bravo bid 11 on Mid1")).toBeVisible();

  // Let the countdown run out -> the sale settles on both boards without a
  // refresh: center stage returns to "waiting to nominate" on both...
  await expect(cap1.getByText(/Waiting for .* to nominate/)).toBeVisible({ timeout: 20_000 });
  await expect(cap2.getByText(/Waiting for .* to nominate/)).toBeVisible({ timeout: 20_000 });

  // ...and Mid1 now shows as sold to E2E Bravo in the player pool, visible
  // from both browsers (proves the DB write + realtime fan-out, not just
  // captain 2's own optimistic view). PlayerPool renders sold rows as
  // "{name}{team} · {price}" in one <li> (see src/components/draft/PlayerPool.tsx);
  // that exact shape is unambiguous, unlike a generic "Mid1" + "E2E Bravo"
  // text filter, which also matches the bid-feed row ("E2E Bravo bid 11 on Mid1").
  const soldEntry = (page: Page) => page.getByText(/^Mid1E2E Bravo · \d+$/);
  await expect(soldEntry(cap1)).toBeVisible();
  await expect(soldEntry(cap2)).toBeVisible();

  // It's now team 2's turn to nominate (round-robin advanced).
  await expect(cap2.getByRole("button", { name: /^Nominate/ }).first()).toBeVisible();
});
