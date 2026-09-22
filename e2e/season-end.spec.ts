import { expect, test } from "@playwright/test";

test("Season's End public collection keeps Premier and Academy boundaries", async ({ page }) => {
  for (const path of ["/cards/season-end", "/academy/cards/season-end"]) {
    await page.goto(path);
    await expect(page.getByRole("main")).toContainText(/Season.?s End/);
    await expect(page.getByRole("main")).not.toContainText("Admin preview");
    await expect(page.getByRole("main")).not.toContainText("test wallet");
  }
});
