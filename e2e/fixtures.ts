import { test as base, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { getLocalTestSupabase } from "./local-supabase";

/** Separate users for the auction; contexts close even when an assertion fails. */
export const test = base.extend<{ captains: [Page, Page] }>({
  captains: async ({ browser, baseURL }, runTest) => {
    const contexts: BrowserContext[] = [];
    try {
      contexts.push(await browser.newContext({ baseURL }));
      contexts.push(await browser.newContext({ baseURL }));
      await runTest([await contexts[0].newPage(), await contexts[1].newPage()]);
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  },
});

export type SeedResult = {
  fixtureId?: string;
  academyFixtureId?: string;
  historicalFixtureId?: string;
  marketId?: string;
  academyReleaseId?: string;
  historicalReleaseId?: string;
  captainAProfileId?: string;
  captainBProfileId?: string;
  spectatorProfileId?: string;
};

export function seedFixture(scenario: "draft" | "betting" | "season-end-recovery" | "season-end-commerce" | "access" | "isolation" | "match-draft"): SeedResult {
  const stack = getLocalTestSupabase();
  const contractSeed = ["access", "isolation", "match-draft"].includes(scenario);
  const script = scenario === "draft" ? "seed.ts" : scenario === "betting" ? "seed-betting.ts"
    : scenario.startsWith("season-end-") ? `seed-${scenario}.ts` : "seed-contracts.ts";
  const scriptArgs = contractSeed ? [scenario] : [];
  const fixtureEnv = { ...process.env };
  // Do not pass conflicting color controls into nested Node/Supabase CLI
  // processes. Node's error formatting can fail before surfacing the actual
  // seed error when both variables are inherited from a developer shell.
  delete fixtureEnv.FORCE_COLOR;
  delete fixtureEnv.NO_COLOR;
  try {
    const output = execFileSync(process.execPath, ["--import", "tsx", `e2e/${script}`, ...scriptArgs], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: fixtureEnv,
      maxBuffer: 4 * 1024 * 1024,
    });
    const result: SeedResult = {};
    for (const [field, marker] of [
      ["fixtureId", "FPL_TEST_FIXTURE_ID"],
      ["academyFixtureId", "FPL_TEST_ACADEMY_FIXTURE_ID"],
      ["historicalFixtureId", "FPL_TEST_HISTORICAL_FIXTURE_ID"],
      ["marketId", "FPL_TEST_MARKET_ID"],
      ["academyReleaseId", "FPL_TEST_ACADEMY_RELEASE_ID"],
      ["historicalReleaseId", "FPL_TEST_HISTORICAL_RELEASE_ID"],
      ["captainAProfileId", "FPL_TEST_CAPTAIN_A_PROFILE_ID"],
      ["captainBProfileId", "FPL_TEST_CAPTAIN_B_PROFILE_ID"],
      ["spectatorProfileId", "FPL_TEST_SPECTATOR_PROFILE_ID"],
    ] as const) {
      const value = output.match(new RegExp(`^${marker}=([A-Za-z0-9-]+)$`, "m"))?.[1];
      if (value) result[field] = value;
    }
    console.log(`Seeded ${scenario} fixtures in the isolated local database.`);
    return result;
  } catch (error) {
    const detail = error instanceof Error && "stderr" in error
      ? String((error as NodeJS.ErrnoException & { stderr?: string }).stderr ?? "")
      : "";
    const safeDetail = detail
      .split(stack.serviceRoleKey).join("[redacted]")
      .split(stack.anonKey).join("[redacted]")
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted jwt]")
      .trim()
      .slice(-3000);
    throw new Error(`Failed to seed ${scenario} fixtures.${safeDetail ? `\n${safeDetail}` : ""}`);
  }
}

export async function signIn(page: Page, email: string, password: string, redirect = "/"): Promise<void> {
  await page.goto(`/login?redirect=${encodeURIComponent(redirect)}`);
  const form = page.locator("form").last();
  await form.getByPlaceholder("email").fill(email);
  await form.getByPlaceholder("password").fill(password);
  await form.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(redirect);
}
