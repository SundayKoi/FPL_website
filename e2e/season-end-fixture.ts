import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getLocalTestSupabase, runLocalTestSql } from "./local-supabase";
import { sampleCard } from "../src/lib/cards/samples";
import {
  catalogHash,
  releaseRevisionDigest,
  seasonEndDesignId,
  type AccoladeCollectible,
  type BestOfCollectible,
  type SeasonCollectible,
  type SeasonEndCatalog,
  type SeasonEndCollectible,
} from "../src/lib/season-end/collectibles";
import {
  SEASON_END_ECONOMY,
  SEASON_END_RELEASE_RULES,
  SEASON_END_RULES_VERSION,
} from "../src/lib/season-end/release";

export const SEASON_END_PASSWORD = "password123";
export const SEASON_END_MEMBER_EMAIL = "e2e-season-end-member@test.local";
export const SEASON_END_PARTNER_EMAIL = "e2e-season-end-partner@test.local";
export const SEASON_END_MEMBER_DISCORD_ID = "9000000000000011";
export const SEASON_END_PARTNER_DISCORD_ID = "9000000000000012";

// Supabase's untyped service-role client is intentional for a local fixture;
// the generated Database type does not include auth-admin or fixture-only rows.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseService = ReturnType<typeof createClient<any>>;

function runSql(sql: string): void {
  runLocalTestSql(sql);
}

async function ensureUser(admin: SupabaseService["auth"]["admin"], email: string): Promise<string> {
  const { data, error } = await admin.createUser({ email, password: SEASON_END_PASSWORD, email_confirm: true });
  if (!error) return data.user.id;
  for (let page = 1; ; page += 1) {
    const { data: list, error: listError } = await admin.listUsers({ page, perPage: 200 });
    if (listError) throw listError;
    const found = list.users.find((user) => user.email === email);
    if (found) return found.id;
    if (list.users.length < 200) break;
  }
  throw error;
}

function linkDiscordIdentity(userId: string, discordId: string): void {
  runSql(`
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), '${userId}', '${discordId}', jsonb_build_object('sub','${discordId}'), 'discord', now(), now(), now())
on conflict (provider_id, provider) do nothing;
`);
}

async function clearPreviousUsers(service: SupabaseService): Promise<void> {
  const discordIds = [SEASON_END_MEMBER_DISCORD_ID, SEASON_END_PARTNER_DISCORD_ID];
  const { data: openings, error: openingError } = await service
    .from("season_end_openings")
    .select("opening_id")
    .in("discord_id", discordIds);
  if (openingError) throw openingError;
  const openingIds = ((openings ?? []) as Array<{ opening_id: string }>).map((row) => row.opening_id);

  if (openingIds.length) {
    const { data: inventory, error: inventoryError } = await service
      .from("season_end_inventory")
      .select("id")
      .in("opening_id", openingIds);
    if (inventoryError) throw inventoryError;
    const inventoryIds = ((inventory ?? []) as Array<{ id: number }>).map((row) => row.id);
    if (inventoryIds.length) {
      for (const table of ["season_end_provenance", "season_end_listings"] as const) {
        const { error } = await service.from(table).delete().in("inventory_id", inventoryIds);
        if (error) throw error;
      }
      const { error } = await service.from("season_end_inventory").delete().in("id", inventoryIds);
      if (error) throw error;
    }
    const { error } = await service.from("season_end_openings").delete().in("opening_id", openingIds);
    if (error) throw error;
  }

  for (const table of ["season_end_trades", "season_end_wants"] as const) {
    const column = table === "season_end_trades" ? "from_discord" : "discord_id";
    const { error } = await service.from(table).delete().in(column, discordIds);
    if (error) throw error;
    if (table === "season_end_trades") {
      const { error: recipientError } = await service.from(table).delete().in("to_discord", discordIds);
      if (recipientError) throw recipientError;
    }
  }

  const { error: walletError } = await service
    .from("betting_profiles")
    .update({ balance: 5_000 })
    .in("discord_id", discordIds);
  if (walletError) throw walletError;
}

function playerCard(name: string) {
  const card = sampleCard();
  return {
    ...card,
    name,
    tag: "E2E",
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    teamName: "E2E United",
    teamAbbr: "E2E",
    season: "S5",
  };
}

function seasonDesign(releaseId: string, name: string): SeasonCollectible {
  const card = playerCard(name);
  const player = { key: `${name}#E2E`, name, tag: "E2E", slug: card.slug };
  return {
    designId: seasonEndDesignId({ releaseId, league: "premier", season: "S5", kind: "season", awardId: "season-card", subjectId: player.key }),
    releaseId,
    league: "premier",
    season: "S5",
    division: null,
    schemaVersion: 1,
    artwork: { kind: "fallback", label: "Season's End E2E" },
    display: { title: `Card of the Season · ${name}`, subtitle: "Cumulative Season Card", description: "E2E frozen Season Card.", headline: "99 OVR", evidence: "99 games · 99–0 · 100% win rate" },
    evidence: { source: "cumulative-season-card", games: 99 },
    baseSalvage: 20,
    kind: "season",
    player,
    card,
    signatureEligible: true,
    source: { kind: "cumulative-season-card", games: 99 },
  };
}

