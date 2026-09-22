// The Send-off: playoff editions printed by elimination.
//
// The regular season prints a card for everyone who played that week,
// rated against that week's cohort. Playoffs cannot: only the teams still
// in the bracket play, and by the finals the "cohort" is ten people, so a
// finalist ranked last of ten prints as a bad card for reaching the final.
//
// The Send-off flips the rule. A player's playoff card prints ONCE, in the
// week their team's split ended, rated on the whole split (the same
// season-to-date build the hub and the movers post use) and stamped with
// how far they got. The gauntlet week prints the teams the gauntlet
// knocked out, the quarterfinals week prints its four losers, the semis
// their two, and the finals week prints the runner-up and the Champion —
// every player in the league exactly once, in the order they fell, and the
// Champion's five last.
//
// Pure. Reads live in queries.ts; the edition builder decides which kind
// of week it is (src/lib/cards/editionBuilder.ts) and the renderer draws
// the stamp off `card.sendoff`.

import { normalizeTeamName } from "@/lib/league/context";
import { mondayOf } from "@/lib/packs/week";
import type { PlayerCardData } from "./build";

/** How far the team got — the stamp on the card, least to most. */
export const SENDOFF_STAGES = ["gauntlet", "quarterfinalist", "semifinalist", "finalist", "champion"] as const;
export type SendoffStage = (typeof SENDOFF_STAGES)[number];

/** The fixture stages whose result ends somebody's split. Mirrors
 *  FIXTURE_STAGES in src/lib/schedule/types.ts; the regular-season weeks
 *  eliminate nobody. */
export const SENDOFF_EXIT_STAGES = ["gauntlet_r1", "gauntlet_r2", "quarterfinals", "semifinals", "finals"] as const;
export type SendoffExitStage = (typeof SENDOFF_EXIT_STAGES)[number];

/**
 * What a send-off print carries. Frozen on the edition row and on every
 * copy pulled from it, like every other stamp on PlayerCardData.
 */
export interface SendoffMark {
  /** How far the team got. */
  stage: SendoffStage;
  /** The fixture stage that ended the split. */
  exit: SendoffExitStage;
  /** The team, as the fixture names it. */
  team: string;
  /** The series line from this team's side — "1–3", "3–2" — or null when
   *  the fixture carried no scores. */
  series: string | null;
  /** The Monday (YYYY-MM-DD, Eastern) the edition printed on. */
  week: string;
}

export interface SendoffStageMeta {
  stage: SendoffStage;
  /** The word the shop and the ledger use — "Semifinalist". */
  label: string;
  /** The stamp on the card front, short and loud — "SEMIFINALIST". */
  stamp: string;
  /** The one line under it — "Out in the Semifinals". */
  line: string;
  /** Stamp colour; the champion also wears a frame of its own. */
  accent: string;
  /** The coin's glyph. */
  glyph: string;
  /** Sort order for the ledger, least to most. */
  order: number;
}

export const SENDOFF_META: Record<SendoffStage, SendoffStageMeta> = {
  gauntlet: {
    stage: "gauntlet",
    label: "Gauntlet",
    stamp: "GAUNTLET",
    line: "Split ended in the Gauntlet",
    accent: "#9aa5b1",
    glyph: "⚔",
    order: 0,
  },
  quarterfinalist: {
    stage: "quarterfinalist",
    label: "Quarterfinalist",
    stamp: "QUARTERFINALIST",
    line: "Out in the Quarterfinals",
    accent: "#b08d57",
    glyph: "◆",
    order: 1,
  },
  semifinalist: {
    stage: "semifinalist",
    label: "Semifinalist",
    stamp: "SEMIFINALIST",
    line: "Out in the Semifinals",
    accent: "#c0c9d2",
    glyph: "◆",
    order: 2,
  },
  finalist: {
    stage: "finalist",
    label: "Finalist",
    stamp: "FINALIST",
    line: "Runner-up of the split",
    accent: "#e6c14b",
    glyph: "◆",
    order: 3,
  },
  champion: {
    stage: "champion",
    label: "Champion",
    stamp: "CHAMPION",
    line: "Champion of the split",
    accent: "#ffd166",
    glyph: "♛",
    order: 4,
  },
};

