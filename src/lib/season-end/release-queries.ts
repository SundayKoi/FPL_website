import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CardLeague } from "@/lib/cards/queries";
import { fetchAllPages } from "@/lib/supabase/pagination";
import { catalogHash, releaseRevisionDigest, validateSeasonEndCatalog, validateSeasonEndCatalogForLock, type SeasonEndCollectible, type SeasonEndCatalog } from "./collectibles";
import { validateSeasonEndEconomy, validateSeasonEndReleaseRules, validateSeasonEndSigningBook } from "./release";

export type SeasonEndReleaseState = "draft" | "admin_test" | "public";
export type SeasonEndOpeningMode = "admin_test" | "public";

export interface SeasonEndRelease {
  id: string;
  league: CardLeague;
  season: string;
  state: SeasonEndReleaseState;
  paused: boolean;
  price: number;
  catalogHash: string;
  rulesVersion: string;
  catalogVersion: number;
  withheldAwards: SeasonEndCatalog["withheldAwards"];
  signatureCalibration: Record<string, unknown> | null;
  testApprovedAt: string | null;
  testApprovedBy: string | null;
  publishedAt: string | null;
  revisionDigest: string;
  economyVersion: string;
  economyRules: Record<string, unknown>;
  rulesPayload: Record<string, unknown>;
  signingBook: Array<{ playerKey: string; autograph: string }>;
  sourceCompleteness: Record<string, unknown>;
  verificationReport: Record<string, unknown> | null;
  lockedAt: string | null;
  lockedBy: string | null;
  legacyContract: boolean;
}

function releaseRow(row: Record<string, unknown>): SeasonEndRelease {
  const state = row.state;
  if (row.league !== "premier" && row.league !== "academy") throw new Error("Invalid Season's End release league");
  if (state !== "draft" && state !== "admin_test" && state !== "public") throw new Error("Invalid Season's End release state");
  if (typeof row.id !== "string" || !row.id) throw new Error("Invalid Season's End release id");
  if (typeof row.season !== "string" || !row.season) throw new Error("Invalid Season's End release season");
  if ((row.league === "academy") !== row.season.toUpperCase().startsWith("A")) throw new Error("Season's End league/season pair is invalid");
  if (!Number.isSafeInteger(Number(row.price)) || Number(row.price) <= 0) throw new Error("Invalid Season's End release price");
  const signingBook = Array.isArray(row.signing_book) ? row.signing_book : [];
  const signingErrors = validateSeasonEndSigningBook(signingBook);
  if (signingErrors.length) throw new Error(signingErrors.join(" "));
  const normalizedSigningBook: Array<{ playerKey: string; autograph: string }> = [];
  const signingKeys = new Set<string>();
  for (const entry of signingBook) {
    if (!entry || typeof entry !== "object") throw new Error("Invalid Season's End signing-book entry");
    const playerKey = (entry as { playerKey?: unknown }).playerKey;
    const autograph = (entry as { autograph?: unknown }).autograph;
    if (typeof playerKey !== "string" || !playerKey || typeof autograph !== "string" || !autograph || signingKeys.has(playerKey)) {
      throw new Error("Invalid or duplicate Season's End signing-book entry");
    }
    signingKeys.add(playerKey);
    normalizedSigningBook.push({ playerKey, autograph });
  }
  const revisionDigest = String(row.revision_digest ?? "");
  const economyRules = (row.economy_payload as Record<string, unknown> | null) ?? {};
  const rulesPayload = (row.rules_payload as Record<string, unknown> | null) ?? {};
  const sourceCompleteness = (row.source_completeness as Record<string, unknown> | null) ?? {};
  const withheldAwards = Array.isArray(row.withheld_awards) ? row.withheld_awards : [];
  if (withheldAwards.some((award) => !award || typeof award !== "object" || typeof (award as { awardId?: unknown }).awardId !== "string" || typeof (award as { title?: unknown }).title !== "string" || !["unavailable", "unearned"].includes(String((award as { status?: unknown }).status)) || typeof (award as { reason?: unknown }).reason !== "string")) {
    throw new Error("Invalid Season's End withheld-award disposition");
  }
  const legacyContract = !revisionDigest || !String(row.economy_version ?? "") || !Object.keys(economyRules).length || !Object.keys(rulesPayload).length;
  if (!legacyContract) {
    if (!/^[0-9a-f]{64}$/i.test(String(row.catalog_hash ?? ""))) throw new Error("Season's End catalog hash is invalid");
    const completenessKeys = Object.keys(sourceCompleteness).sort().join(",");
    if (completenessKeys !== "artwork,awardResults,seasonCards,signingBook" || Object.values(sourceCompleteness).some((value) => value !== "complete" && value !== "frozen")) throw new Error("Season's End source completeness is incomplete");
    const ruleErrors = validateSeasonEndReleaseRules(rulesPayload as never);
    const economyErrors = validateSeasonEndEconomy(economyRules as never);
    if (ruleErrors.length || economyErrors.length) throw new Error([...ruleErrors, ...economyErrors].join(" "));
  }
  return {
    id: row.id,
    league: row.league,
    season: row.season,
    state,
    paused: row.paused === true,
    price: Number(row.price ?? 500),
    catalogHash: String(row.catalog_hash ?? ""),
    rulesVersion: String(row.rules_version ?? ""),
    catalogVersion: Number(row.catalog_version ?? 1),
    withheldAwards: withheldAwards as SeasonEndCatalog["withheldAwards"],
    signatureCalibration: (row.signature_calibration as Record<string, unknown> | null) ?? null,
    testApprovedAt: (row.test_approved_at as string | null) ?? null,
    testApprovedBy: (row.test_approved_by as string | null) ?? null,
    publishedAt: (row.published_at as string | null) ?? null,
    revisionDigest,
    economyVersion: String(row.economy_version ?? ""),
    economyRules,
    rulesPayload,
    signingBook: normalizedSigningBook,
    sourceCompleteness,
    verificationReport: (row.verification_report as Record<string, unknown> | null) ?? null,
    lockedAt: (row.locked_at as string | null) ?? null,
    lockedBy: (row.locked_by as string | null) ?? null,
    legacyContract,
  };
}

