export type League = "premier" | "academy";

export function normalizeLeague(value: unknown): League {
  return value === "academy" ? "academy" : "premier";
}

export function leagueLabel(league: League): string {
  return league === "academy" ? "Academy" : "Premier";
}

export function draftSettingColumn(league: League): "featured_draft_id" | "academy_draft_id" {
  return league === "academy" ? "academy_draft_id" : "featured_draft_id";
}
