"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { buildDraftSeasonEndCatalog } from "./snapshot";
import { validateSeasonEndCatalog } from "./collectibles";
import { calibrateSeasonEndSignatures, signableCopyDistribution } from "@/lib/packs/season-end";
import { SIGNED_CHANCE } from "@/lib/packs/config";
import { cardPlayerKey } from "@/lib/cards/build";
import { type SeasonEndReleaseState } from "./release-queries";
import { createBettingServiceClient } from "@/lib/betting/service-client";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { fetchSeasonCards, type CardLeague } from "@/lib/cards/queries";
import { loadSeasonEnd, loadSeasonEndTeamIdentities } from "./queries";
import { createServerSupabase } from "@/lib/supabase/server";
import { getBettingUser } from "@/lib/betting/wallet";

type ActionResult = { ok: true; releaseId?: string } | { ok: false; error: string };

async function requireStaff(): Promise<{ id: string } | null> {
  const supabase = await createServerSupabase();
  const tier = await fetchStaffTier(supabase);
  if (!tier.isAdmin && !tier.isOwner) return null;
  const user = await getBettingUser();
  return { id: user?.discordId ?? "staff" };
}

async function buildCatalog(releaseId: string, league: CardLeague, season: string) {
  const service = createBettingServiceClient();
  const [result, cards, teamIdentities] = await Promise.all([
    loadSeasonEnd(service, league, season),
    fetchSeasonCards(service, season),
    loadSeasonEndTeamIdentities(service, league, season),
  ]);
  return buildDraftSeasonEndCatalog({ releaseId, league, season, result, seasonCards: cards, teamIdentities });
}

async function persistCatalog(releaseId: string, catalog: Awaited<ReturnType<typeof buildCatalog>>) {
  const service = createBettingServiceClient();
  const validation = validateSeasonEndCatalog(catalog);
  if (!validation.ok) return { ok: false as const, error: validation.errors.join(" ") };
  const signatures = await fetchAutographs(service);
  const signatureCalibration = calibrateSeasonEndSignatures({
    referencePackProbability: 1 - Math.pow(1 - SIGNED_CHANCE, 5),
    signableCopyDistribution: signableCopyDistribution(catalog, 20_000, 0x5eed, signatures),
  });
  const { error: deleteError } = await service.from("season_end_designs").delete().eq("release_id", releaseId);
  if (deleteError) return { ok: false as const, error: "Could not replace the draft catalog." };
  const { error: insertError } = await service.from("season_end_designs").insert(catalog.designs.map((design) => ({
    release_id: releaseId,
    design_id: design.designId,
    kind: design.kind,
    payload: design,
    base_salvage: design.baseSalvage,
  })));
  if (insertError) return { ok: false as const, error: "Could not save the draft catalog." };
  const { error: updateError } = await service
    .from("season_end_releases")
    .update({ catalog_hash: catalog.catalogHash, rules_version: catalog.rulesVersion, withheld_awards: catalog.withheldAwards, signature_calibration: { ...signatureCalibration, reference: "standard-five-card-pack", signingBookSize: signatures.size, samples: 20_000 }, test_approved_at: null, test_approved_by: null })
    .eq("id", releaseId)
    .neq("state", "public");
  if (updateError) return { ok: false as const, error: "Could not record the catalog revision." };
  return { ok: true as const };
}

async function fetchAutographs(service: ReturnType<typeof createBettingServiceClient>): Promise<Map<string, string>> {
  const { data, error } = await service.from("card_art_prefs").select("summoner_name, tag, signature").not("signature", "is", null);
  if (error) return new Map();
  return new Map(((data as Array<{ summoner_name: string; tag: string; signature: string | null }> | null) ?? [])
    .filter((row): row is { summoner_name: string; tag: string; signature: string } => Boolean(row.signature))
    .map((row) => [cardPlayerKey(row.summoner_name, row.tag), row.signature]));
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
    rules_version: "season-end-2026-09-v1",
    catalog_version: catalogVersion,
    created_by: actor.id,
  });
  if (error) return { ok: false, error: "Could not create the release draft." };
  try {
    const catalog = await buildCatalog(releaseId, input.league, input.season);
    const saved = await persistCatalog(releaseId, catalog);
    if (!saved.ok) return saved;
  } catch (caught) {
    console.error("season-end: build draft failed", caught);
    return { ok: false, error: "The draft catalog could not be assembled completely." };
  }
  revalidatePath("/admin/seasons-end");
  return { ok: true, releaseId };
}

export async function rebuildSeasonEndDraftAction(releaseId: string): Promise<ActionResult> {
  const actor = await requireStaff();
  if (!actor) return { ok: false, error: "Admins only." };
  const service = createBettingServiceClient();
  const { data, error } = await service.from("season_end_releases").select("league, season, state").eq("id", releaseId).maybeSingle();
  if (error || !data) return { ok: false, error: "Release not found." };
  const row = data as { league: CardLeague; season: string; state: SeasonEndReleaseState };
  if (row.state === "public") return { ok: false, error: "Published releases are immutable; create a new revision." };
  try {
    const catalog = await buildCatalog(releaseId, row.league, row.season);
    const saved = await persistCatalog(releaseId, catalog);
    if (!saved.ok) return saved;
  } catch (caught) {
    console.error("season-end: rebuild failed", caught);
    return { ok: false, error: "The draft catalog could not be assembled completely." };
  }
  revalidatePath("/admin/seasons-end");
  return { ok: true, releaseId };
}

export async function setSeasonEndReleaseStateAction(input: { releaseId: string; state: Exclude<SeasonEndReleaseState, "draft"> }): Promise<ActionResult> {
  const actor = await requireStaff();
  if (!actor) return { ok: false, error: "Admins only." };
  const service = createBettingServiceClient();
  const { data, error } = await service.from("season_end_releases").select("catalog_hash").eq("id", input.releaseId).maybeSingle();
  if (error || !data) return { ok: false, error: "Release not found." };
  const { error: transitionError } = await service.rpc("transition_season_end_release", {
    p_release: input.releaseId,
    p_state: input.state,
    p_actor: actor.id,
    p_catalog_hash: (data as { catalog_hash: string }).catalog_hash,
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
  const { error } = await service
    .from("season_end_releases")
    .update({ paused: input.paused, updated_by: actor.id })
    .eq("id", input.releaseId)
    .in("state", ["admin_test", "public"]);
  if (error) return { ok: false, error: "Could not update the pause state." };
  revalidatePath("/admin/seasons-end");
  revalidatePath("/cards/packs");
  revalidatePath("/academy/cards/packs");
  return { ok: true, releaseId: input.releaseId };
}

export async function approveSeasonEndTestAction(releaseId: string): Promise<ActionResult> {
  const actor = await requireStaff();
  if (!actor) return { ok: false, error: "Admins only." };
  const service = createBettingServiceClient();
  const { error } = await service.rpc("approve_season_end_release", { p_release: releaseId, p_actor: actor.id });
  if (error) return { ok: false, error: "The release could not be approved; complete the admin test first." };
  revalidatePath("/admin/seasons-end");
  return { ok: true, releaseId };
}