const RELEASE_COLUMNS = "id, league, season, state, paused, price, catalog_hash, rules_version, catalog_version, withheld_awards, signature_calibration, test_approved_at, test_approved_by, published_at, revision_digest, economy_version, economy_payload, signing_book, source_completeness, verification_report, locked_at, locked_by, rules_payload";

export async function fetchSeasonEndRelease(
  client: SupabaseClient,
  league: CardLeague,
  season: string,
  options: { publicOnly?: boolean; releaseId?: string } = {},
): Promise<SeasonEndRelease | null> {
  const query = client
    .from("season_end_releases")
    .select(RELEASE_COLUMNS)
    .eq("league", league)
    .eq("season", season);
  const scoped = options.releaseId
    ? query.eq("id", options.releaseId)
    : options.publicOnly
      ? query.order("published_at", { ascending: false }).order("catalog_version", { ascending: false }).order("id", { ascending: false }).limit(1)
      : query.order("catalog_version", { ascending: false }).order("id", { ascending: false }).limit(1);
  const { data, error } = options.publicOnly ? await scoped.eq("state", "public").maybeSingle() : await scoped.maybeSingle();
  if (error) throw new Error(`Season's End release read failed: ${error.message}`);
  if (!data) return null;
  return releaseRow(data as Record<string, unknown>);
}

export async function fetchSeasonEndReleaseById(client: SupabaseClient, releaseId: string, options: { publicOnly?: boolean } = {}): Promise<SeasonEndRelease | null> {
  const query = client.from("season_end_releases").select(RELEASE_COLUMNS).eq("id", releaseId);
  const { data, error } = options.publicOnly ? await query.eq("state", "public").maybeSingle() : await query.maybeSingle();
  if (error) throw new Error(`Season's End release read failed: ${error.message}`);
  return data ? releaseRow(data as Record<string, unknown>) : null;
}

/**
 * Find the newest public opening that still needs owner recovery. This read is
 * deliberately independent of membership eligibility: a lost membership must
 * not strand a charge that the purchase action is still authorized to finish.
 */
