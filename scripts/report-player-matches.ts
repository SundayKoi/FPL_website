/**
 * Read-only canonical-player matching report for existing `public.players` rows.
 *
 * Usage:
 *   npx tsx scripts/report-player-matches.ts
 *   npx tsx scripts/report-player-matches.ts --season=season-5
 *
 * Config resolution matches the existing scripts pattern:
 * - env override first
 * - else `npx supabase status -o json`
 *
 * This script never mutates Supabase state.
 */
import { execSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";

import {
  matchCanonicalPlayer,
  normalizeCanonicalName,
  type CanonicalPlayer,
} from "@/lib/players/canonicalMatch";
import type { LolRole } from "@/lib/draft/types";
import type { SeasonKey } from "@/lib/players/seasonData";

type PlayerRow = {
  id: string;
  draft_id: string;
  display_name: string;
  role: LolRole;
  rank: string | null;
  opgg_url: string | null;
  canonical_player_id: string | null;
};

type ReportRow = {
  player_id: string;
  draft_id: string;
  player_display_name: string;
  player_role: LolRole;
  normalized_name: string;
  current_canonical_player_id: string | null;
  confidence: "exact" | "alias" | "ambiguous" | "none";
  matched_canonical_player_id: string | null;
  matched_display_name: string | null;
  matched_role: LolRole | null;
  ambiguous_candidates: Array<{
    id: string;
    display_name: string;
    role: LolRole;
  }>;
};

function resolveConfig(): { url: string; key: string } {
  const envUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const envKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (envUrl && envKey) {
    return { url: envUrl, key: envKey };
  }

  const status = JSON.parse(execSync("npx supabase status -o json", { encoding: "utf8" })) as {
    API_URL?: string;
    ANON_KEY?: string;
    SERVICE_ROLE_KEY?: string;
  };
  const url = envUrl ?? status.API_URL;
  const key = envKey ?? status.ANON_KEY ?? status.SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Could not resolve Supabase URL / key. Is `npx supabase start` running?");
  }

  return { url, key };
}

function parseSeasonArg(argv: string[]): SeasonKey {
  const raw = argv.find((arg) => arg.startsWith("--season="))?.slice("--season=".length);
  if (!raw) return "season-5";
  if (raw !== "season-5" && raw !== "season-4") {
    throw new Error(`Unsupported season "${raw}". Expected season-5 or season-4.`);
  }
  return raw;
}

function sortCanonicalPlayers(players: CanonicalPlayer[]): CanonicalPlayer[] {
  return [...players].sort((a, b) =>
    a.normalized_name.localeCompare(b.normalized_name)
    || a.role.localeCompare(b.role)
    || a.display_name.localeCompare(b.display_name)
    || a.id.localeCompare(b.id)
  );
}

function sortPlayerRows(rows: PlayerRow[]): PlayerRow[] {
  return [...rows].sort((a, b) =>
    a.draft_id.localeCompare(b.draft_id)
    || a.display_name.localeCompare(b.display_name)
    || a.role.localeCompare(b.role)
    || a.id.localeCompare(b.id)
  );
}

function collectAmbiguousCandidates(
  normalizedName: string,
  candidates: CanonicalPlayer[],
): Array<{ id: string; display_name: string; role: LolRole }> {
  return candidates
    .filter((candidate) => candidate.normalized_name === normalizedName)
    .sort((a, b) =>
      a.role.localeCompare(b.role)
      || a.display_name.localeCompare(b.display_name)
      || a.id.localeCompare(b.id)
    )
    .map((candidate) => ({
      id: candidate.id,
      display_name: candidate.display_name,
      role: candidate.role,
    }));
}

async function main() {
  const season = parseSeasonArg(process.argv.slice(2));
  const { url, key } = resolveConfig();
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const [{ data: candidates, error: poolError }, { data: players, error: playersError }] = await Promise.all([
    supabase
      .from("player_pool")
      .select("id, season_key, normalized_name, display_name, role, rank, opgg_url, created_at, updated_at")
      .eq("season_key", season),
    supabase
      .from("players")
      .select("id, draft_id, display_name, role, rank, opgg_url, canonical_player_id"),
  ]);

  if (poolError) throw poolError;
  if (playersError) throw playersError;

  const canonicalPlayers = sortCanonicalPlayers((candidates ?? []) as CanonicalPlayer[]);
  const playerRows = sortPlayerRows((players ?? []) as PlayerRow[]);

  const report: ReportRow[] = playerRows.map((player) => {
    const normalizedName = normalizeCanonicalName(player.display_name);
    const { match, confidence } = matchCanonicalPlayer(player.display_name, canonicalPlayers);

    return {
      player_id: player.id,
      draft_id: player.draft_id,
      player_display_name: player.display_name,
      player_role: player.role,
      normalized_name: normalizedName,
      current_canonical_player_id: player.canonical_player_id,
      confidence,
      matched_canonical_player_id: match?.id ?? null,
      matched_display_name: match?.display_name ?? null,
      matched_role: match?.role ?? null,
      ambiguous_candidates:
        confidence === "ambiguous"
          ? collectAmbiguousCandidates(normalizedName, canonicalPlayers)
          : [],
    };
  });

  const summary = report.reduce(
    (acc, row) => {
      acc[row.confidence] += 1;
      return acc;
    },
    { exact: 0, alias: 0, ambiguous: 0, none: 0 } as Record<ReportRow["confidence"], number>,
  );

  process.stdout.write(
    `${JSON.stringify({ season, summary, rows: report }, null, 2)}\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
