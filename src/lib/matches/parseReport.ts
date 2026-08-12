// Pure parser for a captain's Discord report post. No network, no Supabase —
// see .superpowers/sdd/2026-08-11-match-reporting-auto-ingest/task-3-brief.md
// and the "report format" section of
// docs/superpowers/specs/2026-08-11-match-reporting-auto-ingest-design.md
// (canonical source of the rules below). Real posts look like:
//
//   MIC 3-0 BBC
//   https://drafter.lol/draft/T4cB_WHp?game=1 5568297187
//   https://drafter.lol/draft/T4cB_WHp?game=2 5568352310
//   https://drafter.lol/draft/T4cB_WHp?game=3 5568409447
//
// ...plus arbitrary extra prose/screenshot-caption lines that must be
// ignored. The result is meant to prefill an editable form (Task 4), never
// to be submitted as-is, so unresolved fields come back null + a warning
// rather than throwing.

import type { LeagueTeam } from "./types";

export interface ParsedReport {
  teamAId: string | null;
  teamBId: string | null;
  teamAToken: string | null;
  teamBToken: string | null;
  scoreA: number | null;
  scoreB: number | null;
  draftUrl: string | null;
  games: { gameNumber: number; matchId: string }[];
  warnings: string[];
}

// "MIC 3-0 BBC" / "MIC 3–0 BBC" (en dash also accepted). Team tokens are
// 1-5 alphanumeric chars, matching league_teams.abbreviation's own check
// constraint. Anchored per-line (see the split loop below) so stray prose
// elsewhere in the post can't accidentally satisfy it.
const SCORE_LINE = /^\s*([A-Za-z0-9]{1,5})\s+(\d+)\s*[-–]\s*(\d+)\s+([A-Za-z0-9]{1,5})\s*$/;

// Bare Riot match ids ("5568297187") and already-prefixed ones
// ("NA1_5568297187"). Alternation order doesn't matter for correctness: `_`
// is a \w character, so \b never sits between the "_" and the digits of an
// NA1_-prefixed id, meaning the bare-digit branch can never re-match a
// prefixed id's digit run.
const MATCH_ID = /\bNA1_\d{8,}\b|\b\d{8,}\b/g;

// Same-line game number, e.g. "?game=2".
const GAME_PARAM = /\?game=(\d+)/;

// First drafter.lol link on a line; query string is stripped by the caller.
const DRAFT_URL = /https:\/\/drafter\.lol\/\S+/;

function resolveTeamId(token: string, teams: LeagueTeam[]): string | null {
  const lower = token.toLowerCase();
  const byAbbreviation = teams.find((t) => t.abbreviation.toLowerCase() === lower);
  if (byAbbreviation) return byAbbreviation.id;
  const byName = teams.find((t) => t.name.toLowerCase() === lower);
  return byName ? byName.id : null;
}

export function parseReport(text: string, teams: LeagueTeam[]): ParsedReport {
  let teamAId: string | null = null;
  let teamBId: string | null = null;
  let teamAToken: string | null = null;
  let teamBToken: string | null = null;
  let scoreA: number | null = null;
  let scoreB: number | null = null;
  let draftUrl: string | null = null;
  const games: { gameNumber: number; matchId: string }[] = [];
  const seenIds = new Set<string>();
  const warnings: string[] = [];
  let scoreLineSeen = false;

  for (const line of text.split(/\r?\n/)) {
    // Score line: first match wins, later lines that also happen to fit the
    // pattern (e.g. someone re-pasting a correction) are ignored.
    if (!scoreLineSeen) {
      const scoreMatch = SCORE_LINE.exec(line);
      if (scoreMatch) {
        scoreLineSeen = true;
        teamAToken = scoreMatch[1];
        teamBToken = scoreMatch[4];
        scoreA = Number(scoreMatch[2]);
        scoreB = Number(scoreMatch[3]);
        teamAId = resolveTeamId(teamAToken, teams);
        teamBId = resolveTeamId(teamBToken, teams);
        if (teamAId === null) warnings.push(`Unknown team abbreviation: "${teamAToken}"`);
        if (teamBId === null) warnings.push(`Unknown team abbreviation: "${teamBToken}"`);
        continue;
      }
    }

    // First drafter.lol link in the whole post, query string stripped.
    if (draftUrl === null) {
      const urlMatch = DRAFT_URL.exec(line);
      if (urlMatch) draftUrl = urlMatch[0].split("?")[0];
    }

    // Match id(s) on this line, tagged with this line's ?game=N if present,
    // else the next 1-based slot in the (deduped) games list.
    const idsOnLine = line.match(MATCH_ID);
    if (!idsOnLine) continue;
    const gameParamMatch = GAME_PARAM.exec(line);
    const explicitGameNumber = gameParamMatch ? Number(gameParamMatch[1]) : null;
    for (const raw of idsOnLine) {
      const matchId = raw.startsWith("NA1_") ? raw : `NA1_${raw}`;
      if (seenIds.has(matchId)) continue;
      seenIds.add(matchId);
      games.push({ gameNumber: explicitGameNumber ?? games.length + 1, matchId });
    }
  }

  return { teamAId, teamBId, teamAToken, teamBToken, scoreA, scoreB, draftUrl, games, warnings };
}
