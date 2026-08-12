import type { SignupRow } from "./types";

/**
 * Ids (row ids) of signups whose Discord handle or Riot ID collides with
 * another signup in the same season — the same person submitting twice, or
 * two people claiming one account. Matching is case-insensitive and
 * trimmed; seasons are kept separate so last split's signups don't flag
 * this split's returning players.
 */
export function duplicateSignupIds(rows: SignupRow[]): Set<string> {
  const seen = new Map<string, string[]>();
  for (const row of rows) {
    for (const key of [
      `${row.season}::discord::${row.discord.trim().toLowerCase()}`,
      `${row.season}::riot::${row.riot_id.trim().toLowerCase()}`,
    ]) {
      const ids = seen.get(key);
      if (ids) ids.push(row.id);
      else seen.set(key, [row.id]);
    }
  }
  const flagged = new Set<string>();
  for (const ids of seen.values()) {
    if (ids.length > 1) for (const id of ids) flagged.add(id);
  }
  return flagged;
}

const CSV_HEADERS = [
  "Submitted",
  "Season",
  "Discord",
  "Riot ID",
  "op.gg",
  "New/Returning",
  "Current Rank",
  "Peak Rank",
  "Primary Role",
  "Secondary Role",
  "Captain",
] as const;

/** RFC4180-ish escaping: wrap in quotes and double any embedded quotes. */
function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Signups as CSV text for pasting into the league's MasterDoc sheet. */
export function signupsToCsv(rows: SignupRow[]): string {
  const lines = [CSV_HEADERS.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.created_at,
        row.season,
        row.discord,
        row.riot_id,
        // Multi-line op.gg entries would break the row; flatten to spaces.
        row.opgg.replace(/\s+/g, " ").trim(),
        row.player_status,
        row.current_rank,
        row.peak_rank,
        row.primary_role,
        row.secondary_role ?? "",
        row.captain_interest ? "Yes" : "No",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n");
}
