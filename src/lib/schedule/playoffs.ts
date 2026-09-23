import type { FixtureRow, Division } from "./types";

export type PlayoffPolicy22 = "solari_high_vs_lunari_low" | "solari_high_vs_lunari_high";
export type PlayoffPolicy40 = "outer_seeds" | "adjacent_seeds";

export interface PlayoffEntrant {
  teamId: string;
  name: string;
  division: Division;
  seed: number;
}

export interface PlayoffReportGame {
  id: string;
  game_number: number;
  status: "pending" | "ingested" | "needs_side" | "failed" | string;
}

export interface PlayoffReport {
  id: string;
  fixture_id: string | null;
  season: string;
  season_phase: string;
  team_a_id: string;
  team_b_id: string;
  score_a: number | null;
  score_b: number | null;
  status: "pending" | "ingested" | "needs_sides" | "failed" | "forfeit" | string;
  submitted_at: string;
  forfeit_team_id?: string | null;
  games?: PlayoffReportGame[];
}

export type PlayoffSeriesResolution = {
  fixtureId: string;
  status: "ready" | "blocked";
  winnerTeamId: string | null;
  winnerName: string | null;
  scoreA: number | null;
  scoreB: number | null;
  source: "fixture_score" | "report" | null;
  sourceReportIds: string[];
  provisional: boolean;
  sourceVersion: string;
  blockingReason: string | null;
  warnings: string[];
};

export interface ProposedPlayoffMatch {
  sortOrder: number;
  teamA: PlayoffEntrant;
  teamB: PlayoffEntrant;
}

export interface PlayoffAdvancementPreview {
  stage: "semifinals" | "finals";
  status: "ready" | "blocked";
  matches: ProposedPlayoffMatch[];
  results: PlayoffSeriesResolution[];
  sourceFixtureIds: string[];
  sourceReportIds: string[];
  resultVersions: string[];
  blockingReason: string | null;
}

