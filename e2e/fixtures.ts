import { test as base, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";

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

export function seedFixture(scenario: "draft" | "betting" | "fpldle"): void {
  const script = scenario === "draft" ? "seed.ts" : `seed-${scenario}.ts`;
  execFileSync(process.execPath, ["--import", "tsx", `e2e/${script}`], { stdio: "inherit" });
}

export async function signIn(page: Page, email: string, password: string, redirect = "/"): Promise<void> {
  await page.goto(`/login?redirect=${encodeURIComponent(redirect)}`);
  await page.getByPlaceholder("email").fill(email);
  await page.getByPlaceholder("password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(redirect);
}
