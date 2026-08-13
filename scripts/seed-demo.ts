/**
 * scripts/seed-demo.ts — builds a full-size 12-team demo draft locally.
 *
 * Creates "Demo Draft (12 Teams)": 12 teams with varied budgets, 12 real
 * captain logins (so any turn can be played out from /login), pre-filled
 * top+jungle per team, and a pool of 14 mid / 14 adc / 14 support. Sets the
 * draft live with team 1 on the clock and makes e2e-cap1 an admin.
 *
 * Idempotent: deletes any prior draft of the same name first (same cleanup
 * ordering as e2e/seed.ts — bids, then lots, then the draft; single
 * concurrent seeder only).
 *
 * Run with: npm run seed:demo   (local Supabase must be running)
 *
 * Logins (password for all: password123):
 *   team 1  e2e-cap1@test.local   (also site admin)
 *   team 2  e2e-cap2@test.local
 *   teams 3-12  demo-cap3@test.local … demo-cap12@test.local
 */
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const DRAFT_NAME = "Demo Draft (12 Teams)";
const PASSWORD = "password123";
const COUNTDOWN_SECONDS = 15;

// Each team pre-fills two roles (captain + free-agency signing). The pairs are
// varied so different captains need different roles — lets every point of view
// be demoed (a team hunting top/jungle, a team hunting mid, etc.).
const TEAMS: { name: string; abbreviation: string; email: string; budget: number; capRole: string; faRole: string }[] = [
  { name: "Lion Guard", abbreviation: "LG", email: "e2e-cap1@test.local", budget: 100, capRole: "top", faRole: "jungle" },
  { name: "Crest Kings", abbreviation: "CK", email: "e2e-cap2@test.local", budget: 100, capRole: "mid", faRole: "support" },
  { name: "Navy Nexus", abbreviation: "NN", email: "demo-cap3@test.local", budget: 95, capRole: "adc", faRole: "top" },
  { name: "Baron Barons", abbreviation: "BB", email: "demo-cap4@test.local", budget: 95, capRole: "jungle", faRole: "mid" },
  { name: "Gold Fang", abbreviation: "GF", email: "demo-cap5@test.local", budget: 90, capRole: "support", faRole: "adc" },
  { name: "Steel Sentinels", abbreviation: "SS", email: "demo-cap6@test.local", budget: 90, capRole: "top", faRole: "mid" },
  { name: "Dragon Soul", abbreviation: "DS", email: "demo-cap7@test.local", budget: 85, capRole: "jungle", faRole: "adc" },
  { name: "Rift Runners", abbreviation: "RR", email: "demo-cap8@test.local", budget: 85, capRole: "mid", faRole: "adc" },
  { name: "Crown Chasers", abbreviation: "CC", email: "demo-cap9@test.local", budget: 80, capRole: "support", faRole: "top" },
  { name: "Void Vanguard", abbreviation: "VV", email: "demo-cap10@test.local", budget: 80, capRole: "jungle", faRole: "support" },
  { name: "Herald Hunters", abbreviation: "HH", email: "demo-cap11@test.local", budget: 75, capRole: "adc", faRole: "support" },
  { name: "Flash Wolves FPL", abbreviation: "FWF", email: "demo-cap12@test.local", budget: 75, capRole: "top", faRole: "jungle" },
];