/** The exit stage → the stamp the LOSER of that fixture wears. The winner
 *  of the finals is the one team that leaves as champion, handled by the
 *  planner rather than this table. */
export const LOSER_STAGE_BY_EXIT: Record<SendoffExitStage, SendoffStage> = {
  gauntlet_r1: "gauntlet",
  gauntlet_r2: "gauntlet",
  quarterfinals: "quarterfinalist",
  semifinals: "semifinalist",
  finals: "finalist",
};

/**
 * Stamps a season-rated card as a send-off print. The season build's Card
 * of the Week crown is cleared here: it was judged across the whole
 * collection, and a send-off edition crowns its own five (crownSendoff).
 */
export function withSendoff(card: PlayerCardData, mark: SendoffMark): PlayerCardData {
  return { ...card, standout: false, sendoff: mark };
}

/**
 * Cards of the Week for a send-off edition: the top-rated card in each
 * role among the cards that print, best first — the same rule
 * buildSeasonCards applies to a weekly edition, on the edition's own
 * roster. Eclipse eligibility reads `standout`, so these are the week's
 * five one-of-one slots.
 */
export function crownSendoff(cards: PlayerCardData[]): PlayerCardData[] {
  const sorted = [...cards].sort((a, b) => b.overall - a.overall || a.name.localeCompare(b.name));
  const crowned = new Set<string>();
  return sorted.map((card) => {
    if (crowned.has(card.role)) return { ...card, standout: false };
    crowned.add(card.role);
    return { ...card, standout: true };
  });
}

/** "Send-off · Champion" — the stamp's name on a copy's edition line and
 *  in a pull announcement. One card, one stage. */
export function sendoffEditionLabel(stage: SendoffStage): string {
  return `Send-off · ${SENDOFF_META[stage].label}`;
}

/** What a week of the bracket is called — a week holds one round. */
export const EXIT_LABELS: Record<SendoffExitStage, string> = {
  gauntlet_r1: "Gauntlet",
  gauntlet_r2: "Gauntlet",
  quarterfinals: "Quarterfinals",
  semifinals: "Semifinals",
  finals: "Finals",
};

/**
 * "Send-off · Finals" — the EDITION's name in the shop's week picker, from
 * the exits that printed in it. A week can hold two rounds (both gauntlet
 * rounds play on one day; semis and finals could share a Monday), so the
 * latest round names it. Empty exits name nothing: the caller falls back
 * to the ordinary "Week N" label.
 */
export function sendoffWeekLabel(exits: readonly SendoffExitStage[]): string | null {
  const latest = [...exits].sort((a, b) => SENDOFF_EXIT_STAGES.indexOf(b) - SENDOFF_EXIT_STAGES.indexOf(a))[0];
  return latest ? `Send-off · ${EXIT_LABELS[latest]}` : null;
}

// ---------------------------------------------------------------------------
// The planner
// ---------------------------------------------------------------------------

/** What the planner reads off a fixture. `FixtureRow` satisfies it, and so
 *  does the narrow select fetchSeasonFixtures takes — the planner never
 *  needs the id, the division or the best-of. */
export interface SendoffFixture {
  stage: string;
  team_a: string | null;
  team_b: string | null;
  score_a: number | null;
  score_b: number | null;
  scheduled_at: string | null;
}

/** One team's split ending. */
export interface Elimination {
  /** The team, spelled as the fixture spells it. */
  team: string;
  stage: SendoffStage;
  exit: SendoffExitStage;
  /** The series from this team's side — "1–3" — or null when the fixture
   *  carried no scores. En dash, like every other score line on the site. */
  series: string | null;
  opponent: string | null;
  /** mondayOf(scheduled_at). */
  week: string;
}

