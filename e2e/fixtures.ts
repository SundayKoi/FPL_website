import { test as base, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

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

function readLocalSupabaseConfig(): { url: string; serviceKey: string } {
  const status = JSON.parse(execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8" })) as {
    API_URL?: string;
    SERVICE_ROLE_KEY?: string;
  };
  const url = status.API_URL;
  const serviceKey = status.SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Local Supabase is not running; refusing to seed an E2E fixture.");

  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const localUrl = new URL(url);
  if (!localHosts.has(localUrl.hostname)) {
    throw new Error(`E2E fixtures may only use local Supabase (reported host: ${localUrl.hostname}).`);
  }

  // Next reads .env files in this precedence order. Reject a cloud target here
  // before fixture scripts write anything, even when the shell itself has no
  // Supabase URL exported.
  const fileConfig: Record<string, string | undefined> = {};
  for (const file of [".env", ".env.development", ".env.local", ".env.development.local"]) {
    try {
      for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        const match = line.match(/^\s*(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)\s*=\s*(.*?)\s*$/);
        if (match) fileConfig[match[1]] = match[2].replace(/^['\"]|['\"]$/g, "");
      }
    } catch {
      // Missing optional env files are expected in clean checkouts.
    }
  }

  const appConfig = { ...fileConfig, ...process.env } as Record<string, string | undefined>;
  const configuredUrl = appConfig.NEXT_PUBLIC_SUPABASE_URL;
  if (configuredUrl) {
    const target = new URL(configuredUrl);
    if (!localHosts.has(target.hostname) || target.origin !== localUrl.origin) {
      throw new Error(`E2E app and fixtures must target local Supabase at ${localUrl.origin}; configured app host is ${target.hostname}.`);
    }
  }
  const configuredServiceKey = appConfig.SUPABASE_SERVICE_ROLE_KEY;
  if (configuredServiceKey && configuredServiceKey !== serviceKey) {
    throw new Error("The configured service-role key does not match the local Supabase key; refusing to seed an E2E fixture.");
  }

  return { url: localUrl.origin, serviceKey };
}

export function seedFixture(scenario: "draft" | "betting" | "fpldle" | "season-end"): void {
  const script = scenario === "draft" ? "seed.ts" : `seed-${scenario}.ts`;
  const local = readLocalSupabaseConfig();
  execFileSync(process.execPath, ["--import", "tsx", `e2e/${script}`], {
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: local.url,
      SUPABASE_SERVICE_ROLE_KEY: local.serviceKey,
    },
  });
}

export async function signIn(page: Page, email: string, password: string, redirect = "/"): Promise<void> {
  await page.goto(`/login?redirect=${encodeURIComponent(redirect)}`);
  const form = page.locator("form").last();
  await form.getByPlaceholder("email").fill(email);
  await form.getByPlaceholder("password").fill(password);
  await form.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(redirect);
}
