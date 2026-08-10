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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
