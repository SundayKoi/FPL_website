import { createClient } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";
import { getLocalTestSupabase } from "./local-supabase";
import {
  ACCESS_ADMIN_EMAIL,
  ACCESS_MEMBER_EMAIL,
  CONTRACT_PASSWORD,
  ISOLATION_CAPTAIN_EMAIL,
  MATCH_DRAFT_BLUE_EMAIL,
  MATCH_DRAFT_RED_EMAIL,
  MATCH_DRAFT_SPECTATOR_EMAIL,
} from "./contract-fixtures";

// Fixture setup is confined to the isolated local stack by getLocalTestSupabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = ReturnType<typeof createClient<any>>;

async function ensureUser(service: ServiceClient, email: string, isAdmin = false): Promise<string> {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: CONTRACT_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: email.split("@")[0] },
  });
  let id = data?.user?.id;
  if (error) {
    const code = (error as { code?: string }).code ?? "";
    if (code !== "email_exists" && !/already registered|already exists/i.test(error.message)) throw error;
    for (let page = 1; ; page += 1) {
      const { data: users, error: listError } = await service.auth.admin.listUsers({ page, perPage: 200 });
      if (listError) throw listError;
      const found = users.users.find((user) => user.email === email);
      if (found) { id = found.id; break; }
      if (users.users.length < 200) break;
    }
  }
  if (!id) throw new Error(`Could not create or find ${email}.`);
  const { error: profileError } = await service.from("profiles").update({ is_admin: isAdmin, is_owner: isAdmin }).eq("id", id);
  if (profileError) throw profileError;
  return id;
}

