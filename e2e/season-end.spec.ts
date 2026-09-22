import { expect, test, type Locator } from "@playwright/test";
import { seedFixture, signIn } from "./fixtures";
import {
  SEASON_END_MEMBER_EMAIL,
  SEASON_END_PASSWORD,
  SEASON_END_PARTNER_EMAIL,
  SEASON_END_PARTNER_DISCORD_ID,
} from "./season-end-fixture";

test("Season's End public collection keeps Premier and Academy boundaries", async ({ page }) => {
  for (const path of ["/cards/season-end", "/academy/cards/season-end"]) {
    await page.goto(path);
    await expect(page.getByRole("main")).toContainText(/Season.?s End/);
    await expect(page.getByRole("main")).not.toContainText("Admin preview");
    await expect(page.getByRole("main")).not.toContainText("test wallet");
  }
});

test("Season's End purchase recovery, commerce, trading and dusting survive reloads", async ({ browser }) => {
  test.setTimeout(120_000);
  seedFixture("season-end");

  const memberContext = await browser.newContext();
  const partnerContext = await browser.newContext();
  const member = await memberContext.newPage();
  const partner = await partnerContext.newPage();

  try {
    await signIn(member, SEASON_END_MEMBER_EMAIL, SEASON_END_PASSWORD, "/cards/packs");
    const shop = member.getByTestId("season-end-pack-shop").first();
    await expect(shop).toBeVisible({ timeout: 30_000 });
    await shop.getByRole("button", { name: "Open for 500 betting dollars", exact: true }).click();
    // Reload while the purchase request is still resolving. The request id is
    // persisted before the server action starts, so the new page must recover
    // the same opening instead of charging a second time.
    await member.reload();
    await expect(member.getByText("Reveal 0/5 · the guaranteed foil is last")).toBeVisible({ timeout: 30_000 });
    await member.getByRole("button", { name: "Reveal remaining cards" }).click();
    await expect(member.getByRole("button", { name: "Open another pack" })).toBeVisible();

    await member.goto("/cards/season-end/market");
    const memberCommerce = member.getByTestId("season-end-commerce").first();
    const memberCopies = memberCommerce.locator("section").first();
    await expect(memberCopies.getByText(/Copy #\d+/)).toHaveCount(5, { timeout: 30_000 });
    const memberCopyIds = await copyIds(memberCopies);

    await memberCommerce.getByLabel("Ask").fill("100");
    await memberCommerce.getByRole("button", { name: "List copy", exact: true }).click();
    await expect(memberCommerce.getByRole("button", { name: "Your listing", exact: true })).toBeVisible({ timeout: 30_000 });

    await signIn(partner, SEASON_END_PARTNER_EMAIL, SEASON_END_PASSWORD, "/cards/packs");
    await expect(partner.getByText(/Recover your Season.?s End opening/).first()).toBeVisible({ timeout: 30_000 });
    await expect(partner.getByTestId("season-end-pack-shop").first().getByText("Reveal 0/5 · the guaranteed foil is last")).toBeVisible({ timeout: 30_000 });
    await expect(partner.getByRole("button", { name: "Open another pack" })).toBeVisible();

    await partner.goto("/cards/season-end/market");
    const partnerCommerce = partner.getByTestId("season-end-commerce").first();
    const partnerCopies = partnerCommerce.locator("section").first();
    await expect(partnerCopies.getByText(/Copy #\d+/)).toHaveCount(5, { timeout: 30_000 });
    const partnerCopyIds = await copyIds(partnerCopies);

    await partnerCommerce.getByRole("button", { name: "Buy for 100", exact: true }).click();
    await partnerCommerce.getByRole("button", { name: "Confirm 100", exact: true }).click();
    await expect(partnerCopies.getByText(/Copy #\d+/)).toHaveCount(6, { timeout: 30_000 });
    await member.reload();
    await expect(memberCopies.getByText(/Copy #\d+/)).toHaveCount(4, { timeout: 30_000 });

    const remainingMemberCopyIds = await copyIds(memberCopies);
    const remainingPartnerCopyIds = await copyIds(partnerCommerce.locator("section").first());
    const tradeSection = memberCommerce.locator("section").filter({ hasText: "Direct trades" }).first();
    await tradeSection.getByPlaceholder("Recipient Discord id").fill(SEASON_END_PARTNER_DISCORD_ID);
    await tradeSection.getByPlaceholder("Your copy ids: 123, 456").fill(String(remainingMemberCopyIds[0]));
    await tradeSection.getByPlaceholder("Requested copy ids").fill(String(remainingPartnerCopyIds[0]));
    await tradeSection.getByRole("button", { name: "Send trade offer", exact: true }).click();
    await expect(tradeSection.getByText(/Offer #\d+/)).toBeVisible({ timeout: 30_000 });

    await partner.reload();
    const partnerTradeSection = partner.getByTestId("season-end-commerce").first().locator("section").filter({ hasText: "Direct trades" }).first();
    await partnerTradeSection.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(partnerTradeSection.getByRole("button", { name: "Accept", exact: true })).toHaveCount(0, { timeout: 30_000 });

    const dustSection = partner.getByTestId("season-end-commerce").first().locator("section").first();
    partner.once("dialog", (dialog) => dialog.accept());
    await dustSection.getByRole("button", { name: "Dust", exact: true }).first().click();
    await expect(dustSection.getByText(/Copy #\d+/)).toHaveCount(5, { timeout: 30_000 });

    expect(memberCopyIds).toHaveLength(5);
    expect(partnerCopyIds).toHaveLength(5);
  } finally {
    await Promise.all([memberContext.close(), partnerContext.close()]);
  }
});

async function copyIds(section: Locator): Promise<number[]> {
  const labels = await section.getByText(/Copy #\d+/).allTextContents();
  return labels.map((label) => Number(label.match(/Copy #(\d+)/)?.[1])).filter(Number.isFinite);
}