const POOL_NAMES: Record<string, string[]> = {
  top: ["Teemo Terror", "Darius Dunk", "Garen Spin2Win", "Fiora Flair", "Malphite Rock", "Camille Clip", "Jax Bamboo", "Kled Rider", "Ornn Forge", "SionInting"],
  jungle: ["Lee Sin Blind", "Elise Spider", "Kha'Zix Bug", "Graves Cigar", "Sejuani Boar", "Viego Ruined", "Hecarim Horse", "Amumu Sadge", "Nidalee Spear", "Kindred Lamb"],
  mid: ["Azir Enjoyer", "Roam King", "CtrlMage", "OriannaMain", "Faker Jr", "MidDiff", "Syndra Sam", "Zed4Life", "TF Blade Runner", "Ryze Above", "Cassio Pete", "Viktor Frost", "Ahri Trainer", "LeBlancDX"],
  adc: ["Kai'Sa Carry", "DravenTax", "Jinxed", "CritChance", "Ez Real One", "Ashe Archer", "TwitchPrime", "Sivir Server", "MFortune", "Xayah Ray", "Caitlyn Cupcake", "VayneTrain", "Lucian Locke", "KogMawler"],
  support: ["Ward Bot", "Thresh Prince", "Lulu Whimsy", "Leona Solar", "Pyke Hook", "Soraka Heals", "Nami Tide", "Braum Shield", "Janna Breeze", "BlitzGrab", "Rell Charge", "Alistar Combo", "Bard Chimes", "Renata Deal"],
};

function cap(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}

// === Betting fixture (Task 14: e2e coverage) =================================
// One OPEN market with a single pre-existing losing bet, so the e2e's own
// 100-stake bet on the other team has something to win against — pari-mutuel
// payout math needs at least one loser in the pool (see place_bet/
// _resolve_market in 20260813000003_betting_market_rpcs.sql: a winning pool
// with an empty losing pool just refunds everyone, no interesting payout).
// rake_bps = 0 for exact, easy-to-assert numbers:
//   member stakes 100 on Team A, loser has already staked 500 on Team B ->
//   resolving for Team A pays the member 100 + (100 * 500) / 100 = 600
//   (stake back + 100% of the losing pool, pro-rata over a solo winner).
const BETTING_EVENT_NAME = "E2E Betting Night";
const BETTING_TEAM_A = { name: "Betting FC", short_code: "BFC", color: "#f5b62e" };
const BETTING_TEAM_B = { name: "Wager United", short_code: "WUN", color: "#4c9be8" };
const BETTING_MEMBER_EMAIL = "e2e-betting-member@test.local";
const BETTING_ADMIN_EMAIL = "e2e-betting-admin@test.local";
// Fixed, fake Discord ids (dev-login users never actually authenticate with
// Discord) — see linkDiscordIdentity() below for why these need a real row
// in auth.identities rather than just a betting_profiles wallet.
const BETTING_MEMBER_DISCORD_ID = "9000000000000001";
const BETTING_ADMIN_DISCORD_ID = "9000000000000002";
const BETTING_LOSER_DISCORD_ID = "9000000000000003";
const BETTING_SIGNUP_BONUS = 1000;
const BETTING_LOSER_BET_AMOUNT = 500;

/** Runs a SQL statement against the local Postgres instance directly (via
 * the Supabase CLI, which already resolves the local connection for us —
 * same local-only assumption as resolveConfig()'s `npx supabase status`
 * shell-out above). Used only to reach `auth.identities`, a table
 * PostgREST/supabase-js never exposes (it's not under `public`), so there's
 * no supabase-js call that can do this insert for us. Values interpolated
 * into `sql` here are always our own fixed constants/uuids, never user
 * input. */
