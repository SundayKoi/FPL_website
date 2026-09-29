import { expect, type Page } from "@playwright/test";
import { seedFixture, signIn, test } from "./fixtures";
import {
  BETTING_LOSER_DISCORD_ID,
  BETTING_MEMBER_DISCORD_ID,
  BETTING_MEMBER_EMAIL,
  BETTING_ADMIN_EMAIL,
  BETTING_PASSWORD,
} from "../scripts/betting-fixture";
import { localServiceClient } from "./test-clients";

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
 * Self-seeding, same contract as draft.spec.ts/e2e/seed.ts: shells out to
 * `npx tsx e2e/seed-betting.ts` below, so `npm run e2e`/`npx playwright test`
 * works from a clean checkout without `npm run seed:demo` run by hand first.
 *
 * Fixture (scripts/betting-fixture.ts): "Betting FC" (BFC) vs "Wager United"
 * (WUN), one OPEN market, rake_bps 0, lock_at ~1h55m out, and a third seeded
 * user already holding a 500 stake on Wager United. That pre-existing
 * losing stake is what makes the member's own bet pay out something other
 * than a flat refund (see _resolve_market in
 * 20260813000003_betting_market_rpcs.sql: an empty losing pool just refunds
 * everyone) — with rake 0, resolving for Betting FC pays the member
 * 100 (stake back) + 100 * 500 / 100 (100% of the solo-loser pool,
 * pro-rata over a solo winner) = 600, i.e. +500 profit.
 */

const MEMBER_EMAIL = BETTING_MEMBER_EMAIL;
const ADMIN_EMAIL = BETTING_ADMIN_EMAIL;
const PASSWORD = BETTING_PASSWORD;

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("/");
}

