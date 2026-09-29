import { expect } from "@playwright/test";
import { signIn, seedFixture, test } from "./fixtures";
import { BETTING_ADMIN_EMAIL, BETTING_PASSWORD } from "../scripts/betting-fixture";

test("seeded Premier and Academy puzzles can be solved", async ({ page }) => {
  seedFixture("betting");
  seedFixture("fpldle");
  await signIn(page, BETTING_ADMIN_EMAIL, BETTING_PASSWORD, "/fpldle");

  for (const puzzle of [
    { path: "/fpldle", name: "Premier Smoke" },
    { path: "/academy/fpldle", name: "Academy Smoke" },
  ]) {
    await page.goto(puzzle.path);
    await expect(page.getByRole("heading", { name: "FPL'dle" })).toBeVisible();
    const input = page.getByRole("combobox", { name: "Search players" });
    await input.fill(puzzle.name);
    await page.getByRole("option", { name: new RegExp(puzzle.name) }).click();
    await page.getByRole("button", { name: "Submit guess" }).click();
    await expect(page.getByText("Solved in 1")).toBeVisible();
  }
});
