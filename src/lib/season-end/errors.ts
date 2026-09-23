import type { CardLeague } from "@/lib/cards/queries";

type SourceCounts = {
  games: number;
  players: number;
  cards: number;
};

type CatalogOperation = "build" | "rebuild";

export function seasonEndSourceReadinessError(
  league: CardLeague,
  season: string,
  counts: SourceCounts,
  operation: CatalogOperation = "rebuild",
): string | null {
  if (counts.games > 0 && counts.players > 0 && counts.cards > 0) return null;

  const draftSetting = league === "premier" ? "featured_draft_id" : "academy_draft_id";
  const verb = operation === "build" ? "build" : "rebuild";
  const missing: string[] = [];
  if (counts.games === 0) missing.push(`regular-season raw_stats for ${season}`);
  if (counts.players === 0 || counts.cards === 0) missing.push(`season card source rows for ${season}`);

  return [
    `Cannot ${verb} the ${season} Season's End catalog: ${missing.join(" and ")} are empty.`,
    `Import or seed the ${season} stats and fixtures, refresh the season card aggregates, and configure league_settings.${draftSetting} before retrying.`,
  ].join(" ");
}

export function formatSeasonEndCatalogActionError(
  error: unknown,
  operation: CatalogOperation,
  season: string,
): string {
  const fallback = operation === "build"
    ? "The draft catalog could not be built."
    : "The draft catalog could not be rebuilt.";
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";

  if (message.startsWith("Cannot build the ") || message.startsWith("Cannot rebuild the ")) return message;
  const verb = operation === "build" ? "build" : "rebuild";
  if (/team identity source is not scoped to the requested season/i.test(message)) {
    return `Cannot ${verb} the ${season} Season's End catalog: the league's draft/team source is not configured for ${season}. Set the matching league_settings draft id and retry.`;
  }
  if (/team identity source failed/i.test(message)) {
    return `Cannot ${verb} the ${season} Season's End catalog: the draft/team source could not be read. Check the league settings and team data, then retry.`;
  }
  if (/ordinary standard-pack reference pool is empty/i.test(message)) {
    return `Cannot ${verb} the ${season} Season's End catalog: the standard-pack reference pool is empty. Seed an archived edition or current-week card pool before retrying.`;
  }
  if (/season card (record|artwork) source failed/i.test(message)) {
    return `Cannot ${verb} the ${season} Season's End catalog: the season card source could not be read. Check the card aggregate/artwork migrations and data, then retry.`;
  }

  return `${fallback} Check the ${season} source data and server logs, then retry.`;
}