const EXIT_STAGE_SET: ReadonlySet<string> = new Set<string>(SENDOFF_EXIT_STAGES);

function isExitStage(stage: string | null | undefined): stage is SendoffExitStage {
  return typeof stage === "string" && EXIT_STAGE_SET.has(stage);
}

/** "1–3" from `mine`'s side. En dash. */
function seriesLine(mine: number, theirs: number): string {
  return `${mine}–${theirs}`;
}

/**
 * Every split that ended in `week`.
 *
 * The loser of each DECIDED playoff fixture scheduled in that Eastern week,
 * plus the winner of the finals as `champion` — the one team that leaves the
 * bracket without being knocked out of it.
 *
 * An undecided fixture (either score null, or a tie) eliminates nobody: the
 * series has not happened yet, or the row is half-entered, and printing a
 * send-off off it would stamp somebody's career-defining card with a result
 * that isn't one. Scores land, the week is re-archived, the edition appears.
 *
 * One entry per team. A team that loses the gauntlet's second round after
 * winning its first appears in two fixtures in the same week, and only the
 * LATER exit is its send-off — it got that far.
 *
 * Sorted by stage order then team name, so the drop's post and the admin
 * ledger read in the order people fell.
 */
export function eliminationsInWeek(fixtures: SendoffFixture[], week: string): Elimination[] {
  const byTeam = new Map<string, Elimination>();

  const record = (elimination: Elimination) => {
    const key = normalizeTeamName(elimination.team);
    const held = byTeam.get(key);
    // Later exit wins: a team knocked out in r2 played r1 too.
    if (held && SENDOFF_META[held.stage].order >= SENDOFF_META[elimination.stage].order) return;
    byTeam.set(key, elimination);
  };

  for (const fixture of fixtures) {
    if (!isExitStage(fixture.stage) || !fixture.scheduled_at) continue;
    if (mondayOf(new Date(fixture.scheduled_at)) !== week) continue;
    const { team_a: teamA, team_b: teamB, score_a: scoreA, score_b: scoreB } = fixture;
    if (!teamA || !teamB) continue;
    if (scoreA === null || scoreB === null || scoreA === scoreB) continue;

    const aWon = scoreA > scoreB;
    const loser = aWon ? teamB : teamA;
    const winner = aWon ? teamA : teamB;
    const loserScore = aWon ? scoreB : scoreA;
    const winnerScore = aWon ? scoreA : scoreB;

    record({
      team: loser,
      stage: LOSER_STAGE_BY_EXIT[fixture.stage],
      exit: fixture.stage,
      series: seriesLine(loserScore, winnerScore),
      opponent: winner,
      week,
    });

    // The finals are the one fixture whose WINNER also stops playing.
    if (fixture.stage === "finals") {
      record({
        team: winner,
        stage: "champion",
        exit: "finals",
        series: seriesLine(winnerScore, loserScore),
        opponent: loser,
        week,
      });
    }
  }

  return [...byTeam.values()].sort(
    (a, b) => SENDOFF_META[a.stage].order - SENDOFF_META[b.stage].order || a.team.localeCompare(b.team),
  );
}

/**
 * The teams that went THROUGH this week: winners of the week's decided
 * fixtures, less anyone the same week also knocked out (a gauntlet team
 * that won round 1 and lost round 2 is eliminated, not advancing) and
 * less the finals winner, whose stop is the Champion send-off. Spelled as
 * the fixture spells them, deduplicated, sorted. Their players print in
 * the week's edition as ORDINARY season cards, so a pack bought for a
 * playoff week can pull the people still in the bracket too.
 */
