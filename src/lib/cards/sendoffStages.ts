// The Send-off's vocabulary: the stages a split can end at, the fixture
// stages that end one, the mark a send-off print carries, and the words and
// colours each stage prints with. Pure constants and labels, split out of
// sendoff.ts (which re-exports them) so the card renderer can name a stamp
// without pulling in the bracket planner.

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

/** Whether a fixture stage is one that ends somebody's split. */
const EXIT_STAGE_SET: ReadonlySet<string> = new Set<string>(SENDOFF_EXIT_STAGES);

export function isExitStage(stage: string | null | undefined): stage is SendoffExitStage {
  return typeof stage === "string" && EXIT_STAGE_SET.has(stage);
}
