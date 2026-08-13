/**
 * scripts/betting-fixture.ts — shared "betting fixture" builder: two teams,
 * one event, one OPEN rake-0 market, a member + admin dev-login user each
 * linked to a fake Discord identity, and a third wallet holding a
 * pre-existing losing bet.
 *
 * Used by two callers:
 *   - scripts/seed-demo.ts, folded into the full 12-team demo-draft seed.
 *   - e2e/seed-betting.ts, betting.spec.ts's own self-seed (mirrors
 *     e2e/seed.ts's pattern for draft.spec.ts) — deliberately betting-only
 *     so the e2e doesn't need to drag in the whole demo draft.
 *
 * One OPEN market with a single pre-existing losing bet, so the e2e's own
 * 100-stake bet on the other team has something to win against — pari-mutuel
 * payout math needs at least one loser in the pool (see place_bet/
 * _resolve_market in 20260813000003_betting_market_rpcs.sql: a winning pool
 * with an empty losing pool just refunds everyone, no interesting payout).
 * rake_bps = 0 for exact, easy-to-assert numbers:
 *   member stakes 100 on Team A, loser has already staked 500 on Team B ->
 *   resolving for Team A pays the member 100 + (100 * 500) / 100 = 600
 *   (stake back + 100% of the losing pool, pro-rata over a solo winner).
 */
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const BETTING_PASSWORD = "password123";
export const BETTING_MEMBER_EMAIL = "e2e-betting-member@test.local";
export const BETTING_ADMIN_EMAIL = "e2e-betting-admin@test.local";

const BETTING_EVENT_NAME = "E2E Betting Night";
const BETTING_TEAM_A = { name: "Betting FC", short_code: "BFC", color: "#f5b62e" };
const BETTING_TEAM_B = { name: "Wager United", short_code: "WUN", color: "#4c9be8" };
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
 * same local-only assumption as the callers' `npx supabase status`
 * shell-outs). Used only to reach `auth.identities`, a table
 * PostgREST/supabase-js never exposes (it's not under `public`), so there's
 * no supabase-js call that can do this insert for us. Values interpolated
 * into `sql` here are always our own fixed constants/uuids, never user
 * input. */
function runSql(sql: string): void {
  const file = join(tmpdir(), `betting-fixture-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
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
 * re-running this idempotent (the auth user itself is reused via
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
// callers each use the `supabase` closure variable directly within their own
// scope, so `any` is the pragmatic way for this shared function to accept
// "whatever the caller's supabase client is" without re-deriving its exact
// generic instantiation.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function seedBettingFixture(supabase: any, memberUserId: string, adminUserId: string): Promise<void> {
  linkDiscordIdentity(memberUserId, BETTING_MEMBER_DISCORD_ID);
  linkDiscordIdentity(adminUserId, BETTING_ADMIN_DISCORD_ID);

  // requireBettingStaff()'s Discord-staff-role check will fail locally (no
  // DISCORD_STAFF_ROLE_ID / real guild membership) — its is_admin fallback
  // is what actually authorizes the seeded admin for /admin/betting.
  const { error: adminFlagErr } = await supabase.from("profiles").update({ is_admin: true }).eq("id", adminUserId);
  if (adminFlagErr) throw adminFlagErr;

  // Idempotent re-seed: bets/ledger -> markets -> teams/event -> profiles
  // (children before parents — betting_bets/betting_ledger/
  // betting_markets.created_by all FK onto betting_profiles.discord_id with
  // no cascade).
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
  console.log(`  member: ${BETTING_MEMBER_EMAIL} / ${BETTING_PASSWORD} (discord ${BETTING_MEMBER_DISCORD_ID})`);
  console.log(`  admin:  ${BETTING_ADMIN_EMAIL} / ${BETTING_PASSWORD} (discord ${BETTING_ADMIN_DISCORD_ID}, is_admin)`);
}