function runSql(sql: string): void {
  const file = join(tmpdir(), `seed-demo-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  writeFileSync(file, sql, "utf8");
  try {
    execSync(`npx supabase db query --local --file "${file}"`, { stdio: "inherit" });
  } finally {
    unlinkSync(file);
  }
}

/**
 * Links a fake Discord identity to a dev-login (email/password) auth user,
 * by inserting straight into `auth.identities`. Needed because both
 * `getBettingUser()` (lib/betting/wallet.ts) and `requireBettingStaff()`
 * (lib/betting/access.ts) require `user.identities` to contain a `discord`
 * entry before they'll do anything — real Discord OAuth is what normally
 * creates that row, which a scripted dev-login user never goes through. The
 * identity's `id` (as `supabase-js` surfaces it) comes from `identity_data.sub`
 * on this schema version, not the row's own uuid — confirmed empirically
 * against the local GoTrue instance — so `sub` is set to the Discord id we
 * want `discordIdentity.id` to resolve to. `on conflict do nothing` keeps
 * re-running this script idempotent (the auth user itself is reused via
 * ensureUser, same discord_id every run).
 */
function linkDiscordIdentity(userId: string, discordId: string): void {
  runSql(`
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), '${userId}', '${discordId}', jsonb_build_object('sub','${discordId}'), 'discord', now(), now(), now())
on conflict (provider_id, provider) do nothing;
`);
}

// createClient()'s return type resolves differently depending on whether
// call-site generics are supplied, which fights a named parameter type here;
// every other function in this file sidesteps that by using the `supabase`
// closure variable directly instead of threading it through a typed
// parameter, but this one is long enough to warrant a top-level function, so
// `any` is the pragmatic way to accept "whatever main()'s supabase client
// is" without re-deriving its exact generic instantiation.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedBettingFixture(supabase: any, memberUserId: string, adminUserId: string): Promise<void> {
  linkDiscordIdentity(memberUserId, BETTING_MEMBER_DISCORD_ID);
  linkDiscordIdentity(adminUserId, BETTING_ADMIN_DISCORD_ID);

  // requireBettingStaff()'s Discord-staff-role check will fail locally (no
  // DISCORD_STAFF_ROLE_ID / real guild membership) — its is_admin fallback
  // is what actually authorizes the seeded admin for /admin/betting.
  const { error: adminFlagErr } = await supabase.from("profiles").update({ is_admin: true }).eq("id", adminUserId);
  if (adminFlagErr) throw adminFlagErr;

  // Idempotent re-seed: bets/ledger -> markets -> teams/event -> profiles
  // (children before parents, same ordering discipline as the demo draft
  // cleanup above — betting_bets/betting_ledger/betting_markets.created_by
  // all FK onto betting_profiles.discord_id with no cascade).
  const fixtureDiscordIds = [BETTING_MEMBER_DISCORD_ID, BETTING_ADMIN_DISCORD_ID, BETTING_LOSER_DISCORD_ID];
  const { data: priorEvents, error: priorEventsErr } = await supabase
    .from("betting_events").select("id").eq("name", BETTING_EVENT_NAME);
  if (priorEventsErr) throw priorEventsErr;
  const priorEventIds = ((priorEvents ?? []) as { id: number }[]).map((e) => e.id);
  if (priorEventIds.length) {
    const { data: priorMarkets, error: priorMarketsErr } = await supabase
      .from("betting_markets").select("id").in("event_id", priorEventIds);
    if (priorMarketsErr) throw priorMarketsErr;
    const priorMarketIds = ((priorMarkets ?? []) as { id: number }[]).map((m) => m.id);
    if (priorMarketIds.length) {
      const { error } = await supabase.from("betting_bets").delete().in("market_id", priorMarketIds);
      if (error) throw error;
    }
    const { error: marketsDelErr } = await supabase.from("betting_markets").delete().in("event_id", priorEventIds);
    if (marketsDelErr) throw marketsDelErr;
  }
  // Defensive: any bets/ledger rows still tied to our fixture discord ids
  // (e.g. from a differently-shaped prior run).
  { const { error } = await supabase.from("betting_bets").delete().in("discord_id", fixtureDiscordIds); if (error) throw error; }
  { const { error } = await supabase.from("betting_ledger").delete().in("discord_id", fixtureDiscordIds); if (error) throw error; }
  // create_market_admin/resolve_market_admin both write betting_admin_audit
  // rows keyed on `actor` (our seeded admin's discord id) with no cascade —
  // clear those too, or the betting_profiles delete below 404s on the FK.
  { const { error } = await supabase.from("betting_admin_audit").delete().in("actor", fixtureDiscordIds); if (error) throw error; }
  { const { error } = await supabase.from("betting_events").delete().eq("name", BETTING_EVENT_NAME); if (error) throw error; }
  {
    const { error } = await supabase
      .from("betting_teams").delete().in("short_code", [BETTING_TEAM_A.short_code, BETTING_TEAM_B.short_code]);
    if (error) throw error;
  }
  { const { error } = await supabase.from("betting_profiles").delete().in("discord_id", fixtureDiscordIds); if (error) throw error; }

  const { data: teams, error: teamsErr } = await supabase
    .from("betting_teams")
    .insert([
      { name: BETTING_TEAM_A.name, short_code: BETTING_TEAM_A.short_code, color: BETTING_TEAM_A.color },
      { name: BETTING_TEAM_B.name, short_code: BETTING_TEAM_B.short_code, color: BETTING_TEAM_B.color },
    ])
    .select();
  if (teamsErr) throw teamsErr;
  const teamRows = teams as { id: number; short_code: string }[];
  const teamA = teamRows.find((t) => t.short_code === BETTING_TEAM_A.short_code)!;
  const teamB = teamRows.find((t) => t.short_code === BETTING_TEAM_B.short_code)!;

  const { data: event, error: eventErr } = await supabase
    .from("betting_events").insert({ name: BETTING_EVENT_NAME }).select().single();
  if (eventErr) throw eventErr;

  // Wallets before the market: create_market_admin stamps created_by = p_actor,
  // which FKs onto betting_profiles(discord_id) — the admin's wallet has to
  // exist first, or the insert fails (betting_markets_created_by_fkey).
  const wallets: [string, string, string | null][] = [
    [BETTING_MEMBER_DISCORD_ID, "E2E Betting Member", memberUserId],
    [BETTING_ADMIN_DISCORD_ID, "E2E Betting Admin", adminUserId],
    [BETTING_LOSER_DISCORD_ID, "E2E Betting Loser", null],
  ];
  for (const [discordId, username, profileId] of wallets) {
    const { error } = await supabase.rpc("grant_signup_bonus", {
      p_user: discordId,
      p_username: username,
      p_avatar: null,
      p_amount: BETTING_SIGNUP_BONUS,
      p_profile_id: profileId,
    });
    if (error) throw error;
  }

  // ~2h out, so lock_at (game_at - 5min) stays comfortably in the future for
  // the whole e2e run.
  const gameAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const { data: marketId, error: marketErr } = await supabase.rpc("create_market_admin", {
    p_actor: BETTING_ADMIN_DISCORD_ID,
    p_event: (event as { id: number }).id,
    p_team_a: teamA.id,
    p_team_b: teamB.id,
    p_title: `${BETTING_TEAM_A.name} vs ${BETTING_TEAM_B.name}`,
    p_rules: null,
    p_game_at: gameAt,
    p_rake_bps: 0,
    p_open_line_prob_a: null,
    p_draw_enabled: false,
  });
  if (marketErr) throw marketErr;

  // Pre-existing losing bet on Team B, so the e2e's own 100-on-Team-A bet
  // (placed later, through the UI) has a real pool to win.
  const { error: loserBetErr } = await supabase.rpc("place_bet", {
    p_user: BETTING_LOSER_DISCORD_ID,
    p_market: marketId,
    p_team: teamB.id,
    p_amount: BETTING_LOSER_BET_AMOUNT,
  });
  if (loserBetErr) throw loserBetErr;

  console.log(`Seeded betting fixture: market ${marketId} (${BETTING_TEAM_A.name} vs ${BETTING_TEAM_B.name})`);
  console.log(`  member: ${BETTING_MEMBER_EMAIL} / ${PASSWORD} (discord ${BETTING_MEMBER_DISCORD_ID})`);
  console.log(`  admin:  ${BETTING_ADMIN_EMAIL} / ${PASSWORD} (discord ${BETTING_ADMIN_DISCORD_ID}, is_admin)`);
}

function resolveConfig(): { url: string; serviceKey: string } {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const envKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (envUrl && envKey) return { url: envUrl, serviceKey: envKey };
  const status = JSON.parse(execSync("npx supabase status -o json", { encoding: "utf8" }));
  const url = envUrl ?? status.API_URL;
  const serviceKey = envKey ?? status.SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Could not resolve Supabase URL / service key. Is `npx supabase start` running?");
  }
  return { url, serviceKey };
}

async function ensureUser(
  admin: ReturnType<typeof createClient>["auth"]["admin"],
  email: string
): Promise<string> {
  const { data, error } = await admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (!error) return data.user.id;
  const code = (error as { code?: string }).code ?? "";
  const msg = error.message ?? String(error);
  if (!(code === "email_exists" || /already registered|already exists/i.test(msg))) throw error;
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

  const captainIds: string[] = [];
  for (const t of TEAMS) captainIds.push(await ensureUser(supabase.auth.admin, t.email));

  // e2e-cap1 doubles as the site admin for the demo.
  const { error: adminErr } = await supabase
    .from("profiles").update({ is_admin: true }).eq("id", captainIds[0]);
  if (adminErr) throw adminErr;

  // Cleanup prior demo draft (bids -> lots -> draft; see e2e/seed.ts for why).
  const { data: priorDrafts, error: priorErr } = await supabase
    .from("drafts").select("id").eq("name", DRAFT_NAME);
  if (priorErr) throw priorErr;
  for (const { id: priorId } of priorDrafts ?? []) {
    const { data: priorLots } = await supabase.from("lots").select("id").eq("draft_id", priorId);
    const lotIds = (priorLots ?? []).map((l) => l.id);
    if (lotIds.length) {
      const { error } = await supabase.from("bids").delete().in("lot_id", lotIds);
      if (error) throw error;
    }
    const { error: lotsErr } = await supabase.from("lots").delete().eq("draft_id", priorId);
    if (lotsErr) throw lotsErr;
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

  const { data: teams, error: teamsErr } = await supabase
    .from("teams")
    .insert(
      TEAMS.map((t, i) => ({
        draft_id: draftId,
        name: t.name,
        abbreviation: t.abbreviation,
        captain_profile_id: captainIds[i],
        nomination_position: i + 1,
        budget_start: t.budget,
        points_remaining: t.budget,
      }))
    )
    .select();
  if (teamsErr) throw teamsErr;

  const cfgByPosition = (pos: number) => TEAMS[pos - 1];
  const prefillRows = teams!.flatMap((t) => {
    const cfg = cfgByPosition(t.nomination_position);
    return [
      { draft_id: draftId, display_name: `${t.name} ${cap(cfg.capRole)}`, role: cfg.capRole, team_id: t.id, price: 0, acquisition: "captain" },
      { draft_id: draftId, display_name: `${t.name} ${cap(cfg.faRole)}`, role: cfg.faRole, team_id: t.id, price: 0, acquisition: "free_agency" },
    ];
  });
  const { error: prefillErr } = await supabase.from("players").insert(prefillRows);
  if (prefillErr) throw prefillErr;

  const poolRows = Object.entries(POOL_NAMES).flatMap(([role, names]) =>
    names.map((display_name) => ({ draft_id: draftId, display_name, role }))
  );
  const { error: poolErr } = await supabase.from("players").insert(poolRows);
  if (poolErr) throw poolErr;

  const team1 = teams!.find((t) => t.nomination_position === 1)!;
  const { error: liveErr } = await supabase
    .from("drafts")
    .update({ status: "live", current_round: 1, current_nominator_team_id: team1.id })
    .eq("id", draftId);
  if (liveErr) throw liveErr;

  console.log(`Seeded "${DRAFT_NAME}" -> ${draftId}`);
  console.log(`Password for every captain: ${PASSWORD}`);
  const ALL_ROLES = ["top", "jungle", "mid", "adc", "support"];
  TEAMS.forEach((t, i) => {
    const needs = ALL_ROLES.filter((r) => r !== t.capRole && r !== t.faRole).join("/");
    console.log(`  pos ${String(i + 1).padStart(2)}  ${t.name.padEnd(17)} ${t.email.padEnd(23)} needs ${needs}${i === 0 ? "  (admin)" : ""}`);
  });

  const bettingMemberId = await ensureUser(supabase.auth.admin, BETTING_MEMBER_EMAIL);
  const bettingAdminId = await ensureUser(supabase.auth.admin, BETTING_ADMIN_EMAIL);
  await seedBettingFixture(supabase, bettingMemberId, bettingAdminId);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