async function createFixture(service: ServiceClient, input: {
  stage?: string;
  season: string;
  teamA: string;
  teamB: string;
}): Promise<string> {
  const { data, error } = await service.from("fixtures").insert({
    stage: input.stage ?? "finals",
    division: null,
    team_a: input.teamA,
    team_b: input.teamB,
    best_of: 1,
    season: input.season,
    // The disposable database is shared by the journey groups. Playoff
    // fixtures have a unique (season, stage, sort_order) slot, so each
    // independently seeded journey needs its own slot even when it exercises
    // the same season.
    sort_order: randomInt(1, 2_147_483_647),
  }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

async function createTeams(service: ServiceClient, entries: Array<{ name: string; abbreviation: string }>) {
  const { data, error } = await service.from("league_teams").insert(entries).select("id,name");
  if (error) throw error;
  return new Map((data as Array<{ id: string; name: string }>).map((row) => [row.name, row.id]));
}

async function createCode(service: ServiceClient, fixtureId: string, season: string, teamAId: string, teamBId: string, code: string) {
  const { error } = await service.from("match_codes").insert({
    fixture_id: fixtureId,
    season,
    team_a_id: teamAId,
    team_b_id: teamBId,
    game_number: 1,
    code,
  });
  if (error) throw error;
}

async function seedAccess(service: ServiceClient) {
  const memberId = await ensureUser(service, ACCESS_MEMBER_EMAIL);
  const adminId = await ensureUser(service, ACCESS_ADMIN_EMAIL, true);
  const teams = await createTeams(service, [
    { name: "Access Premier Alpha", abbreviation: "APA" },
    { name: "Access Premier Beta", abbreviation: "APB" },
  ]);
  const fixtureId = await createFixture(service, { season: "S5", teamA: "Access Premier Alpha", teamB: "Access Premier Beta" });
  await createCode(service, fixtureId, "S5", teams.get("Access Premier Alpha")!, teams.get("Access Premier Beta")!, "ACCESS-PRIVATE-CODE");
  const { error } = await service.from("league_settings").update({ homepage_mode: "auto" }).eq("id", 1);
  if (error) throw error;
  console.log(`FPL_TEST_FIXTURE_ID=${fixtureId}`);
  console.log(`FPL_TEST_MEMBER_PROFILE_ID=${memberId}`);
  console.log(`FPL_TEST_ADMIN_PROFILE_ID=${adminId}`);
}

async function seedIsolation(service: ServiceClient) {
  const captainId = await ensureUser(service, ISOLATION_CAPTAIN_EMAIL);
  const teams = await createTeams(service, [
    { name: "Premier Isolation Alpha", abbreviation: "PIA" },
    { name: "Premier Isolation Beta", abbreviation: "PIB" },
    { name: "Academy Isolation Alpha", abbreviation: "AIA" },
    { name: "Academy Isolation Beta", abbreviation: "AIB" },
    { name: "History Isolation Alpha", abbreviation: "HIA" },
    { name: "History Isolation Beta", abbreviation: "HIB" },
  ]);
  const premier = await createFixture(service, { season: "S5", teamA: "Premier Isolation Alpha", teamB: "Premier Isolation Beta" });
  const academy = await createFixture(service, { season: "A1", teamA: "Academy Isolation Alpha", teamB: "Academy Isolation Beta" });
  const historical = await createFixture(service, { season: "S4", teamA: "History Isolation Alpha", teamB: "History Isolation Beta" });
  const memberships = [
    { league_team_id: teams.get("Premier Isolation Alpha"), season: "S5", profile_id: captainId },
  ];
  const { error: captainError } = await service.from("league_team_captains").insert(memberships);
  if (captainError) throw captainError;
  await createCode(service, premier, "S5", teams.get("Premier Isolation Alpha")!, teams.get("Premier Isolation Beta")!, "PREMIER-S5-ONLY");
  await createCode(service, academy, "A1", teams.get("Academy Isolation Alpha")!, teams.get("Academy Isolation Beta")!, "ACADEMY-A1-PRIVATE");
  await createCode(service, historical, "S4", teams.get("History Isolation Alpha")!, teams.get("History Isolation Beta")!, "HISTORY-S4-PRIVATE");
  const { error: draftError } = await service.from("match_drafts").insert([
    { fixture_id: premier, game_number: 1, layout: "stage", blue_team_name: "Premier Isolation Alpha", red_team_name: "Premier Isolation Beta" },
    { fixture_id: academy, game_number: 1, layout: "stage", blue_team_name: "Academy Isolation Alpha", red_team_name: "Academy Isolation Beta" },
    { fixture_id: historical, game_number: 1, layout: "stage", blue_team_name: "History Isolation Alpha", red_team_name: "History Isolation Beta" },
  ]);
  if (draftError) throw draftError;
  console.log(`FPL_TEST_FIXTURE_ID=${premier}`);
  console.log(`FPL_TEST_ACADEMY_FIXTURE_ID=${academy}`);
  console.log(`FPL_TEST_HISTORICAL_FIXTURE_ID=${historical}`);
  console.log(`FPL_TEST_CAPTAIN_A_PROFILE_ID=${captainId}`);
}

async function seedMatchDraft(service: ServiceClient) {
  const blueId = await ensureUser(service, MATCH_DRAFT_BLUE_EMAIL);
  const redId = await ensureUser(service, MATCH_DRAFT_RED_EMAIL);
  const spectatorId = await ensureUser(service, MATCH_DRAFT_SPECTATOR_EMAIL);
  const teams = await createTeams(service, [
    { name: "Draft Blue", abbreviation: "DBL" },
    { name: "Draft Red", abbreviation: "DRD" },
  ]);
  const fixtureId = await createFixture(service, { season: "S5", teamA: "Draft Blue", teamB: "Draft Red" });
  const { error: captainError } = await service.from("league_team_captains").insert([
    { league_team_id: teams.get("Draft Blue"), season: "S5", profile_id: blueId },
    { league_team_id: teams.get("Draft Red"), season: "S5", profile_id: redId },
  ]);
  if (captainError) throw captainError;
  await createCode(service, fixtureId, "S5", teams.get("Draft Blue")!, teams.get("Draft Red")!, "CAPTAINS-ONLY-CODE");
  const { error: settingsError } = await service.from("match_draft_settings").insert({ fixture_id: fixtureId, best_of: 1, fearless: false });
  if (settingsError) throw settingsError;
  const now = Date.now();
  const { error: draftError } = await service.from("match_drafts").insert({
    fixture_id: fixtureId,
    game_number: 1,
    status: "drafting",
    layout: "board",
    current_step_index: 0,
    turn_started_at: new Date(now).toISOString(),
    turn_deadline_at: new Date(now + 600_000).toISOString(),
    turn_allowance_seconds: 600,
    blue_team_name: "Draft Blue",
    red_team_name: "Draft Red",
    blue_ready: true,
    red_ready: true,
    actions: [],
  });
  if (draftError) throw draftError;
  console.log(`FPL_TEST_FIXTURE_ID=${fixtureId}`);
  console.log(`FPL_TEST_CAPTAIN_A_PROFILE_ID=${blueId}`);
  console.log(`FPL_TEST_CAPTAIN_B_PROFILE_ID=${redId}`);
  console.log(`FPL_TEST_SPECTATOR_PROFILE_ID=${spectatorId}`);
}

async function main() {
  const scenario = process.argv[2];
  if (!new Set(["access", "isolation", "match-draft"]).has(scenario ?? "")) throw new Error("Expected access, isolation, or match-draft seed mode.");
  const { url, serviceRoleKey } = getLocalTestSupabase();
  // The app does not generate Supabase database types, so seed table access is dynamic.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createClient<any>(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  if (scenario === "access") await seedAccess(service);
  else if (scenario === "isolation") await seedIsolation(service);
  else await seedMatchDraft(service);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