export async function fetchSeasonEndRecovery(client: SupabaseClient, discordId: string, league?: CardLeague): Promise<{ release: SeasonEndRelease; requestId: string } | null> {
  // Scope the opening read before applying its recency limit. The opening
  // table stores only release_id, so filtering after limit(1) can let a newer
  // opening from the other league hide the one this page must recover.
  let releaseQuery = client.from("season_end_releases").select("id").eq("state", "public");
  if (league) releaseQuery = releaseQuery.eq("league", league);
  const { data: releaseRows, error: releaseError } = await releaseQuery;
  if (releaseError) throw new Error(`Season's End recovery read failed: ${releaseError.message}`);
  const releaseIds = ((releaseRows as Array<{ id?: unknown }> | null) ?? [])
    .map((row) => (typeof row.id === "string" ? row.id : null))
    .filter((id): id is string => Boolean(id));
  if (!releaseIds.length) return null;

  // Only a pending opening represents an unresolved charge. Refunded receipts
  // are terminal: surfacing one here would keep routing the owner back into
  // recovery forever after the client has acknowledged the refund. A member
  // with the original local intent can still see the terminal response in the
  // normal shop and explicitly start a fresh request UUID.
  const { data, error } = await client
    .from("season_end_openings")
    .select("release_id, request_id")
    .eq("discord_id", discordId)
    .eq("mode", "public")
    .eq("status", "pending")
    .in("release_id", releaseIds)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Season's End recovery read failed: ${error.message}`);
  if (!data) return null;
  const row = data as { release_id: string; request_id: string };
  const release = await fetchSeasonEndReleaseById(client, row.release_id);
  if (!release) return null;
  return { release, requestId: String(row.request_id) };
}

export async function fetchPublishedSeasonEndReleases(client: SupabaseClient, league: CardLeague): Promise<SeasonEndRelease[]> {
  const rows = await fetchAllPages<Record<string, unknown>>((from, to) => client.from("season_end_releases").select(RELEASE_COLUMNS).eq("league", league).eq("state", "public").order("published_at", { ascending: false }).order("catalog_version", { ascending: false }).order("id", { ascending: false }).range(from, to));
  return rows.map(releaseRow);
}

export async function fetchSeasonEndCatalog(client: SupabaseClient, release: SeasonEndRelease): Promise<SeasonEndCatalog | null> {
  const designsRows = await fetchAllPages<{ design_id: string; payload: SeasonEndCollectible }>((from, to) => client
    .from("season_end_designs")
    .select("design_id, payload")
    .eq("release_id", release.id)
    .order("design_id")
    .range(from, to));
  const designs = designsRows.map((row) => ({
    ...row.payload,
    designId: row.design_id,
  }));
  const catalog: SeasonEndCatalog = {
    releaseId: release.id,
    league: release.league,
    season: release.season,
    schemaVersion: 1,
    rulesVersion: release.rulesVersion,
    designs,
    withheldAwards: release.withheldAwards,
    catalogHash: release.catalogHash,
    createdAt: release.publishedAt ?? new Date(0).toISOString(),
  };
  const validation = release.state === "draft" ? validateSeasonEndCatalog(catalog) : validateSeasonEndCatalogForLock(catalog);
  if (!validation.ok && release.state !== "draft") throw new Error(`Season's End catalog is invalid: ${validation.errors.join(" ")}`);
  if (!release.legacyContract && !/^[0-9a-f]{64}$/i.test(release.catalogHash)) throw new Error("Season's End catalog digest is invalid");
  if (release.catalogHash && /^[0-9a-f]{64}$/i.test(release.catalogHash) && catalogHash(designs) !== release.catalogHash) {
    throw new Error("Season's End catalog digest does not match the locked release");
  }
  if (!release.legacyContract) {
    const playerKeys = new Set(designs.flatMap((design) => design.kind === "season" || design.kind === "best_of" ? [design.player.key] : []));
    if (release.signingBook.some((entry) => !playerKeys.has(entry.playerKey))) throw new Error("Season's End signing book contains an unknown player");
    const expectedRevisionDigest = releaseRevisionDigest({
      catalog,
      price: release.price,
      rules: release.rulesPayload,
      signingBook: release.signingBook,
      economy: release.economyRules,
      calibration: release.signatureCalibration,
      reviewDecisions: {},
    });
    if (expectedRevisionDigest !== release.revisionDigest) throw new Error("Season's End revision digest does not match the locked release");
  }
  return catalog;
}

