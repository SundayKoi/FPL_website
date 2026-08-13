import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
    // Makes betting.spec.ts's BETTING_GATE_DISABLED bypass (src/lib/betting/
    // access.ts) genuinely load-bearing for this run, instead of the gate
    // already being open because Discord isn't configured at all: with a
    // guild/token/role "configured" (even to junk values), bettingAccess()
    // would otherwise actually attempt a Discord membership fetch on every
    // call — merged on top of process.env by Playwright (user vars win), see
    // WebServerPlugin's launch env construction.
    env: {
      BETTING_GATE_DISABLED: "1",
      DISCORD_GUILD_ID: "1",
      DISCORD_BOT_TOKEN: "x",
      DISCORD_REQUIRED_ROLE_ID: "1",
    },
  },
});
