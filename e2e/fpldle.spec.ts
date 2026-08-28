import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";

test("seeded Premier and Academy puzzles can be solved", async ({ page }) => {
  execSync("npx tsx e2e/seed-fpldle.ts", { stdio: "inherit" });

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