function bestOfDesign(releaseId: string, index: number, name: string): BestOfCollectible {
  const player = { key: `${name}#E2E`, name, tag: "E2E", slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") };
  return {
    designId: seasonEndDesignId({ releaseId, league: "premier", season: "S5", kind: "best_of", awardId: `e2e-best-of-${index}`, subjectId: `${player.key}:bard` }),
    releaseId,
    league: "premier",
    season: "S5",
    division: null,
    schemaVersion: 1,
    artwork: { kind: "fallback", label: "Season's End E2E" },
    display: { title: `Best Of · ${name}`, subtitle: "Best Of", description: "E2E frozen Best Of card.", headline: "2 wins", evidence: "3 games · Bard" },
    evidence: { awardId: `e2e-best-of-${index}`, winnerValue: 2, games: 3, champion: "Bard", championGames: 3, source: "best-of" },
    baseSalvage: 30,
    kind: "best_of",
    player,
    champion: { id: "bard", name: "Bard", games: 3, wins: 2, winRate: 66.7 },
    signatureEligible: true,
    source: { kind: "best-of-champion", awardId: `e2e-best-of-${index}` },
  };
}

function accoladeDesign(releaseId: string, index: number): AccoladeCollectible {
  const awardId = `e2e-accolade-${index}`;
  return {
    designId: seasonEndDesignId({ releaseId, league: "premier", season: "S5", kind: "accolade", awardId, subjectId: `e2e-team-${index}` }),
    releaseId,
    league: "premier",
    season: "S5",
    division: null,
    schemaVersion: 1,
    artwork: { kind: "team", teamName: "E2E United", logoUrl: null, fallbackLabel: "E2E", bannerColor: null },
    display: { title: `Accolade · E2E United ${index}`, subtitle: "Teamwork", description: "E2E frozen Accolade card.", headline: "2 wins", evidence: "E2E team result" },
    evidence: { awardId, winnerValue: 2, source: "accolade" },
    baseSalvage: 30,
    kind: "accolade",
    subject: { kind: "team", team: { key: `e2e-team-${index}`, name: "E2E United" } },
    signatureEligible: false,
    source: { kind: "season-accolade", awardId, scope: "team" },
  };
}

export async function seedSeasonEndFixture(scenario: "recovery" | "commerce"): Promise<{ releaseId: string; pendingRequestId?: string }> {
  const { url, serviceRoleKey: serviceKey } = getLocalTestSupabase();
  const service = createClient(url, serviceKey, { auth: { persistSession: false } });
  const memberId = await ensureUser(service.auth.admin, SEASON_END_MEMBER_EMAIL);
  const partnerId = await ensureUser(service.auth.admin, SEASON_END_PARTNER_EMAIL);
  linkDiscordIdentity(memberId, SEASON_END_MEMBER_DISCORD_ID);
  linkDiscordIdentity(partnerId, SEASON_END_PARTNER_DISCORD_ID);

  for (const [discordId, profileId, username] of [
    [SEASON_END_MEMBER_DISCORD_ID, memberId, "E2E Season End Member"],
    [SEASON_END_PARTNER_DISCORD_ID, partnerId, "E2E Season End Partner"],
  ] as const) {
    const { error } = await service.rpc("grant_signup_bonus", { p_user: discordId, p_username: username, p_avatar: null, p_amount: 5_000, p_profile_id: profileId });
    if (error) throw error;
  }
  await clearPreviousUsers(service);

  const releaseId = randomUUID();
  // A timestamp keeps reruns ahead of any fixture or developer-created draft
  // without touching another release's immutable rows.
  const catalogVersion = Math.floor(Date.now() / 1_000) + 1 + Math.floor(Math.random() * 1_000);
  const { error: releaseError } = await service.from("season_end_releases").insert({
    id: releaseId,
    league: "premier",
    season: "S5",
    state: "draft",
    paused: false,
    price: 500,
    catalog_hash: "",
    rules_version: SEASON_END_RULES_VERSION,
    catalog_version: catalogVersion,
    withheld_awards: [],
    created_by: SEASON_END_MEMBER_DISCORD_ID,
  });
  if (releaseError) throw releaseError;

  const designs: SeasonEndCollectible[] = [
    seasonDesign(releaseId, "E2E Alpha"),
    seasonDesign(releaseId, "E2E Bravo"),
    bestOfDesign(releaseId, 1, "E2E Alpha"),
    bestOfDesign(releaseId, 2, "E2E Bravo"),
    accoladeDesign(releaseId, 1),
    accoladeDesign(releaseId, 2),
  ].sort((left, right) => left.designId.localeCompare(right.designId));
  const catalog: SeasonEndCatalog = {
    releaseId,
    league: "premier",
    season: "S5",
    schemaVersion: 1,
    rulesVersion: SEASON_END_RULES_VERSION,
    designs,
    withheldAwards: [],
    catalogHash: catalogHash(designs),
    createdAt: new Date().toISOString(),
  };
  const rules = { ...SEASON_END_RELEASE_RULES, signatureChance: 0 };
  const calibration = {
    referencePackProbability: 0,
    targetPackProbability: 0,
    calibratedPerCopyChance: 0,
    achievablePackProbability: 0,
    capped: false,
    shortfall: 0,
    method: "e2e",
    signingBookSize: 0,
    samples: 100_000,
  };
  const sourceCompleteness = { seasonCards: "complete", awardResults: "complete", artwork: "frozen", signingBook: "complete" };
  const revisionDigest = releaseRevisionDigest({ catalog, price: 500, rules, signingBook: [], economy: SEASON_END_ECONOMY, calibration, reviewDecisions: {} });
  const { error: replaceError } = await service.rpc("replace_season_end_draft_catalog", {
    p_release: releaseId,
    p_expected_catalog_hash: "",
    p_catalog_hash: catalog.catalogHash,
    p_revision_digest: revisionDigest,
    p_rules_version: SEASON_END_RULES_VERSION,
    p_rules_payload: rules,
    p_economy_version: SEASON_END_ECONOMY.version,
    p_economy_payload: SEASON_END_ECONOMY,
    p_signing_book: [],
    p_withheld_awards: [],
    p_source_completeness: sourceCompleteness,
    p_signature_calibration: calibration,
    p_designs: designs.map((design) => ({ design_id: design.designId, kind: design.kind, payload: design, base_salvage: design.baseSalvage })),
    p_actor: SEASON_END_MEMBER_DISCORD_ID,
  });
  if (replaceError) throw replaceError;

  const publishedAt = new Date().toISOString();
  const { error: publishError } = await service
    .from("season_end_releases")
    .update({ state: "public", published_at: publishedAt, locked_at: publishedAt, locked_by: SEASON_END_MEMBER_DISCORD_ID, updated_by: SEASON_END_MEMBER_DISCORD_ID })
    .eq("id", releaseId);
  if (publishError) throw publishError;

  if (scenario === "recovery") {
    // Persist the charged pending receipt through the same idempotent RPC the
    // purchase action uses. Leaving it pending models a process interruption
    // after debit and before outcome preparation.
    const pendingRequestId = randomUUID();
    const { data, error } = await service.rpc("begin_season_end_opening", {
      p_request_id: pendingRequestId,
      p_user: SEASON_END_PARTNER_DISCORD_ID,
      p_release: releaseId,
      p_mode: "public",
    });
    if (error) throw error;
    if (!Array.isArray(data) || data[0]?.status !== "pending") throw new Error("Recovery opening was not persisted as pending.");
    return { releaseId, pendingRequestId };
  }

  // Commerce gets its own release and two independently minted five-copy
  // collections. Seed through the authoritative opening/fulfillment RPCs so
  // ownership, wallet debits, inventory and provenance all begin consistent.
  const designByKind = (kind: SeasonEndCollectible["kind"], index: number) =>
    designs.filter((design) => design.kind === kind)[index];
  const outcome = [
    { design_id: designByKind("season", 0).designId, kind: "season", foil: false, signed: false },
    { design_id: designByKind("season", 1).designId, kind: "season", foil: false, signed: false },
    { design_id: designByKind("best_of", 0).designId, kind: "best_of", foil: false, signed: false },
    { design_id: designByKind("accolade", 0).designId, kind: "accolade", foil: false, signed: false },
    { design_id: designByKind("best_of", 1).designId, kind: "best_of", foil: true, foil_type: "prisma", signed: false, guaranteed_foil: true },
  ];
  for (const discordId of [SEASON_END_MEMBER_DISCORD_ID, SEASON_END_PARTNER_DISCORD_ID]) {
    const requestId = randomUUID();
    const { data: openingRows, error: beginError } = await service.rpc("begin_season_end_opening", {
      p_request_id: requestId,
      p_user: discordId,
      p_release: releaseId,
      p_mode: "public",
    });
    if (beginError) throw beginError;
    const openingId = Array.isArray(openingRows) ? openingRows[0]?.opening_id : undefined;
    if (typeof openingId !== "string") throw new Error("Commerce opening did not return a durable receipt.");
    const { error: fulfillError } = await service.rpc("fulfill_season_end_opening", {
      p_opening: openingId,
      p_outcome: outcome,
    });
    if (fulfillError) throw fulfillError;
  }

  return { releaseId };
}
