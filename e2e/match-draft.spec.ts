import { expect, test } from "@playwright/test";
import { seedFixture, signIn } from "./fixtures";
import {
  CONTRACT_PASSWORD,
  MATCH_DRAFT_BLUE_EMAIL,
  MATCH_DRAFT_RED_EMAIL,
  MATCH_DRAFT_SPECTATOR_EMAIL,
} from "./contract-fixtures";
import { localServiceClient, signedInLocalClient } from "./test-clients";

test("captains synchronize bans, reconnecting spectators catch up, stale and spectator actions fail", async ({ browser }) => {
  test.setTimeout(90_000);
  const fixtureId = seedFixture("match-draft").fixtureId!;
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const [blue, red, spectator] = await Promise.all(contexts.map((context) => context.newPage()));

  try {
    await Promise.all([
      signIn(blue, MATCH_DRAFT_BLUE_EMAIL, CONTRACT_PASSWORD),
      signIn(red, MATCH_DRAFT_RED_EMAIL, CONTRACT_PASSWORD),
      signIn(spectator, MATCH_DRAFT_SPECTATOR_EMAIL, CONTRACT_PASSWORD),
    ]);
    await Promise.all([
      blue.goto(`/match-draft/${fixtureId}`),
      red.goto(`/match-draft/${fixtureId}`),
      spectator.goto(`/match-draft/${fixtureId}`),
    ]);
    await expect(blue.getByTestId("champion-pool-grid")).toBeVisible();
    await expect(red.getByTestId("champion-pool-grid")).toBeVisible();
    await expect(spectator.getByTestId("champion-pool-grid").getByRole("button", { name: "Ahri", exact: true })).toBeDisabled();
    await expect(spectator.getByText("CAPTAINS-ONLY-CODE")).toHaveCount(0);

    await spectator.context().setOffline(true);
    await expect.poll(() => spectator.evaluate(() => navigator.onLine)).toBe(false);

    await blue.getByTestId("champion-pool-grid").getByRole("button", { name: "Ahri", exact: true }).click();
    await blue.getByRole("dialog", { name: "Confirm pick" }).getByRole("button", { name: "Lock in Ahri" }).click();
    await expect(red.getByTestId("ban-blue-1")).toContainText("Ahri");

    await red.getByTestId("champion-pool-grid").getByRole("button", { name: "Bard", exact: true }).click();
    await red.getByRole("dialog", { name: "Confirm pick" }).getByRole("button", { name: "Lock in Bard" }).click();
    await spectator.context().setOffline(false);
    await expect.poll(() => spectator.evaluate(() => navigator.onLine)).toBe(true);
    await expect(spectator.getByTestId("ban-blue-1")).toContainText("Ahri", { timeout: 20_000 });
    await expect(spectator.getByTestId("ban-red-1")).toContainText("Bard", { timeout: 20_000 });

    const blueClient = await signedInLocalClient(MATCH_DRAFT_BLUE_EMAIL, CONTRACT_PASSWORD);
    const stale = await blueClient.rpc("apply_match_draft_action", {
      p_fixture: fixtureId, p_game: 1, p_step: 0, p_champion: "Caitlyn", p_player_name: null,
    });
    expect(stale.error?.message).toContain("OUT_OF_TURN");
    const spectatorClient = await signedInLocalClient(MATCH_DRAFT_SPECTATOR_EMAIL, CONTRACT_PASSWORD);
    const forbidden = await spectatorClient.rpc("apply_match_draft_action", {
      p_fixture: fixtureId, p_game: 1, p_step: 2, p_champion: "Caitlyn", p_player_name: null,
    });
    expect(forbidden.error?.message).toContain("NOT_A_CAPTAIN");

    const persisted = await localServiceClient().from("match_drafts").select("current_step_index,actions,blue_ready,red_ready").eq("fixture_id", fixtureId).eq("game_number", 1).single();
    expect(persisted.error).toBeNull();
    expect(persisted.data?.current_step_index).toBe(2);
    expect((persisted.data?.actions as Array<{ champion: string }>).map((action) => action.champion)).toEqual(["Ahri", "Bard"]);
    expect(persisted.data?.blue_ready).toBe(true);
    expect(persisted.data?.red_ready).toBe(true);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
