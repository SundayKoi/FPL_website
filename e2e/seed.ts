/**
 * e2e/seed.ts — idempotent fixture builder for the Playwright smoke test.
 *
 * Builds a fresh "E2E Draft": 2 teams, 2 captains (real auth.users, so the
 * app's real /login form can sign them in), a short countdown (fast
 * test — long enough to survive real sign-in/navigation/click latency
 * against a live dev server, short enough to still exercise settlement
 * quickly), a pool of 3 mid / 3 adc / 3 support players, one pre-filled
 * top + jungle player per team, and sets the draft live with team 1 on the
 * clock — mirroring supabase/tests/helpers/_fixtures.sql's tests.fixture()
 * + tests.go_live() shape, but built at runtime against the real API
 * instead of inside a pgTAP transaction.
 *
 * Run with: npx tsx e2e/seed.ts
 *
 * Needs the local Supabase service_role key (bypasses RLS + can drive
 * auth.admin). Resolution order, so nothing is ever hardcoded here:
 *   1. env var SUPABASE_SERVICE_ROLE_KEY, if you've already set it, e.g.
 *        $env:SUPABASE_SERVICE_ROLE_KEY = (npx supabase status -o json | ConvertFrom-Json).SERVICE_ROLE_KEY
 *   2. otherwise, shell out to `npx supabase status -o json` ourselves and
 *      read SERVICE_ROLE_KEY / API_URL from it (requires local Supabase to
 *      already be running via `npx supabase start`).
 *
 * The local demo service_role JWT is identical for every default local
 * Supabase install, but we still never hardcode it — it's read as config
 * either way, so a non-default local setup (custom JWT secret) keeps working.
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const DRAFT_NAME = "E2E Draft";
const CAP1_EMAIL = "e2e-cap1@test.local";
const CAP2_EMAIL = "e2e-cap2@test.local";
const PASSWORD = "password123";
// The brief specs 6s; bumped to 12s in practice — a real signIn + navigate +
// click round trip against a live dev server routinely eats several seconds
// before the assertions around the nomination/outbid even run, and the lot
// must still be open when they do. Still short enough to prove settlement
// happens quickly and without a refresh.
const COUNTDOWN_SECONDS = 12;

function supabaseStatusJson(): Record<string, string> {
  const out = execSync("npx supabase status -o json", { encoding: "utf8" });
  return JSON.parse(out);
}

function resolveConfig(): { url: string; serviceKey: string } {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const envKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (envUrl && envKey) return { url: envUrl, serviceKey: envKey };

  const status = supabaseStatusJson();
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
  email: string,
  password: string
): Promise<string> {
  const { data, error } = await admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!error) return data.user.id;

  // Already exists from a prior seed run — look it up instead. Supabase
  // returns this as an AuthApiError with structured code "email_exists"
  // (confirmed empirically against the local CLI) — check that first. The
  // message-text regex is kept only as a fallback for older CLI/GoTrue
  // versions that might not set `code`, whose wording has varied
  // ("already registered" / "already exists").
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

  const cap1Id = await ensureUser(supabase.auth.admin, CAP1_EMAIL, PASSWORD);
  const cap2Id = await ensureUser(supabase.auth.admin, CAP2_EMAIL, PASSWORD);

  // Single-concurrent-seeder assumption: this cleanup (read prior drafts,
  // delete their bids/lots, delete the draft, insert a new one) is several
  // separate statements, not one transaction — two seeders racing on the
  // same DRAFT_NAME could interleave and leave things in a bad state. Only
  // one seeder may run at a time. For the test suite this is enforced by
  // `workers: 1` / `fullyParallel: false` in playwright.config.ts; don't
  // also run `npx tsx e2e/seed.ts` by hand while `npm run e2e` is running.
  //
  // Reset any prior e2e draft. `drafts -> teams/players/lots` all cascade on
  // delete, and `lots -> bids` cascades too — but `bids.team_id` has NO
  // cascade (plain FK, confirmed against the schema), so once any bid has
  // ever been placed in a prior run, deleting the draft straight away trips
  // "update or delete on table teams violates foreign key constraint
  // bids_team_id_fkey" when the teams cascade fires. Delete bids/lots
  // ourselves first (via their draft_id) so the later drafts delete has
  // nothing left dangling. The auth-trigger-created profiles for cap1/cap2
  // are untouched either way (profiles has no FK to drafts), so re-running
  // this script is safe and idempotent.
  const { data: priorDrafts, error: priorErr } = await supabase
    .from("drafts")
    .select("id")
    .eq("name", DRAFT_NAME);
  if (priorErr) throw priorErr;
  for (const { id: priorId } of priorDrafts ?? []) {
    const { data: priorLots, error: priorLotsErr } = await supabase
      .from("lots")
      .select("id")
      .eq("draft_id", priorId);
    if (priorLotsErr) throw priorLotsErr;
    const lotIds = (priorLots ?? []).map((l) => l.id);
    if (lotIds.length) {
      const { error: bidsDelErr } = await supabase.from("bids").delete().in("lot_id", lotIds);
      if (bidsDelErr) throw bidsDelErr;
    }
    const { error: lotsDelErr } = await supabase.from("lots").delete().eq("draft_id", priorId);
    if (lotsDelErr) throw lotsDelErr;
  }
  const { error: delErr } = await supabase.from("drafts").delete().eq("name", DRAFT_NAME);
  if (delErr) throw delErr;

  const { data: draft, error: draftErr } = await supabase
    .from("drafts")
    .insert({ name: DRAFT_NAME, countdown_seconds: COUNTDOWN_SECONDS, round_minimums: [10, 5, 1] })
    .select()
    .single();
  if (draftErr) throw draftErr;
  const draftId = draft.id as string;

  const teamsInput = [
    { name: "E2E Alpha", abbreviation: "EA", captain_profile_id: cap1Id, nomination_position: 1, budget_start: 100 },
    { name: "E2E Bravo", abbreviation: "EB", captain_profile_id: cap2Id, nomination_position: 2, budget_start: 90 },
  ];
  const { data: teams, error: teamsErr } = await supabase
    .from("teams")
    .insert(
      teamsInput.map((t) => ({
        draft_id: draftId,
        name: t.name,
        abbreviation: t.abbreviation,
        captain_profile_id: t.captain_profile_id,
        nomination_position: t.nomination_position,
        budget_start: t.budget_start,
        points_remaining: t.budget_start,
      }))
    )
    .select();
  if (teamsErr) throw teamsErr;
  const teamByPosition = (pos: number) => teams!.find((t) => t.nomination_position === pos)!;

  // Pre-fill top + jungle for each team, so open_roles() = {mid, adc, support}
  // (exactly the 3 roles start_draft's setup check requires).
  const prefillRows = teams!.flatMap((t) => [
    { draft_id: draftId, display_name: `${t.name} Top`, role: "top", team_id: t.id, price: 0, acquisition: "captain" },
    { draft_id: draftId, display_name: `${t.name} Jungle`, role: "jungle", team_id: t.id, price: 0, acquisition: "free_agency" },
  ]);
  const { error: prefillErr } = await supabase.from("players").insert(prefillRows);
  if (prefillErr) throw prefillErr;

  // Pool: 3 mid / 3 adc / 3 support, unowned.
  const poolRoles = ["mid", "adc", "support"] as const;
  const poolRows = poolRoles.flatMap((role) =>
    [1, 2, 3].map((n) => ({
      draft_id: draftId,
      display_name: `${role[0].toUpperCase()}${role.slice(1)}${n}`,
      role,
    }))
  );
  const { error: poolErr } = await supabase.from("players").insert(poolRows);
  if (poolErr) throw poolErr;

  // Go live, nominator = team 1 (E2E Alpha) — same effect as tests.go_live().
  const { error: liveErr } = await supabase
    .from("drafts")
    .update({ status: "live", current_round: 1, current_nominator_team_id: teamByPosition(1).id })
    .eq("id", draftId);
  if (liveErr) throw liveErr;

  writeFileSync("e2e/.draft-id", draftId, "utf8");
  console.log(`Seeded "${DRAFT_NAME}" -> ${draftId}`);
  console.log(`  cap1: ${CAP1_EMAIL} (${cap1Id}) -> ${teamByPosition(1).name}`);
  console.log(`  cap2: ${CAP2_EMAIL} (${cap2Id}) -> ${teamByPosition(2).name}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
