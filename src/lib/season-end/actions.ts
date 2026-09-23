"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { buildDraftSeasonEndCatalog } from "./snapshot";
import { releaseRevisionDigest, validateSeasonEndCatalogForLock } from "./collectibles";
import { calibrateSeasonEndSignatures, signableCopyDistribution } from "@/lib/packs/season-end";
import { cardPlayerKey } from "@/lib/cards/build";
import { type SeasonEndReleaseState } from "./release-queries";
import { SEASON_END_ECONOMY, SEASON_END_PACK_PRICE, SEASON_END_RELEASE_RULES, SEASON_END_RULES_VERSION } from "./release";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { fetchCardEditionWeeks, fetchCurrentWeekCards, fetchEditionCards, fetchSeasonCards, fetchSeasonFixtures, fetchTeamIdentity, fetchWeekMoments, type CardLeague } from "@/lib/cards/queries";
import { isPlayoffWeek, isSendoffVaulted } from "@/lib/cards/sendoff";
import { buildTeamCards } from "@/lib/cards/teamCards";
import { loadSeasonEnd, loadSeasonEndTeamIdentities } from "./queries";
import { createServerSupabase } from "@/lib/supabase/server";
import { getBettingUser } from "@/lib/betting/wallet";
import { measureStandardSignatureReference, type StandardSignatureReferencePool, type StandardSignatureReferenceSubstitutions } from "./calibration";
import { buildSeasonEndSigningBook, validateSeasonEndEconomy, validateSeasonEndReleaseRules } from "./release";
import { fetchAllPages } from "@/lib/supabase/pagination";
import { formatSeasonEndCatalogActionError, seasonEndSourceReadinessError } from "./errors";

type ActionResult = { ok: true; releaseId?: string } | { ok: false; error: string };

async function requireStaff(): Promise<{ id: string } | null> {
  const supabase = await createServerSupabase();
  const tier = await fetchStaffTier(supabase);
  if (!tier.isAdmin && !tier.isOwner) return null;
  const user = await getBettingUser();
  return user ? { id: user.discordId } : null;
}

async function buildCatalog(releaseId: string, league: CardLeague, season: string, operation: "build" | "rebuild") {
  const service = createBettingServiceClient();
  const [result, cards] = await Promise.all([
    loadSeasonEnd(service, league, season),
    fetchSeasonCards(service, season, { strictSource: true }),
  ]);
  const sourceError = seasonEndSourceReadinessError(league, season, {
    games: result.games,
    players: result.players,
    cards: cards.length,
  }, operation);
  if (sourceError) throw new Error(sourceError);
  const teamIdentities = await loadSeasonEndTeamIdentities(service, league, season, { strictSource: true });
  return { catalog: buildDraftSeasonEndCatalog({ releaseId, league, season, result, seasonCards: cards, teamIdentities }), cards };
}