export function normalizePlayoffTeamName(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function entrantByName(entrants: PlayoffEntrant[]): Map<string, PlayoffEntrant[]> {
  const map = new Map<string, PlayoffEntrant[]>();
  for (const entrant of entrants) {
    const key = normalizePlayoffTeamName(entrant.name);
    map.set(key, [...(map.get(key) ?? []), entrant]);
  }
  return map;
}

function validBo5(scoreA: number | null, scoreB: number | null): boolean {
  return Number.isInteger(scoreA) && Number.isInteger(scoreB)
    && ((scoreA === 3 && scoreB !== null && scoreB >= 0 && scoreB <= 2)
      || (scoreB === 3 && scoreA !== null && scoreA >= 0 && scoreA <= 2));
}

function sortedGames(report: PlayoffReport): PlayoffReportGame[] {
  return [...(report.games ?? [])].sort((a, b) => a.game_number - b.game_number || a.id.localeCompare(b.id));
}

function versionOf(fixture: FixtureRow, reports: PlayoffReport[]): string {
  const payload = {
    fixture: {
      id: fixture.id,
      season: fixture.season,
      stage: fixture.stage,
      sort_order: fixture.sort_order,
      team_a: fixture.team_a,
      team_b: fixture.team_b,
      best_of: fixture.best_of,
      score_a: fixture.score_a,
      score_b: fixture.score_b,
    },
    reports: [...reports]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((report) => ({
        id: report.id,
        fixture_id: report.fixture_id,
        season: report.season,
        season_phase: report.season_phase,
        team_a_id: report.team_a_id,
        team_b_id: report.team_b_id,
        score_a: report.score_a,
        score_b: report.score_b,
        status: report.status,
        submitted_at: report.submitted_at,
        forfeit_team_id: report.forfeit_team_id ?? null,
        games: sortedGames(report).map(({ id, game_number, status }) => ({ id, game_number, status })),
      })),
  };
  // This is an optimistic concurrency token, not a security digest. The RPC
  // independently re-reads the same rows and compares the version payload.
  return JSON.stringify(payload);
}

/** Resolve an exact Bo5 using the official fixture score first, then reports. */
export function resolvePlayoffSeries(
  fixture: FixtureRow,
  entrants: PlayoffEntrant[],
  allReports: PlayoffReport[],
): PlayoffSeriesResolution {
  const reports = allReports
    .filter((report) => report.fixture_id === fixture.id)
    .sort((a, b) => a.id.localeCompare(b.id));
  const base = {
    fixtureId: fixture.id,
    winnerTeamId: null,
    winnerName: null,
    scoreA: fixture.score_a,
    scoreB: fixture.score_b,
    source: null,
    sourceReportIds: reports.map((report) => report.id),
    provisional: false,
    sourceVersion: versionOf(fixture, reports),
    blockingReason: null,
    warnings: [] as string[],
  };
  const fail = (reason: string, warnings = base.warnings): PlayoffSeriesResolution => ({
    ...base,
    status: "blocked",
    blockingReason: reason,
    warnings,
  });

  if (fixture.best_of !== 5) return fail("This playoff series is not configured as a best-of-five.");
  if (!fixture.team_a?.trim() || !fixture.team_b?.trim()) return fail("Both teams must be assigned before a result can be resolved.");
  if (normalizePlayoffTeamName(fixture.team_a) === normalizePlayoffTeamName(fixture.team_b)) {
    return fail("The fixture names the same team on both sides.");
  }

  const byName = entrantByName(entrants);
  const aMatches = byName.get(normalizePlayoffTeamName(fixture.team_a)) ?? [];
  const bMatches = byName.get(normalizePlayoffTeamName(fixture.team_b)) ?? [];
  if (aMatches.length !== 1 || bMatches.length !== 1) return fail("Fixture participants do not map to unique frozen playoff entrants.");
  const teamA = aMatches[0];
  const teamB = bMatches[0];
  if (teamA.teamId === teamB.teamId) return fail("The fixture resolves to the same team on both sides.");

  const officialPresent = fixture.score_a !== null || fixture.score_b !== null;
  const officialValid = validBo5(fixture.score_a, fixture.score_b);
  const officialWinner = officialValid
    ? (fixture.score_a === 3 ? teamA : teamB)
    : null;
  const officialScore = officialValid ? [fixture.score_a!, fixture.score_b!] as const : null;
  if (officialPresent && !officialValid) base.warnings.push("The fixture score is partial or is not a complete Bo5 result.");

  const reportResults: { report: PlayoffReport; winner: PlayoffEntrant; scoreA: number; scoreB: number; provisional: boolean }[] = [];
  const reportIssues: string[] = [];
  for (const report of reports) {
    if (report.season !== fixture.season || report.season_phase.toLocaleLowerCase("en-US") !== "playoffs") {
      reportIssues.push(`Report ${report.id} has the wrong season or phase.`);
      continue;
    }
    const normal = report.team_a_id === teamA.teamId && report.team_b_id === teamB.teamId;
    const reversed = report.team_a_id === teamB.teamId && report.team_b_id === teamA.teamId;
    if (!normal && !reversed) {
      reportIssues.push(`Report ${report.id} names participants outside this fixture.`);
      continue;
    }
    if (report.status === "failed" || sortedGames(report).some((game) => game.status === "failed")) {
      reportIssues.push(`Report ${report.id} failed and cannot supply a playoff result.`);
      continue;
    }
    if (!validBo5(report.score_a, report.score_b)) {
      reportIssues.push(`Report ${report.id} does not contain a complete 3–0, 3–1, 3–2, or reversed Bo5 result.`);
      continue;
    }
    const scoreA = normal ? report.score_a! : report.score_b!;
    const scoreB = normal ? report.score_b! : report.score_a!;
    const winner = scoreA === 3 ? teamA : teamB;
    if (report.status === "forfeit" && !report.forfeit_team_id) {
      reportIssues.push(`Forfeit report ${report.id} does not name the conceding team.`);
      continue;
    }
    if (report.forfeit_team_id && report.forfeit_team_id !== (winner.teamId === teamA.teamId ? teamB.teamId : teamA.teamId)) {
      reportIssues.push(`Report ${report.id} names a forfeit side that did not lose the series.`);
      continue;
    }
    if (report.status !== "ingested" && report.status !== "forfeit" && report.status !== "pending" && report.status !== "needs_sides") {
      reportIssues.push(`Report ${report.id} has unsupported status “${report.status}”.`);
      continue;
    }
    reportResults.push({
      report,
      winner,
      scoreA,
      scoreB,
      provisional: report.status === "pending" || report.status === "needs_sides"
        || sortedGames(report).some((game) => game.status === "pending" || game.status === "needs_side"),
    });
  }

  const distinctReportedResults = new Set(reportResults.map(({ scoreA, scoreB }) => `${scoreA}-${scoreB}`));
  if (distinctReportedResults.size > 1) return fail("Usable reports conflict; staff must resolve the series before advancing.", reportIssues);
  if (officialValid && reportResults.some(({ scoreA, scoreB }) => scoreA !== officialScore![0] || scoreB !== officialScore![1])) {
    return fail("A usable report disagrees with the official fixture score.", reportIssues);
  }
  if (officialValid) {
    return {
      ...base,
      status: "ready",
      winnerTeamId: officialWinner!.teamId,
      winnerName: officialWinner!.name,
      scoreA: officialScore![0],
      scoreB: officialScore![1],
      source: "fixture_score",
      warnings: reportIssues,
    };
  }
  if (reportResults.length > 0) {
    const result = reportResults[0];
    return {
      ...base,
      status: "ready",
      winnerTeamId: result.winner.teamId,
      winnerName: result.winner.name,
      scoreA: result.scoreA,
      scoreB: result.scoreB,
      source: "report",
      sourceReportIds: base.sourceReportIds,
      provisional: reportResults.some(({ provisional }) => provisional),
      warnings: [...base.warnings, ...reportIssues],
    };
  }
  return fail(reportIssues[0] ?? (officialPresent
    ? "No usable report can replace the incomplete fixture score."
    : "The series has no complete official score or usable report."), reportIssues);
}

function bySeed(entrants: PlayoffEntrant[]): PlayoffEntrant[] {
  return [...entrants].sort((a, b) => a.seed - b.seed || a.name.localeCompare(b.name));
}

/** Pair the quarterfinal winners using frozen seeds and a versioned policy. */
export function pairSemifinals(
  entrants: PlayoffEntrant[],
  winnerTeamIds: string[],
  policy22: PlayoffPolicy22 | null,
  policy40: PlayoffPolicy40 | null,
): { matches: ProposedPlayoffMatch[]; blockingReason: string | null } {
  if (winnerTeamIds.length !== 4 || new Set(winnerTeamIds).size !== 4) {
    return { matches: [], blockingReason: "Four distinct quarterfinal winners are required." };
  }
  const winnerSet = new Set(winnerTeamIds);
  const winners = entrants.filter((entrant) => winnerSet.has(entrant.teamId));
  if (winners.length !== 4) return { matches: [], blockingReason: "A quarterfinal winner is missing from the frozen seed list." };

  const solari = bySeed(winners.filter((entrant) => entrant.division === "Solari"));
  const lunari = bySeed(winners.filter((entrant) => entrant.division === "Lunari"));
  const make = (a: PlayoffEntrant, b: PlayoffEntrant, sortOrder: number): ProposedPlayoffMatch => ({ sortOrder, teamA: a, teamB: b });

  if (solari.length === 2 && lunari.length === 2) {
    if (!policy22) return { matches: [], blockingReason: "The 2/2 cross-division pairing policy needs a league ruling." };
    return { matches: policy22 === "solari_high_vs_lunari_low"
      ? [make(solari[0], lunari[1], 0), make(lunari[0], solari[1], 1)]
      : [make(solari[0], lunari[0], 0), make(lunari[1], solari[1], 1)], blockingReason: null };
  }
  if (solari.length === 3 && lunari.length === 1) {
    return { matches: [make(solari[0], solari[2], 0), make(solari[1], lunari[0], 1)], blockingReason: null };
  }
  if (solari.length === 1 && lunari.length === 3) {
    return { matches: [make(lunari[0], lunari[2], 0), make(lunari[1], solari[0], 1)], blockingReason: null };
  }
  const sameDivision = solari.length === 4 ? solari : lunari.length === 4 ? lunari : [];
  if (sameDivision.length === 4) {
    if (!policy40) return { matches: [], blockingReason: "All four survivors share one division; a league ruling is required for the semifinal fallback." };
    return { matches: policy40 === "outer_seeds"
      ? [make(sameDivision[0], sameDivision[3], 0), make(sameDivision[1], sameDivision[2], 1)]
      : [make(sameDivision[0], sameDivision[1], 0), make(sameDivision[2], sameDivision[3], 1)], blockingReason: null };
  }
  return { matches: [], blockingReason: "The surviving division split is not covered by the playoff rules." };
}

export function pairFinalists(
  semifinalWinners: { fixture: FixtureRow; result: PlayoffSeriesResolution }[],
  entrants: PlayoffEntrant[],
): { matches: ProposedPlayoffMatch[]; blockingReason: string | null } {
  if (semifinalWinners.length !== 2 || semifinalWinners.some(({ result }) => result.status !== "ready" || !result.winnerTeamId)) {
    return { matches: [], blockingReason: "Both semifinal series need a usable result before the final can be published." };
  }
  const teams = semifinalWinners
    .sort((a, b) => a.fixture.sort_order - b.fixture.sort_order)
    .map(({ result }) => entrants.find((entrant) => entrant.teamId === result.winnerTeamId));
  if (!teams[0] || !teams[1]) return { matches: [], blockingReason: "A semifinal winner is missing from the frozen seed list." };
  if (teams[0].teamId === teams[1].teamId) return { matches: [], blockingReason: "The same team won both semifinal fixtures." };
  return { matches: [{ sortOrder: 0, teamA: teams[0], teamB: teams[1] }], blockingReason: null };
}

export function buildAdvancementPreview(
  stage: "semifinals" | "finals",
  sourceFixtures: FixtureRow[],
  targetFixtures: FixtureRow[],
  entrants: PlayoffEntrant[],
  reports: PlayoffReport[],
  policies: { policy22: PlayoffPolicy22 | null; policy40: PlayoffPolicy40 | null },
): PlayoffAdvancementPreview {
  const expectedSourceCount = stage === "semifinals" ? 4 : 2;
  const orderedSources = [...sourceFixtures].sort((a, b) => a.sort_order - b.sort_order);
  const results = orderedSources.map((fixture) => resolvePlayoffSeries(fixture, entrants, reports));
  const targetCount = stage === "semifinals" ? 2 : 1;
  let pairing = stage === "semifinals"
    ? pairSemifinals(entrants, results.flatMap((result) => result.winnerTeamId ? [result.winnerTeamId] : []), policies.policy22, policies.policy40)
    : pairFinalists(orderedSources.map((fixture) => ({
        fixture,
        result: results.find((result) => result.fixtureId === fixture.id)!,
      })), entrants);
  const blockedResult = results.find((result) => result.status !== "ready");
  const blockingReason = orderedSources.length !== expectedSourceCount
    ? `Expected ${expectedSourceCount} source fixtures, found ${orderedSources.length}.`
    : targetFixtures.length !== targetCount
      ? `Expected ${targetCount} existing ${stage} target slot(s), found ${targetFixtures.length}.`
      : blockedResult?.blockingReason ?? pairing.blockingReason;
  if (blockingReason) pairing = { matches: [], blockingReason };
  return {
    stage,
    status: blockingReason ? "blocked" : "ready",
    matches: pairing.matches,
    results,
    sourceFixtureIds: orderedSources.map((fixture) => fixture.id),
    sourceReportIds: [...new Set(results.flatMap((result) => result.sourceReportIds))].sort(),
    resultVersions: results.map((result) => result.sourceVersion),
    blockingReason,
  };
}
