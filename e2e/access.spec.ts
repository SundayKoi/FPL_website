import { expect, test } from "@playwright/test";
import { seedFixture, signIn } from "./fixtures";
import { ACCESS_ADMIN_EMAIL, ACCESS_MEMBER_EMAIL, CONTRACT_PASSWORD } from "./contract-fixtures";
import { localAnonClient, localServiceClient, signedInLocalClient } from "./test-clients";

test("sessions, private reads, and staff-only mutation follow server access", async ({ page }) => {
  const seeded = seedFixture("access");
  const fixtureId = seeded.fixtureId!;

  // An anonymous request is redirected before the admin page is rendered.
  await page.goto("/admin");
  await page.waitForURL("/");

  const anonymous = localAnonClient();
  const anonymousCodes = await anonymous.from("match_codes").select("code").eq("fixture_id", fixtureId);
  expect(anonymousCodes.error).not.toBeNull();

  await signIn(page, ACCESS_MEMBER_EMAIL, CONTRACT_PASSWORD);
  await page.goto("/admin");
  await page.waitForURL("/");

  const member = await signedInLocalClient(ACCESS_MEMBER_EMAIL, CONTRACT_PASSWORD);
  const memberCodes = await member.from("match_codes").select("code").eq("fixture_id", fixtureId);
  expect(memberCodes.error).toBeNull();
  expect(memberCodes.data).toEqual([]);
  const deniedWrite = await member.from("league_settings")
    .update({ homepage_mode: "preseason" }).eq("id", 1).select("homepage_mode");
  expect(deniedWrite.error).toBeNull();
  expect(deniedWrite.data).toEqual([]);
  const settings = await localServiceClient().from("league_settings").select("homepage_mode").eq("id", 1).single();
  expect(settings.data?.homepage_mode).toBe("auto");

  await signIn(page, ACCESS_ADMIN_EMAIL, CONTRACT_PASSWORD, "/admin/content");
  const homepageDisplay = page.getByRole("group", { name: "Homepage display mode" });
  await expect(homepageDisplay).toBeVisible();
  const admin = await signedInLocalClient(ACCESS_ADMIN_EMAIL, CONTRACT_PASSWORD);
  const adminCodes = await admin.from("match_codes").select("code").eq("fixture_id", fixtureId);
  expect(adminCodes.data).toEqual([{ code: "ACCESS-PRIVATE-CODE" }]);

  await page.getByRole("group", { name: "Homepage display mode" }).getByRole("button", { name: "Preseason", exact: true }).click();
  await expect(page.getByRole("group", { name: "Homepage display mode" }).getByRole("button", { name: "Preseason", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => {
    const { data } = await localServiceClient().from("league_settings").select("homepage_mode").eq("id", 1).single();
    return data?.homepage_mode;
  }).toBe("preseason");

  await page.reload();
  await expect(page.getByRole("group", { name: "Homepage display mode" }).getByRole("button", { name: "Preseason", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("/");
  await page.goto("/admin");
  await page.waitForURL("/");
  await member.auth.signOut();
  await admin.auth.signOut();
});