export function advancingInWeek(fixtures: SendoffFixture[], week: string): string[] {
  const out = new Set<string>(eliminationsInWeek(fixtures, week).map((e) => normalizeTeamName(e.team)));
  const byKey = new Map<string, string>();
  for (const fixture of fixtures) {
    if (!isExitStage(fixture.stage) || fixture.stage === "finals" || !fixture.scheduled_at) continue;
    if (mondayOf(new Date(fixture.scheduled_at)) !== week) continue;
    const { team_a: teamA, team_b: teamB, score_a: scoreA, score_b: scoreB } = fixture;
    if (!teamA || !teamB || scoreA === null || scoreB === null || scoreA === scoreB) continue;
    const winner = scoreA > scoreB ? teamA : teamB;
    const key = normalizeTeamName(winner);
    if (!key || out.has(key) || byKey.has(key)) continue;
    byKey.set(key, winner);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * Does `week` hold a playoff fixture at all — decided or not?
 *
 * This, not `eliminationsInWeek().length`, is what makes a week a send-off
 * week. A playoff week whose scores have not been entered yet must print
 * NOTHING: the alternative is a weekly edition rating the ten people who
 * played the semifinals against each other, which is the exact card the
 * Send-off exists to stop printing.
 */
export function isPlayoffWeek(fixtures: SendoffFixture[], week: string): boolean {
  return fixtures.some(
    (fixture) =>
      isExitStage(fixture.stage)
      && Boolean(fixture.scheduled_at)
      && mondayOf(new Date(fixture.scheduled_at as string)) === week,
  );
}

/** The exit stages a week's playoff fixtures belong to, earliest first —
 *  what names the edition (sendoffWeekLabel). */
export function exitsInWeek(fixtures: SendoffFixture[], week: string): SendoffExitStage[] {
  const exits = new Set<SendoffExitStage>();
  for (const fixture of fixtures) {
    if (!isExitStage(fixture.stage) || !fixture.scheduled_at) continue;
    if (mondayOf(new Date(fixture.scheduled_at)) !== week) continue;
    exits.add(fixture.stage);
  }
  return SENDOFF_EXIT_STAGES.filter((exit) => exits.has(exit));
}

export interface SendoffPlan {
  week: string;
  eliminations: Elimination[];
  /** The teams that went through this week (advancingInWeek), whose
   *  players print as ordinary season cards beside the send-offs. */
  advancing: string[];
  /** The edition: every season card whose team played this week — the
   *  fallen stamped as send-offs, the teams through as plain season cards
   *  — crowned as one roster. Empty while the week's fixtures are undecided. */
  cards: PlayerCardData[];
  /** Teams no season card matched, fallen or through. A name mismatch
   *  between fixtures and raw_stats would silently print nobody, so it is
   *  reported rather than swallowed. */
  unmatched: string[];
  /** The exits this week holds, for sendoffWeekLabel. */
  exits: SendoffExitStage[];
}

/**
 * What a send-off week prints.
 *
 * `seasonCards` is the season-to-DATE build — the whole league rated
 * against the whole league — because that is the only cohort that rates a
 * finalist honestly. Everyone whose team fell this week gets their one
 * playoff card out of it, and everyone whose team went through prints as
 * an ordinary season card beside them, so the week's packs can pull the
 * whole night's players.
 */
export function planSendoff(
  seasonCards: PlayerCardData[],
  fixtures: SendoffFixture[],
  week: string,
): SendoffPlan {
  const eliminations = eliminationsInWeek(fixtures, week);
  const advancing = advancingInWeek(fixtures, week);
  const exits = exitsInWeek(fixtures, week);

  // Fixtures carry league_teams.name; a card's teamName is raw_stats.
  // team_name, written from the same table — but nothing enforces the two
  // spell a team identically, so match on the normalized name.
  const markByTeam = new Map<string, Elimination>();
  for (const elimination of eliminations) markByTeam.set(normalizeTeamName(elimination.team), elimination);
  const throughKeys = new Set(advancing.map((team) => normalizeTeamName(team)));

  const matched = new Set<string>();
  const printed: PlayerCardData[] = [];
  for (const card of seasonCards) {
    const key = normalizeTeamName(card.teamName);
    if (!key) continue;
    const elimination = markByTeam.get(key);
    if (elimination) {
      matched.add(key);
      printed.push(
        withSendoff(card, {
          stage: elimination.stage,
          exit: elimination.exit,
          team: elimination.team,
          series: elimination.series,
          week,
        }),
      );
      continue;
    }
    // Through to the next round: the ordinary season card, unstamped. The
    // season crown is dropped here for the same reason withSendoff drops
    // it — crownSendoff hands this edition its own five.
    if (throughKeys.has(key)) {
      matched.add(key);
      printed.push({ ...card, standout: false });
    }
  }

  return {
    week,
    eliminations,
    advancing,
    cards: crownSendoff(printed),
    unmatched: [
      ...eliminations.filter((e) => !matched.has(normalizeTeamName(e.team))).map((e) => e.team),
      ...advancing.filter((team) => !matched.has(normalizeTeamName(team))),
    ],
    exits,
  };
}

/**
 * Every elimination of the bracket so far, across all of its weeks: one
 * entry per team, the later exit winning (a team falls once; the finals
 * winner is the champion). What the live surfaces stamp, as opposed to
 * eliminationsInWeek, which is what one week's edition prints.
 */
export function eliminationsSoFar(fixtures: SendoffFixture[]): Elimination[] {
  const weeks = new Set<string>();
  for (const fixture of fixtures) {
    if (isExitStage(fixture.stage) && fixture.scheduled_at) weeks.add(mondayOf(new Date(fixture.scheduled_at)));
  }
  const byTeam = new Map<string, Elimination>();
  for (const week of weeks) {
    for (const elimination of eliminationsInWeek(fixtures, week)) {
      const key = normalizeTeamName(elimination.team);
      const held = byTeam.get(key);
      if (held && SENDOFF_META[held.stage].order >= SENDOFF_META[elimination.stage].order) continue;
      byTeam.set(key, elimination);
    }
  }
  return [...byTeam.values()].sort(
    (a, b) => SENDOFF_META[a.stage].order - SENDOFF_META[b.stage].order || a.team.localeCompare(b.team),
  );
}

/**
 * The season build as the live surfaces show it during the bracket: every
 * card whose team's split has ended wears its send-off, everyone still in
 * it is an ordinary season card. Browse, the hub, compare, the teams page
 * and a card's own page all go through this, so a player knocked out on
 * Monday IS their send-off everywhere by Tuesday — not only in the pack
 * the shop mints from. The season crown is left alone here: Card of the
 * Week is the season's own judgment, and the edition crowns its own five
 * (crownSendoff) when it prints.
 */
export function stampSendoffs(cards: PlayerCardData[], fixtures: SendoffFixture[]): PlayerCardData[] {
  const eliminations = eliminationsSoFar(fixtures);
  if (eliminations.length === 0) return cards;
  const markByTeam = new Map<string, Elimination>();
  for (const elimination of eliminations) markByTeam.set(normalizeTeamName(elimination.team), elimination);
  return cards.map((card) => {
    const key = normalizeTeamName(card.teamName);
    const elimination = key ? markByTeam.get(key) : undefined;
    if (!elimination) return card;
    return {
      ...card,
      sendoff: { stage: elimination.stage, exit: elimination.exit, team: elimination.team, series: elimination.series, week: elimination.week },
    };
  });
}

/** Days a send-off edition stays on sale after the finals. Long enough that
 *  someone who hears about it can still buy one; short enough that the
 *  stamp means something. */
export const SENDOFF_VAULT_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When every send-off edition of the season closes: the finals fixture's
 * `scheduled_at` plus SENDOFF_VAULT_DAYS, as an ISO instant.
 *
 * Null while no finals fixture carries a date — the season has nowhere to
 * count fourteen days from, and the shop says so rather than inventing a
 * deadline. Two dated finals fixtures is a data error; the LATER one wins,
 * so the mistake sells packs for too long rather than shutting the vault
 * early on people who were promised a fortnight.
 */
export function sendoffVaultClosesAt(fixtures: SendoffFixture[]): string | null {
  let latest: number | null = null;
  for (const fixture of fixtures) {
    if (fixture.stage !== "finals" || !fixture.scheduled_at) continue;
    const at = new Date(fixture.scheduled_at).getTime();
    if (Number.isNaN(at)) continue;
    if (latest === null || at > latest) latest = at;
  }
  return latest === null ? null : new Date(latest + SENDOFF_VAULT_DAYS * DAY_MS).toISOString();
}

/** Has the send-off vault shut? Unknowable (no dated finals) reads as open:
 *  refusing to sell on a date nobody has set would close the shop on a
 *  scheduling gap. */
export function isSendoffVaulted(fixtures: SendoffFixture[], now: Date): boolean {
  const closesAt = sendoffVaultClosesAt(fixtures);
  return closesAt !== null && now.getTime() >= new Date(closesAt).getTime();
}

export interface TeamSendoffStatus {
  team: string;
  /** printed: its send-off has been planned in a week up to `throughWeek`.
   *  alive: in the bracket, not eliminated yet. unscheduled: in no playoff
   *  fixture at all — a regular-season team, or one the bracket has not
   *  reached. */
  status: "printed" | "alive" | "unscheduled";
  stage: SendoffStage | null;
  week: string | null;
  /** How many season cards carry this team — how many cards its send-off
   *  prints (or would print). */
  cards: number;
}

/**
 * The bracket ledger: every team the season's cards or playoff fixtures
 * name, and whether it has printed.
 *
 * Runs eliminationsInWeek over every playoff week up to and including
 * `throughWeek` rather than over the fixtures at large, so the answer is
 * exactly what the drop would have printed week by week — including the
 * "a team keeps its later exit" rule.
 */
export function sendoffLedger(
  seasonCards: PlayerCardData[],
  fixtures: SendoffFixture[],
  throughWeek: string,
): TeamSendoffStatus[] {
  // normalized name -> the spelling to show. Fixtures win: the bracket is
  // where these names are curated, and a card's team_name is ingest output.
  const names = new Map<string, string>();
  const cardCounts = new Map<string, number>();
  for (const card of seasonCards) {
    const key = normalizeTeamName(card.teamName);
    if (!key) continue;
    if (!names.has(key)) names.set(key, card.teamName as string);
    cardCounts.set(key, (cardCounts.get(key) ?? 0) + 1);
  }

  const inBracket = new Set<string>();
  const weeks = new Set<string>();
  for (const fixture of fixtures) {
    if (!isExitStage(fixture.stage) || !fixture.scheduled_at) continue;
    // Bracket membership is not week-filtered — a team scheduled into a
    // round that has not been played yet is alive, and the ledger is meant
    // to show the whole bracket. Only the ELIMINATIONS stop at throughWeek.
    const week = mondayOf(new Date(fixture.scheduled_at));
    if (week <= throughWeek) weeks.add(week);
    for (const team of [fixture.team_a, fixture.team_b]) {
      const key = normalizeTeamName(team);
      if (!key) continue;
      inBracket.add(key);
      names.set(key, team as string);
    }
  }

  const printed = new Map<string, Elimination>();
  for (const week of [...weeks].sort()) {
    for (const elimination of eliminationsInWeek(fixtures, week)) {
      printed.set(normalizeTeamName(elimination.team), elimination);
    }
  }

  return [...names.entries()]
    .map(([key, team]) => {
      const elimination = printed.get(key);
      return {
        team,
        status: elimination ? ("printed" as const) : inBracket.has(key) ? ("alive" as const) : ("unscheduled" as const),
        stage: elimination?.stage ?? null,
        week: elimination?.week ?? null,
        cards: cardCounts.get(key) ?? 0,
      };
    })
    .sort((a, b) => {
      // Printed first, in the order they fell; then everyone still standing.
      const rank = (row: TeamSendoffStatus) =>
        row.status === "printed" ? SENDOFF_META[row.stage as SendoffStage].order : row.status === "alive" ? 100 : 200;
      return rank(a) - rank(b) || a.team.localeCompare(b.team);
    });
}
