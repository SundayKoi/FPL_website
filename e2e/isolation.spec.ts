import { expect, test } from "@playwright/test";
import { seedFixture, signIn } from "./fixtures";
import { CONTRACT_PASSWORD, ISOLATION_CAPTAIN_EMAIL } from "./contract-fixtures";
import { localServiceClient, signedInLocalClient } from "./test-clients";

test("Premier, Academy, and historical rows stay inside the captain's league and season", async ({ page }) => {
  const seeded = seedFixture("isolation");
  const premierId = seeded.fixtureId!;
  const academyId = seeded.academyFixtureId!;
  const historicalId = seeded.historicalFixtureId!;
  await signIn(page, ISOLATION_CAPTAIN_EMAIL, CONTRACT_PASSWORD);
  await page.reload();

  // Exercise the real shared Next.js schedule read: S5 is the current Premier
  // season in this fixture, while Academy and S4 rows share the same table.
  // Expanding Finals makes the seeded fixture a visible user-facing result.
  await page.goto("/schedule?season=S5&stages=finals");
  await expect(page.getByRole("link", { name: "Premier Isolation Alpha" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Premier Isolation Beta" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Academy Isolation Alpha" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "History Isolation Alpha" })).toHaveCount(0);

  const captain = await signedInLocalClient(ISOLATION_CAPTAIN_EMAIL, CONTRACT_PASSWORD);
  const fixtures = await captain.from("fixtures").select("id,season").in("id", [premierId, academyId, historicalId]);
  expect(fixtures.error).toBeNull();
  expect(fixtures.data?.map((row) => row.season).sort()).toEqual(["A1", "S4", "S5"]);

  const privateCodes = await captain.from("match_codes").select("fixture_id,season,code").in("fixture_id", [premierId, academyId, historicalId]);
  expect(privateCodes.error).toBeNull();
  expect(privateCodes.data).toEqual([{ fixture_id: premierId, season: "S5", code: "PREMIER-S5-ONLY" }]);

  const ownMutation = await captain.rpc("set_match_draft_ready", {
    p_fixture: premierId, p_game: 1, p_side: "blue", p_ready: true,
  });
  expect(ownMutation.error).toBeNull();
  for (const foreignFixtureId of [academyId, historicalId]) {
    const foreignMutation = await captain.rpc("set_match_draft_ready", {
      p_fixture: foreignFixtureId, p_game: 1, p_side: "blue", p_ready: true,
    });
    expect(foreignMutation.error?.message).toContain("NOT_A_CAPTAIN");
  }

  const persisted = await localServiceClient().from("match_drafts")
    .select("fixture_id,layout,blue_ready,red_ready").in("fixture_id", [premierId, academyId, historicalId]).order("fixture_id");
  expect(persisted.data).toHaveLength(3);
  expect(persisted.data?.find((row) => row.fixture_id === premierId)?.blue_ready).toBe(true);
  expect(persisted.data?.find((row) => row.fixture_id === premierId)?.red_ready).toBe(false);
  expect(persisted.data?.filter((row) => row.fixture_id !== premierId).every((row) => row.layout === "stage")).toBe(true);
  expect(persisted.data?.filter((row) => row.fixture_id !== premierId).every((row) => !row.blue_ready && !row.red_ready)).toBe(true);
});