async function persistCatalog(
  releaseId: string,
  built: Awaited<ReturnType<typeof buildCatalog>>,
  expectedCatalogHash: string,
  actor: string,
) {
  const service = createBettingServiceClient();
  const catalog = built.catalog;
  const validation = validateSeasonEndCatalogForLock(catalog);
  if (!validation.ok) return { ok: false as const, error: `Catalog validation failed: ${validation.errors.join(" ")}` };
  // Season's End eligibility remains season-scoped. The ordinary-pack
  // calibration below deliberately uses a separate cross-season book because
  // that is what the production standard opener uses.
  const [signatures, standardReferenceSource] = await Promise.all([
    fetchSeasonAutographs(service, catalog.season),
    loadStandardSignatureReference(service, catalog.league, catalog.season),
  ]);
  const signingBookResult = buildSeasonEndSigningBook(catalog, signatures);
  if (signingBookResult.errors.length) return { ok: false as const, error: signingBookResult.errors.join(" ") };
  const signingBook = signingBookResult.entries;
  const reference = measureStandardSignatureReference({
    cards: standardReferenceSource.cards,
    signaturesByPlayerKey: standardReferenceSource.signaturesByPlayerKey,
    pool: standardReferenceSource.pool,
    substitutions: standardReferenceSource.substitutions,
    samples: 100_000,
    seed: 0x5ea50,
  });
  const signatureCalibration = calibrateSeasonEndSignatures({
    referencePackProbability: reference.packProbability,
    signableCopyDistribution: signableCopyDistribution(catalog, 100_000, 0x5eed, signatures),
  });
  const rules = { ...SEASON_END_RELEASE_RULES, signatureChance: signatureCalibration.calibratedPerCopyChance };
  const rulesErrors = validateSeasonEndReleaseRules(rules);
  const economyErrors = validateSeasonEndEconomy(SEASON_END_ECONOMY);
  if (rulesErrors.length || economyErrors.length) return { ok: false as const, error: [...rulesErrors, ...economyErrors].join(" ") };
  const calibration = { ...signatureCalibration, reference, signingBookSize: signingBook.length, samples: 100_000 };
  const sourceCompleteness = { seasonCards: "complete", awardResults: "complete", artwork: "frozen", signingBook: "complete" };
  const { data: releaseRow, error: releaseError } = await service.from("season_end_releases").select("price").eq("id", releaseId).maybeSingle();
  if (releaseError || !releaseRow) return { ok: false as const, error: "Could not read the draft release price." };
  const price = Number((releaseRow as { price?: number }).price ?? SEASON_END_PACK_PRICE);
  const revisionDigest = releaseRevisionDigest({ catalog, price, rules, signingBook, economy: SEASON_END_ECONOMY, calibration, reviewDecisions: {} });
  const { error } = await service.rpc("replace_season_end_draft_catalog", {
    p_release: releaseId,
    p_expected_catalog_hash: expectedCatalogHash,
    p_catalog_hash: catalog.catalogHash,
    p_revision_digest: revisionDigest,
    p_rules_version: SEASON_END_RULES_VERSION,
    p_rules_payload: rules,
    p_economy_version: SEASON_END_ECONOMY.version,
    p_economy_payload: SEASON_END_ECONOMY,
    p_signing_book: signingBook,
    p_withheld_awards: catalog.withheldAwards,
    p_source_completeness: sourceCompleteness,
    p_signature_calibration: calibration,
    p_designs: catalog.designs.map((design) => ({ design_id: design.designId, kind: design.kind, payload: design, base_salvage: design.baseSalvage })),
    p_actor: actor,
  });
  if (error) return { ok: false as const, error: /stale|locked|immutable/i.test(error.message) ? error.message : "Could not record the catalog revision." };
  return { ok: true as const };
}

async function fetchSeasonAutographs(service: ReturnType<typeof createBettingServiceClient>, season: string): Promise<Map<string, string>> {
  const rows = await fetchAllPages<{ summoner_name: string; tag: string; signature: string | null }>((from, to) => service
    .from("card_art_prefs")
    .select("summoner_name, tag, signature, season, updated_at")
    .eq("season", season)
    .not("signature", "is", null)
    .order("updated_at", { ascending: false })
    .order("summoner_name")
    .range(from, to));
  const result = new Map<string, string>();
  for (const row of rows) {
    if (!row.signature) continue;
    const key = cardPlayerKey(row.summoner_name, row.tag);
    if (result.has(key) && result.get(key) !== row.signature) throw new Error(`Conflicting autograph rows for ${key}`);
    result.set(key, row.signature);
  }
  return result;
}

/**
 * The ordinary opener's signing policy is identity-based and cross-season:
 * the most recently saved ink for a player is the one used by every standard
 * pack, regardless of which season supplied the edition pool. Keep this read
 * separate from the season-scoped Season's End signing book above.
 */
async function fetchStandardPackAutographs(service: ReturnType<typeof createBettingServiceClient>): Promise<Map<string, string>> {
  const rows = await fetchAllPages<{ summoner_name: string; tag: string; signature: string | null }>((from, to) => service
    .from("card_art_prefs")
    .select("summoner_name, tag, signature, season, updated_at")
    .not("signature", "is", null)
    .order("updated_at", { ascending: false })
    .order("season", { ascending: false })
    .order("summoner_name")
    .order("tag")
    .range(from, to));
  const result = new Map<string, string>();
  for (const row of rows) {
    if (!row.signature) continue;
    const key = cardPlayerKey(row.summoner_name, row.tag);
    if (!result.has(key)) result.set(key, row.signature);
  }
  return result;
}

