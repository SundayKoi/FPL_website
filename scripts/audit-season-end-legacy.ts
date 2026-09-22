/**
 * Read-only compatibility inventory for Season's End rows created before the
 * frozen release contract. No writes, migrations, or release transitions are
 * performed by this command.
 *
 *   npm run audit:season-end-legacy
 */

import { createClient } from "@supabase/supabase-js";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function main(): Promise<void> {
  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const { data: releases, error: releaseError } = await client
    .from("season_end_releases")
    .select("id, league, season, state, revision_digest, economy_version, rules_payload, economy_payload, signing_book")
    .order("league")
    .order("season")
    .order("catalog_version");
  if (releaseError) throw new Error(releaseError.message);
  const rows = (releases ?? []) as Array<Record<string, unknown>>;
  const releaseIds = rows.map((row) => String(row.id));
  const pendingByRelease = new Map<string, number>();
  if (releaseIds.length) {
    const { data: openings, error: openingError } = await client
      .from("season_end_openings")
      .select("release_id, status, revision_digest, signing_book, rules_payload")
      .in("release_id", releaseIds)
      .eq("status", "pending");
    if (openingError) throw new Error(openingError.message);
    for (const opening of (openings ?? []) as Array<Record<string, unknown>>) {
      const releaseId = String(opening.release_id);
      pendingByRelease.set(releaseId, (pendingByRelease.get(releaseId) ?? 0) + 1);
    }
  }
  const inventory = rows.map((row) => {
    const revisionDigest = String(row.revision_digest ?? "");
    const economyVersion = String(row.economy_version ?? "");
    const rules = row.rules_payload && typeof row.rules_payload === "object" ? row.rules_payload : {};
    const economy = row.economy_payload && typeof row.economy_payload === "object" ? row.economy_payload : {};
    return {
      id: row.id,
      league: row.league,
      season: row.season,
      state: row.state,
      legacyContract: !revisionDigest || !economyVersion || !Object.keys(rules as object).length || !Object.keys(economy as object).length,
      pendingOpenings: pendingByRelease.get(String(row.id)) ?? 0,
      signingBookEntries: Array.isArray(row.signing_book) ? row.signing_book.length : 0,
    };
  });
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), releaseCount: inventory.length, legacyCount: inventory.filter((row) => row.legacyContract).length, pendingOpeningCount: inventory.reduce((sum, row) => sum + row.pendingOpenings, 0), releases: inventory }, null, 2));
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
