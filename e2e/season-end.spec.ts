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

test("independently seeded Season's End copies retain owners, provenance, and exact wallet balances through commerce", async ({ browser }) => {
  test.setTimeout(120_000);
  const releaseId = seedFixture("season-end-commerce").fixtureId!;
  const service = localServiceClient();
  const { data: seededCopies, error: seedReadError } = await service.from("season_end_inventory")
    .select("id,discord_id,design_id,kind,foil_type,signed")
    .eq("release_id", releaseId).eq("mode", "public").order("id");
  expect(seedReadError).toBeNull();
  const memberSeedIds = (seededCopies ?? []).filter((copy) => copy.discord_id === SEASON_END_MEMBER_DISCORD_ID).map((copy) => copy.id);
  const partnerSeedIds = (seededCopies ?? []).filter((copy) => copy.discord_id === SEASON_END_PARTNER_DISCORD_ID).map((copy) => copy.id);
  expect(memberSeedIds).toHaveLength(5);
  expect(partnerSeedIds).toHaveLength(5);

  const memberContext = await browser.newContext();
  const partnerContext = await browser.newContext();
  const member = await memberContext.newPage();
  const partner = await partnerContext.newPage();
  const marketUrl = `/cards/season-end/market?release=${encodeURIComponent(releaseId)}`;

  try {
    await signIn(member, SEASON_END_MEMBER_EMAIL, SEASON_END_PASSWORD, marketUrl);
    const memberCommerce = member.getByTestId("season-end-commerce");
    const memberCopies = memberCommerce.getByRole("region", { name: "Your public copies" });
    await expect(memberCopies.getByText(/Copy #\d+/)).toHaveCount(5);
    const saleId = memberSeedIds[0];
    const listingForm = memberCommerce.getByRole("region", { name: "Fixed-price listing" }).locator("form");
    await listingForm.getByLabel("Copy").selectOption(String(saleId));
    await listingForm.getByLabel("Ask").fill("100");
    await listingForm.getByRole("button", { name: "List copy", exact: true }).click();
    const ownListing = memberCommerce.locator("li").filter({ hasText: `#${saleId}` });
    await expect(ownListing.getByRole("button", { name: "Your listing", exact: true })).toBeVisible();

    await signIn(partner, SEASON_END_PARTNER_EMAIL, SEASON_END_PASSWORD, marketUrl);
    let partnerCommerce = partner.getByTestId("season-end-commerce");
    const partnerListing = partnerCommerce.locator("li").filter({ hasText: `#${saleId}` });
    await expect(partnerCommerce.getByRole("region", { name: "Your public copies" }).getByText(/Copy #\d+/)).toHaveCount(5);
    await partnerListing.getByRole("button", { name: "Buy for 100", exact: true }).click();
    await partnerListing.getByRole("button", { name: "Confirm 100", exact: true }).click();
    await partner.reload();
    partnerCommerce = partner.getByTestId("season-end-commerce");
    await expect(partnerCommerce.getByRole("region", { name: "Your public copies" }).getByText(/Copy #\d+/)).toHaveCount(6);
    await member.reload();
    await expect(member.getByTestId("season-end-commerce").getByRole("region", { name: "Your public copies" }).getByText(/Copy #\d+/)).toHaveCount(4);

    const tradedMemberId = memberSeedIds.find((id) => id !== saleId)!;
    const tradedPartnerId = partnerSeedIds.find((id) => id !== saleId)!;
    const tradeSection = member.getByTestId("season-end-commerce").getByRole("region", { name: "Direct trades" });
    await tradeSection.getByPlaceholder("Recipient Discord id").fill(SEASON_END_PARTNER_DISCORD_ID);
    await tradeSection.getByPlaceholder("Your copy ids: 123, 456").fill(String(tradedMemberId));
    await tradeSection.getByPlaceholder("Requested copy ids").fill(String(tradedPartnerId));
    await tradeSection.getByRole("button", { name: "Send trade offer", exact: true }).click();
    const offerText = await tradeSection.getByText(/Offer #\d+/).textContent();
    const tradeId = Number(offerText?.match(/Offer #(\d+)/)?.[1]);
    expect(Number.isFinite(tradeId)).toBe(true);

    await partner.reload();
    const partnerTradeSection = partner.getByTestId("season-end-commerce").getByRole("region", { name: "Direct trades" });
    await partnerTradeSection.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(partnerTradeSection.getByRole("button", { name: "Accept", exact: true })).toHaveCount(0);

    const dustId = partnerSeedIds.find((id) => id !== tradedPartnerId)!;
    const quote = await service.rpc("season_end_dust_quote", { p_user: SEASON_END_PARTNER_DISCORD_ID, p_inventory: dustId });
    expect(quote.error).toBeNull();
    const dustValue = Array.isArray(quote.data) ? quote.data[0]?.value : undefined;
    expect(Number.isFinite(Number(dustValue))).toBe(true);
    await partner.reload();
    const dustCopy = partner.getByTestId("season-end-commerce").locator("article").filter({ hasText: `Copy #${dustId}` });
    partner.once("dialog", (dialog) => dialog.accept());
    await dustCopy.getByRole("button", { name: "Dust", exact: true }).click();
    await expect.poll(async () => {
      const { data } = await service.from("season_end_inventory").select("lifecycle_status").eq("id", dustId).single();
      return data?.lifecycle_status;
    }).toBe("dusted");

    await Promise.all([member.reload(), partner.reload()]);
    await expect(member.getByTestId("season-end-commerce").getByRole("region", { name: "Your public copies" }).getByText(/Copy #\d+/)).toHaveCount(4);
    await expect(partner.getByTestId("season-end-commerce").getByRole("region", { name: "Your public copies" }).getByText(/Copy #\d+/)).toHaveCount(5);

    const { data: sale } = await service.from("season_end_listings").select("id,status,buyer_discord")
      .eq("inventory_id", saleId).single();
    if (!sale) throw new Error("The sale listing was not persisted.");
    expect(sale).toMatchObject({ status: "sold", buyer_discord: SEASON_END_PARTNER_DISCORD_ID });
    const { data: trade } = await service.from("season_end_trades").select("id,status,offered_inventory_ids,requested_inventory_ids")
      .eq("id", tradeId).single();
    expect(trade).toMatchObject({ status: "accepted", offered_inventory_ids: [tradedMemberId], requested_inventory_ids: [tradedPartnerId] });

    const { data: finalCopies } = await service.from("season_end_inventory").select("id,discord_id,lifecycle_status,ownership_version")
      .eq("release_id", releaseId).eq("mode", "public");
    const ownerOf = (id: number) => finalCopies?.find((copy) => copy.id === id);
    expect(ownerOf(saleId)).toMatchObject({ discord_id: SEASON_END_PARTNER_DISCORD_ID, lifecycle_status: "active", ownership_version: 1 });
    expect(ownerOf(tradedMemberId)).toMatchObject({ discord_id: SEASON_END_PARTNER_DISCORD_ID, lifecycle_status: "active", ownership_version: 1 });
    expect(ownerOf(tradedPartnerId)).toMatchObject({ discord_id: SEASON_END_MEMBER_DISCORD_ID, lifecycle_status: "active", ownership_version: 1 });
    expect(ownerOf(dustId)).toMatchObject({ discord_id: SEASON_END_PARTNER_DISCORD_ID, lifecycle_status: "dusted", ownership_version: 1 });

    for (const [id, event, discordId] of [
      [saleId, "sold", SEASON_END_PARTNER_DISCORD_ID],
      [tradedMemberId, "traded", SEASON_END_PARTNER_DISCORD_ID],
      [tradedPartnerId, "traded", SEASON_END_MEMBER_DISCORD_ID],
      [dustId, "dusted", SEASON_END_PARTNER_DISCORD_ID],
    ] as const) {
      const { data: provenance } = await service.from("season_end_provenance")
        .select("event,discord_id").eq("inventory_id", id).order("id");
      const mintedBy = id === saleId || id === tradedMemberId ? SEASON_END_MEMBER_DISCORD_ID : SEASON_END_PARTNER_DISCORD_ID;
      expect(provenance).toEqual([
        { event: "minted", discord_id: mintedBy },
        { event, discord_id: discordId },
      ]);
    }

    const { data: wallets } = await service.from("betting_profiles").select("discord_id,balance")
      .in("discord_id", [SEASON_END_MEMBER_DISCORD_ID, SEASON_END_PARTNER_DISCORD_ID]);
    expect(wallets?.find((wallet) => wallet.discord_id === SEASON_END_MEMBER_DISCORD_ID)?.balance).toBe(4_600);
    expect(wallets?.find((wallet) => wallet.discord_id === SEASON_END_PARTNER_DISCORD_ID)?.balance).toBe(4_400 + Number(dustValue));
    const { data: ledger } = await service.from("betting_ledger").select("discord_id,delta,reason,ref_id")
      .eq("reason", "season_end_sale").eq("ref_table", "season_end_listings").eq("ref_id", sale.id).order("discord_id");
    expect(ledger).toEqual([
      { discord_id: SEASON_END_MEMBER_DISCORD_ID, delta: 100, reason: "season_end_sale", ref_id: sale.id },
      { discord_id: SEASON_END_PARTNER_DISCORD_ID, delta: -100, reason: "season_end_sale", ref_id: sale.id },
    ]);
    const { data: dustLedger } = await service.from("betting_ledger")
      .select("discord_id,delta,reason,ref_table,ref_id")
      .eq("discord_id", SEASON_END_PARTNER_DISCORD_ID).eq("reason", "season_end_dust")
      .eq("ref_table", "season_end_inventory").eq("ref_id", dustId);
    expect(dustLedger).toEqual([{
      discord_id: SEASON_END_PARTNER_DISCORD_ID,
      delta: Number(dustValue),
      reason: "season_end_dust",
      ref_table: "season_end_inventory",
      ref_id: dustId,
    }]);
  } finally {
    await Promise.all([memberContext.close(), partnerContext.close()]);
  }
});
