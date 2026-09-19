import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CardLeague } from "@/lib/cards/queries";
import type { SeasonEndCollectible, SeasonEndCatalog } from "./collectibles";

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
}

function releaseRow(row: Record<string, unknown>): SeasonEndRelease {
  return {
    id: String(row.id),
    league: row.league === "academy" ? "academy" : "premier",
    season: String(row.season),
    state: row.state as SeasonEndReleaseState,
    paused: row.paused === true,
    price: Number(row.price ?? 500),
    catalogHash: String(row.catalog_hash ?? ""),
    rulesVersion: String(row.rules_version ?? ""),
    catalogVersion: Number(row.catalog_version ?? 1),
    withheldAwards: (row.withheld_awards as SeasonEndCatalog["withheldAwards"] | null) ?? [],
    signatureCalibration: (row.signature_calibration as Record<string, unknown> | null) ?? null,
    testApprovedAt: (row.test_approved_at as string | null) ?? null,
    testApprovedBy: (row.test_approved_by as string | null) ?? null,
    publishedAt: (row.published_at as string | null) ?? null,
  };
}

export async function fetchSeasonEndRelease(
  client: SupabaseClient,
  league: CardLeague,
  season: string,
  options: { publicOnly?: boolean } = {},
): Promise<SeasonEndRelease | null> {
  const query = client
    .from("season_end_releases")
    .select("id, league, season, state, paused, price, catalog_hash, rules_version, catalog_version, withheld_awards, signature_calibration, test_approved_at, test_approved_by, published_at")
    .eq("league", league)
    .eq("season", season)
    .order("catalog_version", { ascending: false })
    .limit(1);
  const { data, error } = options.publicOnly
    ? await query.eq("state", "public").maybeSingle()
    : await query.maybeSingle();
  if (error || !data) return null;
  return releaseRow(data as Record<string, unknown>);
}

export async function fetchSeasonEndCatalog(client: SupabaseClient, release: SeasonEndRelease): Promise<SeasonEndCatalog | null> {
  const { data, error } = await client
    .from("season_end_designs")
    .select("design_id, payload")
    .eq("release_id", release.id)
    .order("design_id");
  if (error || !data) return null;
  const designs = (data as Array<{ design_id: string; payload: SeasonEndCollectible }>).map((row) => ({
    ...row.payload,
    designId: row.design_id,
  }));
  return {
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
}

export async function fetchSeasonEndOwnedDesignIds(client: SupabaseClient, releaseId: string, discordId: string): Promise<string[]> {
  const { data, error } = await client
    .from("season_end_inventory")
    .select("design_id")
    .eq("release_id", releaseId)
    .eq("discord_id", discordId)
    .eq("mode", "public");
  if (error) return [];
  return [...new Set(((data as Array<{ design_id: string }> | null) ?? []).map((row) => row.design_id))];
}

export async function fetchSeasonEndAdminRelease(client: SupabaseClient, league: CardLeague, season: string): Promise<SeasonEndRelease | null> {
  return fetchSeasonEndRelease(client, league, season);
}
