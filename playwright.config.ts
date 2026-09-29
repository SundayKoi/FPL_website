import { defineConfig } from "@playwright/test";

const port = Number(process.env.FPL_TEST_APP_PORT ?? "3137");
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("FPL_TEST_APP_PORT must be an available unprivileged TCP port.");
}
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  outputDir: "test-results",
  use: { baseURL, trace: "retain-on-failure" },
  webServer: {
    command: `npm run start -- --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 90_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      SUPABASE_URL: process.env.SUPABASE_URL ?? "",
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? baseURL,
      SITE_URL: process.env.SITE_URL ?? baseURL,
      FPL_TEST_STACK_DIR: process.env.FPL_TEST_STACK_DIR ?? "",
      FPL_TEST_PROJECT_ID: process.env.FPL_TEST_PROJECT_ID ?? "",
      FPL_TEST_SUPABASE_URL: process.env.FPL_TEST_SUPABASE_URL ?? "",
      FPL_TEST_SUPABASE_ANON_KEY: process.env.FPL_TEST_SUPABASE_ANON_KEY ?? "",
      FPL_TEST_SUPABASE_SERVICE_ROLE_KEY: process.env.FPL_TEST_SUPABASE_SERVICE_ROLE_KEY ?? "",
      FPL_TEST_SUPABASE_DB_URL: process.env.FPL_TEST_SUPABASE_DB_URL ?? "",
      FPL_TEST_NEXT_DIST_DIR: process.env.FPL_TEST_NEXT_DIST_DIR ?? "",
      BETTING_GATE_DISABLED: "",
      DISCORD_APP_ID: "",
      DISCORD_BOT_TOKEN: "",
      DISCORD_CARDS_CHANNEL_ID: "",
      DISCORD_GUILD_ID: "",
      DISCORD_PUBLIC_KEY: "",
      DISCORD_REQUIRED_ROLE_ID: "",
      DISCORD_STAFF_ROLE_ID: "",
      DISCORD_CARDS_WEBHOOK_URL: "",
      RIOT_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      TWITCH_CLIENT_SECRET: "",
      SUPABASE_TELEMETRY_DISABLED: "1",
    },
  },
});