async function loadStandardSignatureReference(
  service: ReturnType<typeof createBettingServiceClient>,
  league: CardLeague,
  season: string,
): Promise<{
  cards: Awaited<ReturnType<typeof fetchSeasonCards>>;
  signaturesByPlayerKey: Map<string, string>;
  pool: StandardSignatureReferencePool;
  substitutions: StandardSignatureReferenceSubstitutions;
}> {
  // This mirrors openPackFor's pre-charge source selection. The newest
  // archived edition is the normal pool; if there is no usable edition (or
  // every available send-off is vaulted), production falls back to the live
  // current-week pool.
  const [weeks, fixtures] = await Promise.all([
    fetchCardEditionWeeks(service, season),
    fetchSeasonFixtures(service, season),
  ]);
  const latestEditionWeek = weeks[0] ?? null;
  let editionWeek: string | null = latestEditionWeek;
  if (latestEditionWeek && isSendoffVaulted(fixtures, new Date()) && isPlayoffWeek(fixtures, latestEditionWeek)) {
    editionWeek = weeks.find((week) => !isPlayoffWeek(fixtures, week)) ?? null;
  }

  const [cards, signaturesByPlayerKey] = await Promise.all([
    editionWeek ? fetchEditionCards(service, season, editionWeek) : fetchCurrentWeekCards(service, season),
    fetchStandardPackAutographs(service),
  ]);
  if (cards.length === 0) throw new Error("The ordinary standard-pack reference pool is empty.");
  if (!editionWeek) {
    return {
      cards,
      signaturesByPlayerKey,
      pool: { kind: "current-week", editionWeek: null, league, season },
      substitutions: { editionWeek: null, momentPoolSize: 0, teamPoolSize: 0 },
    };
  }

  const [moments, identity] = await Promise.all([
    fetchWeekMoments(service, season, editionWeek),
    fetchTeamIdentity(service, season),
  ]);
  const teamPoolSize = buildTeamCards(cards, identity.colors, editionWeek).length;
  return {
    cards,
    signaturesByPlayerKey,
    pool: { kind: "edition", editionWeek, league, season },
    substitutions: { editionWeek, momentPoolSize: moments.length, teamPoolSize },
  };
}

