import { expect, test } from "@playwright/test";
import { seedFixture, signIn } from "./fixtures";
import {
  clearSeasonEndRecoveryCompletionInterruption,
  SEASON_END_MEMBER_DISCORD_ID,
  SEASON_END_MEMBER_EMAIL,
  SEASON_END_PARTNER_DISCORD_ID,
  SEASON_END_PARTNER_EMAIL,
  SEASON_END_PASSWORD,
} from "./season-end-fixture";
import { localServiceClient } from "./test-clients";

test("a paid opening recovers once through the owner boundary and rejects the same request from another account", async ({ browser }) => {
  test.setTimeout(120_000);
  const releaseId = seedFixture("season-end-recovery").fixtureId!;
  const service = localServiceClient();
  const memberContext = await browser.newContext();
  // Reduced motion exercises PackOpening's accessible no-animation path.
  const partnerContext = await browser.newContext({ reducedMotion: "reduce" });
  const member = await memberContext.newPage();
  const partner = await partnerContext.newPage();
  let interruptionInstalled = true;

  try {
    await signIn(partner, SEASON_END_PARTNER_EMAIL, SEASON_END_PASSWORD, "/cards/packs");
    const shop = partner.getByTestId("season-end-pack-shop");
    await shop.getByRole("button", { name: "Open for 500 betting dollars", exact: true }).click();

    // The normal authenticated purchase action creates and charges its own
    // request UUID. A targeted local DB trigger blocks fulfillment and refund,
    // leaving the real durable receipt pending at the interruption boundary.
    await expect(shop.getByRole("button", { name: "Retry recovery", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(shop.getByText(/pending recovery|retry the same intent/i)).toBeVisible();
    const { data: pendingRows, error: pendingError } = await service.from("season_end_openings")
      .select("opening_id,request_id,discord_id,release_id,status,price,card_ids,pack_open_id")
      .eq("release_id", releaseId).eq("discord_id", SEASON_END_PARTNER_DISCORD_ID);
    expect(pendingError).toBeNull();
    expect(pendingRows).toHaveLength(1);
    const pending = pendingRows![0];
    expect(pending).toMatchObject({ discord_id: SEASON_END_PARTNER_DISCORD_ID, release_id: releaseId, status: "pending", price: 500, card_ids: [] });
    expect(pending.request_id).toMatch(/^[0-9a-f-]{36}$/i);

    const { data: charge } = await service.from("betting_ledger")
      .select("discord_id,delta,reason,ref_table,ref_id")
      .eq("discord_id", SEASON_END_PARTNER_DISCORD_ID)
      .eq("reason", "card_pack").eq("ref_table", "card_pack_opens").eq("ref_id", pending.pack_open_id);
    expect(charge).toEqual([{
      discord_id: SEASON_END_PARTNER_DISCORD_ID,
      delta: -500,
      reason: "card_pack",
      ref_table: "card_pack_opens",
      ref_id: pending.pack_open_id,
    }]);
    const { data: chargedWallets } = await service.from("betting_profiles").select("discord_id,balance")
      .in("discord_id", [SEASON_END_MEMBER_DISCORD_ID, SEASON_END_PARTNER_DISCORD_ID]);
    expect(chargedWallets?.find((wallet) => wallet.discord_id === SEASON_END_PARTNER_DISCORD_ID)?.balance).toBe(4_500);
    expect(chargedWallets?.find((wallet) => wallet.discord_id === SEASON_END_MEMBER_DISCORD_ID)?.balance).toBe(5_000);

    clearSeasonEndRecoveryCompletionInterruption();
    interruptionInstalled = false;
    await shop.getByRole("button", { name: "Retry recovery", exact: true }).click();
    const opening = partner.getByRole("dialog", { name: "Opening a card pack" });
    await expect(opening).toBeVisible({ timeout: 30_000 });
    await expect(opening.getByText("That's the pack", { exact: true })).toBeVisible();
    await opening.getByRole("button", { name: "Done", exact: true }).click();
    await expect(opening).toHaveCount(0);

    const { data: recoveredRows } = await service.from("season_end_openings")
      .select("opening_id,request_id,discord_id,release_id,status,price,card_ids,pack_open_id")
      .eq("request_id", pending.request_id);
    expect(recoveredRows).toHaveLength(1);
    const recovered = recoveredRows![0];
    expect(recovered).toMatchObject({
      opening_id: pending.opening_id,
      request_id: pending.request_id,
      discord_id: SEASON_END_PARTNER_DISCORD_ID,
      release_id: releaseId,
      status: "fulfilled",
      price: 500,
    });
    expect(recovered.card_ids).toHaveLength(5);
    expect(new Set(recovered.card_ids).size).toBe(5);
    const { data: inventory } = await service.from("season_end_inventory")
      .select("id,design_id,discord_id,opening_id")
      .eq("opening_id", recovered.opening_id);
    expect(inventory).toHaveLength(5);
    expect(new Set(inventory?.map((copy) => copy.id)).size).toBe(5);
    expect(new Set(inventory?.map((copy) => copy.design_id)).size).toBe(5);
    expect(inventory?.every((copy) => copy.discord_id === SEASON_END_PARTNER_DISCORD_ID)).toBe(true);

    await partner.reload();
    await expect(partner.getByRole("heading", { name: /Recover your Season.?s End opening/ })).toHaveCount(0);
    await expect(partner.getByRole("dialog", { name: "Opening a card pack" })).toHaveCount(0);

    // A foreign account replays that exact UUID through the same shop server
    // action. The UI's account-scoped storage holds the copied intent only for
    // this attempt; the database must reject it before creating a debit.
    const foreignIntentKey = `season-end-pending:v2:${SEASON_END_MEMBER_DISCORD_ID}:${releaseId}:public`;
    await member.addInitScript(({ key, requestId }) => {
      window.localStorage.setItem(key, requestId);
    }, { key: foreignIntentKey, requestId: pending.request_id });
    await signIn(member, SEASON_END_MEMBER_EMAIL, SEASON_END_PASSWORD, "/cards/packs");
    const foreignShop = member.getByTestId("season-end-pack-shop");
    await expect(foreignShop.getByText(/could not be started/i)).toBeVisible({ timeout: 30_000 });

    const { data: afterForeignAttempt } = await service.from("season_end_openings")
      .select("opening_id,request_id,discord_id,release_id,status,card_ids,pack_open_id")
      .eq("request_id", pending.request_id);
    expect(afterForeignAttempt).toHaveLength(1);
    expect(afterForeignAttempt?.[0]).toMatchObject({
      opening_id: pending.opening_id,
      discord_id: SEASON_END_PARTNER_DISCORD_ID,
      release_id: releaseId,
      status: "fulfilled",
      pack_open_id: pending.pack_open_id,
    });
    const { data: finalInventory } = await service.from("season_end_inventory").select("id,opening_id")
      .eq("opening_id", pending.opening_id);
    expect(finalInventory).toHaveLength(5);
    const { data: finalCharge } = await service.from("betting_ledger")
      .select("id,delta,reason,ref_table,ref_id")
      .eq("discord_id", SEASON_END_PARTNER_DISCORD_ID)
      .eq("reason", "card_pack").eq("ref_table", "card_pack_opens").eq("ref_id", pending.pack_open_id);
    expect(finalCharge).toHaveLength(1);
    const { data: finalWallets } = await service.from("betting_profiles").select("discord_id,balance")
      .in("discord_id", [SEASON_END_MEMBER_DISCORD_ID, SEASON_END_PARTNER_DISCORD_ID]);
    expect(finalWallets?.find((wallet) => wallet.discord_id === SEASON_END_PARTNER_DISCORD_ID)?.balance).toBe(4_500);
    expect(finalWallets?.find((wallet) => wallet.discord_id === SEASON_END_MEMBER_DISCORD_ID)?.balance).toBe(5_000);
  } finally {
    if (interruptionInstalled) clearSeasonEndRecoveryCompletionInterruption();
    await Promise.all([memberContext.close(), partnerContext.close()]);
  }
});
