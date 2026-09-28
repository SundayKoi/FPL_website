import { expect, type Page } from "@playwright/test";
import { seedFixture, signIn, test } from "./fixtures";

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

test("two captains run one auction to settlement", async ({ captains: [cap1, cap2] }) => {
  test.setTimeout(120_000);
  const { fixtureId: draftId } = seedFixture("draft");
  expect(draftId).toBeTruthy();

  await signIn(cap1, "e2e-cap1@test.local", "password123");
  await signIn(cap2, "e2e-cap2@test.local", "password123");

  await cap1.goto(`/draft/${draftId}`);
  await cap2.goto(`/draft/${draftId}`);

  // Wait for the realtime subscription to settle and the initial board state
  // to load on both boards before doing anything — avoids nominating into a
  // client that hasn't subscribed yet.
  await expect(cap1.getByText("Team E2E Alpha", { exact: true })).toBeVisible();
  await expect(cap2.getByText("Team E2E Bravo", { exact: true })).toBeVisible();
  await expect(cap1.getByText(/Waiting for .* to nominate/)).toBeVisible();
  await expect(cap2.getByText(/Waiting for .* to nominate/)).toBeVisible();
  await cap1.getByRole("dialog", { name: "Your nomination" }).getByRole("button", { name: "Pick my player" }).click();

  // Captain 1 (E2E Alpha, on the clock) nominates Mid1 explicitly — the
  // picker lists players alphabetically, so "first button" is not stable.
  // Nominating opens the branded confirm modal; confirm it.
  await cap1.getByRole("button", { name: /^Nominate Mid1/ }).click();
  await cap1.getByRole("dialog").getByRole("button", { name: "Nominate", exact: true }).click();

  // cap1's own click already updates its own board locally; the interesting
  // assertion is that the lot appears on captain 2's board too, WITHOUT a
  // page refresh (realtime propagation) — check that first, cap1's copy
  // second, since cap1's is not the one under test.
  await expect(cap2.getByRole("heading", { name: "Mid1" })).toBeVisible();
  await expect(cap1.getByRole("heading", { name: "Mid1" })).toBeVisible();

  // Captain 1 disconnects while captain 2 bids. Reconnecting must fetch the
  // missed authoritative state, even if the realtime event was dropped.
  await cap1.context().setOffline(true);
  await expect.poll(() => cap1.evaluate(() => navigator.onLine)).toBe(false);
  await cap2.getByRole("button", { name: "Bid 11" }).click();
  await expect(cap2.getByText("E2E Bravo bid 11 on Mid1")).toBeVisible();
  await cap1.context().setOffline(false);
  await expect.poll(() => cap1.evaluate(() => navigator.onLine)).toBe(true);

  // The new price catches up after reconnect without a page refresh.
  await expect(cap1.getByText("E2E Bravo bid 11 on Mid1")).toBeVisible();

  // Let the countdown run out -> the sale settles on both boards without a
  // refresh: center stage returns to "waiting to nominate" on both...
  // The winning bid starts a fresh 30-second clock; allow the sale to settle
  // after that authoritative server deadline plus its 2-second close poll.
  await expect(cap1.getByText(/Waiting for .* to nominate/)).toBeVisible({ timeout: 45_000 });
  await expect(cap2.getByText(/Waiting for .* to nominate/)).toBeVisible({ timeout: 45_000 });

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
