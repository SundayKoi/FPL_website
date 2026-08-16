export type LeagueView = "premier" | "academy";

export type LeagueTeamNameRow = { name: string | null | undefined };

export function normalizeTeamName(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

export function academyTeamNames(rows: LeagueTeamNameRow[]): Set<string> {
  return new Set(rows.map((row) => normalizeTeamName(row.name)).filter(Boolean));
}

export function resolveLeagueView(value: string | string[] | undefined): LeagueView {
  return (Array.isArray(value) ? value[0] : value) === "academy" ? "academy" : "premier";
}