test("member bets, admin resolves, member's profile shows the payout", async ({ page }) => {
  const marketId = Number(seedFixture("betting").marketId);
  const service = localServiceClient();

  // === Member: sign in, open the market, stake 100 on Betting FC ===========
  await signIn(page, MEMBER_EMAIL, PASSWORD, "/betting");

  // Signup-bonus balance from the seed, formatted by fmtPoints ("$1,000").
  await expect(page.getByRole("banner").getByRole("link", { name: "Premium wallet balance $1,000" })).toBeVisible();

  await page.goto(`/betting/market/${marketId}`);
  await expect(page.getByRole("heading", { name: /Betting FC.*Wager United/ })).toBeVisible();

  // Team A (Betting FC) is BetPanel's default side already, but select it
  // explicitly so the bet doesn't depend on that default staying true.
  await page.getByRole("button", { name: "BFC", exact: true }).click();
  await page.locator("#bet-amount").fill("100");
  await page.getByRole("button", { name: "BUY", exact: true }).click();

  // Balance chip drops by the 100 stake ($1,000 -> $900) — proves the bet
  // actually posted (place_bet's balance write), not just an optimistic UI.
  await expect(page.getByRole("banner").getByRole("link", { name: "Premium wallet balance $900" })).toBeVisible();

  await signOut(page);

  // === Admin: sign in, resolve the market for the team the member backed ===
  await signIn(page, ADMIN_EMAIL, PASSWORD, "/admin/betting");

  const marketRow = page.getByTestId(`betting-market-${marketId}`);
  await expect(marketRow).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  const resolutionActionPromise = page.waitForRequest((request) =>
    request.method() === "POST" && Boolean(request.headers()["next-action"]),
  );
  await marketRow.getByRole("combobox").selectOption({ label: "BFC wins" });
  await marketRow.getByRole("button", { name: "Resolve", exact: true }).click();
  const resolutionAction = await resolutionActionPromise;

  await expect(marketRow.getByText("RESOLVED")).toBeVisible();
  await expect(marketRow.getByText("Winner: BFC")).toBeVisible();

  // Replay the captured Next server-action request while the authorized owner
  // session is still active. This repeats the ordinary application boundary,
  // including its caller check, instead of invoking the service-only RPC.
  const actionHeaders = await resolutionAction.allHeaders();
  const replayHeaders = Object.fromEntries(
    ["accept", "content-type", "next-action", "next-router-state-tree", "next-url", "origin", "referer", "rsc"]
      .filter((name) => actionHeaders[name] !== undefined)
      .map((name) => [name, actionHeaders[name]]),
  );
  const repeatedResolution = await page.context().request.fetch(resolutionAction.url(), {
    method: "POST",
    headers: replayHeaders,
    data: resolutionAction.postDataBuffer() ?? undefined,
  });
  expect(repeatedResolution.status()).toBe(200);
  await expect(marketRow.getByText("RESOLVED")).toBeVisible();
  await expect(marketRow.getByText("Winner: BFC")).toBeVisible();

  await signOut(page);

  // === Member again: profile shows the settled bet's payout/profit ========
  await signIn(page, MEMBER_EMAIL, PASSWORD, "/betting/profile");

  // The profile page's stat boxes expose each label as a group name. Scope
  // each assertion to its own group, since the raw value text alone can
  // collide: "$1,500" also sits in the nav's balance chip, and "$500" (Net
  // profit) equals biggest_win's own "$500" (only one graded, winning bet).
  function statValue(label: string) {
    return page.getByRole("group", { name: label });
  }

  // Balance: $1,000 - 100 (stake) + 600 (payout) = $1,500.
  await expect(statValue("Balance")).toContainText("$1,500");
  // Record: one graded bet, and it won (payout 600 > stake 100).
  await expect(statValue("Record")).toContainText("1W / 0L");
  // Net profit, from the ledger (bet_place -100, bet_payout +600): $500.
  await expect(statValue("Net profit")).toContainText("$500");
  // Recent Settled row: "+$500" (unambiguous — nothing else on the page
  // renders a leading "+").
  await expect(page.getByText("+$500", { exact: true })).toBeVisible();

  // Verify the authoritative rows after the page has reloaded with a fresh
  // authenticated session. A matching profile summary alone could hide a
  // duplicate payout or a market resolved for the wrong side.
  const { data: market } = await service.from("betting_markets")
    .select("status,winning_team_id,team_a_id,team_b_id").eq("id", marketId).single();
  expect(market).toMatchObject({ status: "RESOLVED", winning_team_id: market?.team_a_id });
  const { data: bets } = await service.from("betting_bets")
    .select("id,discord_id,team_id,amount,payout,settled").eq("market_id", marketId).order("id");
  expect(bets).toHaveLength(2);
  const memberBet = bets?.find((bet) => bet.discord_id === BETTING_MEMBER_DISCORD_ID);
  const losingBet = bets?.find((bet) => bet.discord_id === BETTING_LOSER_DISCORD_ID);
  expect(memberBet).toMatchObject({ amount: 100, payout: 600, settled: true, team_id: market?.team_a_id });
  expect(losingBet).toMatchObject({ amount: 500, payout: 0, settled: true, team_id: market?.team_b_id });

  const { data: memberLedger } = await service.from("betting_ledger")
    .select("delta,reason,ref_table,ref_id").eq("discord_id", BETTING_MEMBER_DISCORD_ID)
    .eq("ref_table", "betting_bets").eq("ref_id", memberBet!.id).order("delta");
  expect(memberLedger).toEqual([
    { delta: -100, reason: "bet_place", ref_table: "betting_bets", ref_id: memberBet!.id },
    { delta: 600, reason: "bet_payout", ref_table: "betting_bets", ref_id: memberBet!.id },
  ]);
  const { data: wallets } = await service.from("betting_profiles").select("discord_id,balance")
    .in("discord_id", [BETTING_MEMBER_DISCORD_ID, BETTING_LOSER_DISCORD_ID]);
  expect(wallets?.find((wallet) => wallet.discord_id === BETTING_MEMBER_DISCORD_ID)?.balance).toBe(1_500);
  expect(wallets?.find((wallet) => wallet.discord_id === BETTING_LOSER_DISCORD_ID)?.balance).toBe(500);
});