export async function fetchSeasonEndOwnedDesignIds(client: SupabaseClient, releaseId: string, discordId: string): Promise<string[]> {
  const rows = await fetchAllPages<{ design_id: string }>((from, to) => client
    .from("season_end_inventory")
    .select("design_id")
    .eq("release_id", releaseId)
    .eq("discord_id", discordId)
    .eq("mode", "public")
    .eq("lifecycle_status", "active")
    .order("id")
    .range(from, to));
  return [...new Set(rows.map((row) => row.design_id))];
}

export interface SeasonEndOwnedCopy {
  inventoryId: number;
  releaseId: string;
  openingId: string;
  designId: string;
  slotPosition: number;
  revealOrder: number;
  lifecycleStatus: "active" | "sold" | "dusted";
  foil: boolean;
  foilType: string | null;
  signed: boolean;
  autograph: string | null;
  payload: SeasonEndCollectible;
  economyVersion: string;
  rulesVersion: string;
}

export async function fetchSeasonEndOwnedCopies(client: SupabaseClient, releaseId: string, discordId: string): Promise<SeasonEndOwnedCopy[]> {
  const rows = await fetchAllPages<Record<string, unknown>>((from, to) => client
    .from("season_end_inventory")
    .select("id, release_id, opening_id, design_id, slot_position, reveal_order, lifecycle_status, foil, foil_type, signed, autograph, payload, economy_version, rules_version")
    .eq("release_id", releaseId)
    .eq("discord_id", discordId)
    .eq("mode", "public")
    .eq("lifecycle_status", "active")
    .order("id")
    .range(from, to));
  return rows.map((row) => ({
    inventoryId: Number(row.id),
    releaseId: String(row.release_id),
    openingId: String(row.opening_id),
    designId: String(row.design_id),
    slotPosition: Number(row.slot_position),
    revealOrder: Number(row.reveal_order),
    lifecycleStatus: row.lifecycle_status as SeasonEndOwnedCopy["lifecycleStatus"],
    foil: row.foil === true,
    foilType: typeof row.foil_type === "string" ? row.foil_type : null,
    signed: row.signed === true,
    autograph: typeof row.autograph === "string" ? row.autograph : null,
    payload: row.payload as SeasonEndCollectible,
    economyVersion: String(row.economy_version ?? ""),
    rulesVersion: String(row.rules_version ?? ""),
  }));
}

export async function fetchSeasonEndPublicCopy(client: SupabaseClient, inventoryId: number): Promise<SeasonEndOwnedCopy | null> {
  const { data, error } = await client
    .from("season_end_inventory")
    .select("id, release_id, opening_id, design_id, slot_position, reveal_order, lifecycle_status, foil, foil_type, signed, autograph, payload, economy_version, rules_version")
    .eq("id", inventoryId)
    .eq("mode", "public")
    .maybeSingle();
  if (error) throw new Error(`Season's End copy read failed: ${error.message}`);
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    inventoryId: Number(row.id), releaseId: String(row.release_id), openingId: String(row.opening_id), designId: String(row.design_id),
    slotPosition: Number(row.slot_position), revealOrder: Number(row.reveal_order), lifecycleStatus: row.lifecycle_status as SeasonEndOwnedCopy["lifecycleStatus"],
    foil: row.foil === true, foilType: typeof row.foil_type === "string" ? row.foil_type : null, signed: row.signed === true,
    autograph: typeof row.autograph === "string" ? row.autograph : null, payload: row.payload as SeasonEndCollectible,
    economyVersion: String(row.economy_version ?? ""), rulesVersion: String(row.rules_version ?? ""),
  };
}

export async function fetchSeasonEndAdminRelease(client: SupabaseClient, league: CardLeague, season: string): Promise<SeasonEndRelease | null> {
  return fetchSeasonEndRelease(client, league, season);
}
