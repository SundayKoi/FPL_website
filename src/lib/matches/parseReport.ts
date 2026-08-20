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
// ignored — and, per the Task 3 fix round, arbitrary Discord noise that
// *looks* numeric: CDN attachment links and message permalinks (both built
// from 17-19 digit snowflake ids) and ordinary prose that happens to
// contain an 8+ digit number. The result is meant to prefill an editable
// form (Task 4), never to be submitted as-is, so unresolved fields come
// back null + a warning rather than throwing.

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
// ("NA1_5568297187"). Bare ids are capped at 12 digits: real Riot ids are
// ~10 digits, while Discord snowflakes (CDN attachment ids, message/channel
// ids in permalinks) run 17-19 digits — the cap is what keeps those out,
// independent of the line-scoping below. NA1_-prefixed ids keep no upper
// bound: the prefix alone is enough to trust them regardless of length.
// Alternation order doesn't matter for correctness: `_` is a \w character,
// so \b never sits between the "_" and the digits of an NA1_-prefixed id,
// meaning the bare-digit branch can never re-match a prefixed id's digit run.
const MATCH_ID = /\bNA1_\d{8,}\b|\b\d{8,12}\b/g;

// A line counts as a "match line" — the documented one-line-per-game format
// — if it carries a drafter link (drafter.lol or the site's own
// /match-draft/ and /drafter/ pages, whatever host they're pasted from) or
// an explicit NA1_-prefixed id. When at least one such line exists anywhere
// in the post, id extraction is scoped to ONLY match lines (see
// `hasMatchLine` below): a CDN screenshot link, a message permalink, or
// plain prose living on any other line is never scanned for ids, no matter
// what digits it contains. This is the primary defense; the MATCH_ID digit
// cap above is the secondary one for the fallback path.
const MATCH_LINE = /https:\/\/drafter\.lol\/|https?:\/\/[^/\s]+\/(?:match-draft|drafter)\/|\bNA1_\d{8,}\b/;

// Fallback mode only (no match line anywhere in the post): strip every
// non-drafter http(s) URL before scanning, so a CDN link or permalink
// pasted without any recognizable game line still can't leak its digits.
const NON_DRAFTER_URL = /https?:\/\/(?!drafter\.lol\/)(?![^/\s]+\/(?:match-draft|drafter)\/)\S+/g;

// Every http(s) URL — match ids are stripped-URL scanned so a fixture uuid
// in a site drafter link (or digits in a drafter.lol token) can never be
// mistaken for a Riot match id. The id always lives NEXT TO the link.
const ANY_URL = /https?:\/\/\S+/g;

// Same-line game number, e.g. "?game=2".
const GAME_PARAM = /\?game=(\d+)/;

// First drafter link on a line — drafter.lol or the site's own drafter
// pages; query string is stripped by the caller.
const DRAFT_URL = /https:\/\/drafter\.lol\/\S+|https?:\/\/[^/\s]+\/(?:match-draft|drafter)\/\S+/;

function resolveTeamId(token: string, teams: LeagueTeam[]): string | null {
  const lower = token.toLowerCase();
  const byAbbreviation = teams.find((t) => t.abbreviation.toLowerCase() === lower);
  if (byAbbreviation) return byAbbreviation.id;
  const byName = teams.find((t) => t.name.toLowerCase() === lower);
  return byName ? byName.id : null;
}

export function parseReport(text: string, teams: LeagueTeam[]): ParsedReport {
  const lines = text.split(/\r?\n/);
  // Rule 1/2: decide once, for the whole post, whether id extraction is
  // scoped to match lines or falls back to scanning everything.
  const hasMatchLine = lines.some((line) => MATCH_LINE.test(line));

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
  let ignoredCandidateCount = 0;

  for (const line of lines) {
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

    // What this line contributes to the id scan: scoped mode either scans
    // the raw line (it's a trusted match line) or skips it entirely
    // (tallying any valid-length candidate it would otherwise have offered,
    // for the warning below); fallback mode scans every line with
    // non-drafter.lol URLs scrubbed out first.
    let idScanText: string;
    if (hasMatchLine) {
      if (!MATCH_LINE.test(line)) {
        const excluded = line.match(MATCH_ID);
        if (excluded) ignoredCandidateCount += excluded.length;
        continue;
      }
      // Scan a trusted match line with its URLs removed: a site drafter
      // link carries the fixture's uuid, whose digit runs must never be
      // read as match ids. The DRAFT_URL capture above already happened.
      idScanText = line.replace(ANY_URL, " ");
    } else {
      idScanText = line.replace(NON_DRAFTER_URL, " ");
    }

    const idsOnLine = idScanText.match(MATCH_ID);
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

  // Rule 5: scoping (above) can silently drop a plausible-looking number
  // living outside the match lines — surface that instead of staying quiet.
  if (ignoredCandidateCount > 0) {
    warnings.push(`Ignored ${ignoredCandidateCount} number(s) outside the match lines`);
  }

  // Rule 4: gameNumbers must be unique on the way out, whether the
  // collision came from two lines both saying "?game=1" or from an
  // explicit number colliding with the 1-based fallback counter. Renumber
  // the whole list 1..N in first-seen order rather than let a duplicate
  // escape — a later step keying off gameNumber must never see two games
  // claiming the same slot.
  const gameNumbers = games.map((g) => g.gameNumber);
  if (new Set(gameNumbers).size !== gameNumbers.length) {
    games.forEach((g, i) => {
      g.gameNumber = i + 1;
    });
    warnings.push(`Duplicate game numbers found — renumbered games 1-${games.length} in the order they appeared`);
  }

  return { teamAId, teamBId, teamAToken, teamBToken, scoreA, scoreB, draftUrl, games, warnings };
}
