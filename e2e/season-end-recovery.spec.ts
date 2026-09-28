import { expect, test } from "@playwright/test";
import { seedFixture, signIn } from "./fixtures";
import {
  SEASON_END_MEMBER_DISCORD_ID,
  SEASON_END_MEMBER_EMAIL,
  SEASON_END_PARTNER_DISCORD_ID,
  SEASON_END_PARTNER_EMAIL,
  SEASON_END_PASSWORD,
} from "./season-end-fixture";
import { localServiceClient } from "./test-clients";

test("a charged pending opening recovers once for its owner and stays private to that account", async ({ browser }) => {
  test.setTimeout(90_000);
  const { fixtureId: releaseId, pendingRequestId } = seedFixture("season-end-recovery");
  const service = localServiceClient();
  const memberContext = await browser.newContext();
  // This journey verifies charged-request recovery and persisted ownership;
  // reduced motion exercises PackOpening's accessible no-animation path.
  const partnerContext = await browser.newContext({ reducedMotion: "reduce" });
  const member = await memberContext.newPage();
  const partner = await partnerContext.newPage();

  try {
    await signIn(partner, SEASON_END_PARTNER_EMAIL, SEASON_END_PASSWORD, "/cards/packs");
    await expect(partner.getByRole("heading", { name: /Recover your Season.?s End opening/ })).toBeVisible({ timeout: 30_000 });
    const opening = partner.getByRole("dialog", { name: "Opening a card pack" });
    await expect(opening).toBeVisible({ timeout: 30_000 });
    await expect(opening.getByText("That's the pack", { exact: true })).toBeVisible();
    await opening.getByRole("button", { name: "Done", exact: true }).click();
    await expect(opening).toHaveCount(0);

    const { data: recovered } = await service.from("season_end_openings")
      .select("opening_id,request_id,discord_id,release_id,status,price,card_ids")
      .eq("request_id", pendingRequestId).single();
    expect(recovered).toMatchObject({ request_id: pendingRequestId, discord_id: SEASON_END_PARTNER_DISCORD_ID, release_id: releaseId, status: "fulfilled", price: 500 });
    expect(recovered?.card_ids).toHaveLength(5);
    const { data: inventory } = await service.from("season_end_inventory").select("id,design_id,discord_id,opening_id")
      .eq("opening_id", recovered!.opening_id);
    expect(inventory).toHaveLength(5);
    expect(new Set(inventory?.map((copy) => copy.design_id)).size).toBe(5);
    expect(inventory?.every((copy) => copy.discord_id === SEASON_END_PARTNER_DISCORD_ID)).toBe(true);

    await partner.reload();
    await expect(partner.getByRole("heading", { name: /Recover your Season.?s End opening/ })).toHaveCount(0);
    await expect(partner.getByRole("dialog", { name: "Opening a card pack" })).toHaveCount(0);
    const { data: afterReload } = await service.from("season_end_inventory").select("id").eq("opening_id", recovered!.opening_id);
    expect(afterReload).toHaveLength(5);

    await signIn(member, SEASON_END_MEMBER_EMAIL, SEASON_END_PASSWORD, "/cards/packs");
    await expect(member.getByRole("heading", { name: /Recover your Season.?s End opening/ })).toHaveCount(0);
    await expect(member.getByRole("dialog", { name: "Opening a card pack" })).toHaveCount(0);
    const memberOpenings = await service.from("season_end_openings").select("opening_id")
      .eq("discord_id", SEASON_END_MEMBER_DISCORD_ID).eq("release_id", releaseId).eq("request_id", pendingRequestId);
    expect(memberOpenings.data).toEqual([]);

    const { data: wallets } = await service.from("betting_profiles").select("discord_id,balance")
      .in("discord_id", [SEASON_END_MEMBER_DISCORD_ID, SEASON_END_PARTNER_DISCORD_ID]);
    expect(wallets?.find((wallet) => wallet.discord_id === SEASON_END_PARTNER_DISCORD_ID)?.balance).toBe(4_500);
    expect(wallets?.find((wallet) => wallet.discord_id === SEASON_END_MEMBER_DISCORD_ID)?.balance).toBe(5_000);
  } finally {
    await Promise.all([memberContext.close(), partnerContext.close()]);
  }
});
