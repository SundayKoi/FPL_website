/**
 * e2e/seed-betting.ts — betting.spec.ts's own fixture builder, mirroring
 * e2e/seed.ts's pattern for draft.spec.ts: a member + admin dev-login user
 * (real auth.users, so the app's real /login form can sign them in), a
 * two-team market, and a pre-existing losing bet — see
 * scripts/betting-fixture.ts for the actual fixture shape/math.
 *
 * Deliberately betting-only, not the full `npm run seed:demo` 12-team demo
 * draft, so `npx playwright test`/`npm run e2e` self-seeds this spec without
 * a manual step first (same self-seeding contract draft.spec.ts already
 * has via e2e/seed.ts).
 *
 * Run with: npx tsx e2e/seed-betting.ts
 *
 * Needs the local Supabase service_role key (bypasses RLS + can drive
 * auth.admin, and — via betting-fixture.ts's runSql — reaches auth.identities
 * directly). Resolution order, same as e2e/seed.ts:
 *   1. env var SUPABASE_SERVICE_ROLE_KEY, if already set
 *   2. otherwise, shell out to `npx supabase status -o json` (requires local
 *      Supabase already running via `npx supabase start`)
 */
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { seedBettingFixture, BETTING_MEMBER_EMAIL, BETTING_ADMIN_EMAIL, BETTING_PASSWORD } from "../scripts/betting-fixture";

function resolveConfig(): { url: string; serviceKey: string } {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const envKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (envUrl && envKey) return { url: envUrl, serviceKey: envKey };
  const status = JSON.parse(execSync("npx supabase status -o json", { encoding: "utf8" }));
  const url = envUrl ?? status.API_URL;
  const serviceKey = envKey ?? status.SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Could not resolve Supabase URL / service_role key. Is `npx supabase start` running? " +
        "Or set SUPABASE_SERVICE_ROLE_KEY (and optionally NEXT_PUBLIC_SUPABASE_URL) yourself."
    );
  }
  return { url, serviceKey };
}

async function ensureUser(
  admin: ReturnType<typeof createClient>["auth"]["admin"],
  email: string
): Promise<string> {
  const { data, error } = await admin.createUser({ email, password: BETTING_PASSWORD, email_confirm: true });
  if (!error) return data.user.id;

  // Already exists from a prior seed run — look it up instead (see
  // e2e/seed.ts's ensureUser for the same "email_exists" reasoning).
  const code = (error as { code?: string }).code ?? "";
  const msg = error.message ?? String(error);
  const alreadyExists = code === "email_exists" || /already registered|already exists/i.test(msg);
  if (!alreadyExists) throw error;

  let page = 1;
  for (;;) {
    const { data: list, error: listErr } = await admin.listUsers({ page, perPage: 200 });
    if (listErr) throw listErr;
    const found = list.users.find((u) => u.email === email);
    if (found) return found.id;
    if (list.users.length < 200) break;
    page += 1;
  }
  throw new Error(`Could not find or create user ${email}`);
}

async function main() {
  const { url, serviceKey } = resolveConfig();
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  const memberId = await ensureUser(supabase.auth.admin, BETTING_MEMBER_EMAIL);
  const adminId = await ensureUser(supabase.auth.admin, BETTING_ADMIN_EMAIL);
  await seedBettingFixture(supabase, memberId, adminId);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
