import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCardEditionWeeks, type CardLeague } from "@/lib/cards/queries";

export type HigherLowerSnapshotErrorCode = "NO_EDITION" | "DATABASE_ERROR";

/** A refresh failure with enough detail for callers to distinguish an empty
 * archive from a database outage or an RPC failure. */
export class HigherLowerSnapshotError extends Error {
  constructor(
    public readonly code: HigherLowerSnapshotErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "HigherLowerSnapshotError";
  }
}

export interface HigherLowerSnapshotResult {
  editionWeeks: string[];
  candidateCount: number;
}

function parseCandidateCount(data: unknown): number | null {
  const value = Array.isArray(data) ? data[0] : data;
  if (value === null || value === undefined || value === "") return null;
  const count = typeof value === "number" ? value : Number(value);
  return Number.isInteger(count) && count >= 0 ? count : null;
}

/**
 * Add the newest archived card weeks to one Higher or Lower daily pool.
 *
 * This is deliberately framework-independent: the weekly card drop uses the
 * trusted service client, while the game server uses the same operation after
 * its existing Premium authorization check. The database RPC is additive, so
 * an already-created date may temporarily contain more than two weeks when a
 * new edition lands; later dates still start from the newest two.
 */
export async function refreshHigherLowerSnapshot(
  supabase: SupabaseClient,
  league: CardLeague,
  season: string,
  puzzleDate: string,
): Promise<HigherLowerSnapshotResult> {
  let availableWeeks: string[];
  try {
    // Existing callers intentionally tolerate a missing card_editions
    // migration. The refresh path needs to report a failed read explicitly so
    // operators do not mistake it for a genuinely empty archive.
    availableWeeks = await fetchCardEditionWeeks(supabase, season, { throwOnError: true });
  } catch (error) {
    throw new HigherLowerSnapshotError(
      "DATABASE_ERROR",
      `Could not read archived card editions for season ${season}.`,
      error,
    );
  }

  const editionWeeks = availableWeeks.slice(0, 2);
  if (editionWeeks.length === 0) {
    throw new HigherLowerSnapshotError(
      "NO_EDITION",
      `No frozen card edition is available for season ${season}.`,
    );
  }

  let data: unknown;
  try {
    const result = await supabase.rpc("ensure_higher_lower_daily_candidates_weeks", {
      p_puzzle_date: puzzleDate,
      p_league: league,
      p_season: season,
      p_edition_weeks: editionWeeks,
    });
    if (result.error) {
      throw result.error;
    }
    data = result.data;
  } catch (error) {
    throw new HigherLowerSnapshotError(
      "DATABASE_ERROR",
      `Could not refresh Higher or Lower candidates for ${league} on ${puzzleDate}.`,
      error,
    );
  }

  const candidateCount = parseCandidateCount(data);
  if (candidateCount === null) {
    throw new HigherLowerSnapshotError(
      "DATABASE_ERROR",
      "Higher or Lower snapshot RPC did not return a candidate count.",
    );
  }

  return { editionWeeks, candidateCount };
}