export async function createSeasonEndDraftAction(input: { league: CardLeague; season: string }): Promise<ActionResult> {
  const actor = await requireStaff();
  if (!actor) return { ok: false, error: "Admins only." };
  const releaseId = randomUUID();
  const service = createBettingServiceClient();
  const { data: previous } = await service
    .from("season_end_releases")
    .select("catalog_version")
    .eq("league", input.league)
    .eq("season", input.season)
    .order("catalog_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const catalogVersion = Number((previous as { catalog_version?: number } | null)?.catalog_version ?? 0) + 1;
  const { error } = await service.from("season_end_releases").insert({
    id: releaseId,
    league: input.league,
    season: input.season,
    state: "draft",
    paused: false,
    price: 500,
    catalog_hash: "",
    rules_version: SEASON_END_RULES_VERSION,
    catalog_version: catalogVersion,
    created_by: actor.id,
  });
  if (error) return { ok: false, error: "Could not create the release draft." };
  try {
    const built = await buildCatalog(releaseId, input.league, input.season, "build");
    const saved = await persistCatalog(releaseId, built, "", actor.id);
    if (!saved.ok) return saved;
  } catch (caught) {
    console.error("season-end: build draft failed", caught);
    return { ok: false, error: formatSeasonEndCatalogActionError(caught, "build", input.season) };
  }
  revalidatePath("/admin/seasons-end");
  return { ok: true, releaseId };
}

export async function rebuildSeasonEndDraftAction(releaseId: string): Promise<ActionResult> {
  const actor = await requireStaff();
  if (!actor) return { ok: false, error: "Admins only." };
  const service = createBettingServiceClient();
  const { data, error } = await service.from("season_end_releases").select("league, season, state, catalog_hash").eq("id", releaseId).maybeSingle();
  if (error || !data) return { ok: false, error: "Release not found." };
  const row = data as { league: CardLeague; season: string; state: SeasonEndReleaseState; catalog_hash: string };
  if (row.state === "public") return { ok: false, error: "Published releases are immutable; create a new revision." };
  if (row.state === "admin_test") return createSeasonEndDraftAction({ league: row.league, season: row.season });
  try {
    const built = await buildCatalog(releaseId, row.league, row.season, "rebuild");
    const saved = await persistCatalog(releaseId, built, row.catalog_hash, actor.id);
    if (!saved.ok) return saved;
  } catch (caught) {
    console.error("season-end: rebuild failed", caught);
    return { ok: false, error: formatSeasonEndCatalogActionError(caught, "rebuild", row.season) };
  }
  revalidatePath("/admin/seasons-end");
  return { ok: true, releaseId };
}

export async function setSeasonEndReleaseStateAction(input: { releaseId: string; state: Exclude<SeasonEndReleaseState, "draft">; catalogHash: string; revisionDigest: string }): Promise<ActionResult> {
  const actor = await requireStaff();
  if (!actor) return { ok: false, error: "Admins only." };
  if (!input.catalogHash || !input.revisionDigest) return { ok: false, error: "The expected release revision is missing; refresh before changing state." };
  const service = createBettingServiceClient();
  const { error: transitionError } = await service.rpc("transition_season_end_release", {
    p_release: input.releaseId,
    p_state: input.state,
    p_actor: actor.id,
    p_catalog_hash: input.catalogHash,
    p_revision_digest: input.revisionDigest,
  });
  if (transitionError) return { ok: false, error: transitionError.message.includes("test approval") ? "Record an admin test approval before publishing." : "That release state change is not allowed." };
  revalidatePath("/admin/seasons-end");
  revalidatePath("/cards/packs");
  revalidatePath("/academy/cards/packs");
  return { ok: true, releaseId: input.releaseId };
}

export async function pauseSeasonEndReleaseAction(input: { releaseId: string; paused: boolean }): Promise<ActionResult> {
  const actor = await requireStaff();
  if (!actor) return { ok: false, error: "Admins only." };
  const service = createBettingServiceClient();
  const { error } = await service.rpc("pause_season_end_release", { p_release: input.releaseId, p_paused: input.paused, p_actor: actor.id });
  if (error) return { ok: false, error: "Could not update the pause state." };
  revalidatePath("/admin/seasons-end");
  revalidatePath("/cards/packs");
  revalidatePath("/academy/cards/packs");
  return { ok: true, releaseId: input.releaseId };
}

export async function approveSeasonEndTestAction(input: { releaseId: string; revisionDigest: string }): Promise<ActionResult> {
  const actor = await requireStaff();
  if (!actor) return { ok: false, error: "Admins only." };
  if (!input.revisionDigest) return { ok: false, error: "The expected release revision is missing; refresh before approval." };
  const service = createBettingServiceClient();
  const { error } = await service.rpc("approve_season_end_release", { p_release: input.releaseId, p_actor: actor.id, p_revision_digest: input.revisionDigest });
  if (error) return { ok: false, error: "The release could not be approved; complete the admin test first." };
  revalidatePath("/admin/seasons-end");
  return { ok: true, releaseId: input.releaseId };
}

export async function recordSeasonEndVerificationReportAction(input: { releaseId: string; revisionDigest: string; reportDigest: string; report: Record<string, unknown> }): Promise<ActionResult> {
  const actor = await requireStaff();
  if (!actor) return { ok: false, error: "Admins only." };
  if (!input.revisionDigest || !input.reportDigest || !input.report || typeof input.report !== "object") return { ok: false, error: "A complete verification report is required." };
  const { error } = await createBettingServiceClient().rpc("record_season_end_verification_report", {
    p_release: input.releaseId,
    p_revision_digest: input.revisionDigest,
    p_report_digest: input.reportDigest,
    p_report: input.report,
    p_actor: actor.id,
  });
  if (error) return { ok: false, error: error.message.includes("revision") ? "That report is for a different locked revision." : "The verification report is incomplete or failed its release gates." };
  revalidatePath("/admin/seasons-end");
  return { ok: true, releaseId: input.releaseId };
}
