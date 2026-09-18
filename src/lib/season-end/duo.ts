import { cardPlayerKey } from "@/lib/cards/build";
import { BEST_OF_MIN_PLAYER_GAMES } from "./best-of";
import type { SeasonRow } from "./derive";

export const DUO_FORMULA_VERSION = "duo-impact-v1" as const;
export const DUO_MIN_GAMES = BEST_OF_MIN_PLAYER_GAMES;

export const DUO_COMPONENTS = [
  { key: "kill_participation_pct", label: "Kill participation", weight: 0.35 },
  { key: "kda", label: "KDA", weight: 0.25 },
  { key: "damage_per_min", label: "Champion damage/min", weight: 0.20 },
  { key: "vision_score_per_min", label: "Vision score/min", weight: 0.20 },
] as const;

export type DuoMetricKey = (typeof DUO_COMPONENTS)[number]["key"];
export type DuoRole = "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY";
export type DuoAwardId = "jungle-mid-connection" | "bot-support-connection";

export interface DuoPairDefinition {
  awardId: DuoAwardId;
  roles: readonly [DuoRole, DuoRole];
}

export const DUO_PAIR_DEFINITIONS: readonly DuoPairDefinition[] = [
  { awardId: "jungle-mid-connection", roles: ["JUNGLE", "MIDDLE"] },
  { awardId: "bot-support-connection", roles: ["BOTTOM", "UTILITY"] },
];

export const DUO_IMPACT_WEIGHTS: Record<DuoMetricKey, number> = Object.fromEntries(
  DUO_COMPONENTS.map(({ key, weight }) => [key, weight]),
) as Record<DuoMetricKey, number>;

export interface DuoChampionEvidence {
  championId: string;
  champion: string;
  games: number;
  wins: number;
  losses: number;
  /** Percentage points; never used to rank the Duo Impact score. */
  winRate: number;
  meanPerformance?: number;
}

export interface DuoMemberEvidence {
  playerKey: string;
  name: string;
  role: DuoRole;
  games: number;
  wins: number;
  losses: number;
  /** Percentage points. */
  winRate: number;
  /** The member's unnormalized shared-game means for the four components. */
  rawAverages: Record<DuoMetricKey, number>;
  /** The member's role-relative component percentiles, averaged across shared games. */
  componentScores: Record<DuoMetricKey, number>;
  /** Cosmetic evidence only; it never participates in scoring. */
  champion: DuoChampionEvidence | null;
}

export interface DuoEvidence {
  formulaVersion: typeof DUO_FORMULA_VERSION;
  weights: Record<DuoMetricKey, number>;
  /** Pair-average normalized component scores. */
  componentScores: Record<DuoMetricKey, number>;
  members: readonly [DuoMemberEvidence, DuoMemberEvidence];
  games: number;
  wins: number;
  losses: number;
  /** Percentage points; evidence only, not a scoring input. */
  winRate: number;
}

export interface DuoPairScore {
  key: string;
  team: string;
  members: readonly [
    Pick<DuoMemberEvidence, "playerKey" | "name" | "role">,
    Pick<DuoMemberEvidence, "playerKey" | "name" | "role">,
  ];
  games: number;
  wins: number;
  losses: number;
  winRate: number;
  value: number;
  componentScores: Record<DuoMetricKey, number>;
  memberComponentScores: [Record<DuoMetricKey, number>, Record<DuoMetricKey, number>];
  rawAverages: [Record<DuoMetricKey, number>, Record<DuoMetricKey, number>];
  sharedGames: readonly (readonly [SeasonRow, SeasonRow])[];
}

export type DuoPairScoreResult =
  | { status: "unavailable"; note: string; pairs: [] }
  | { status: "unearned"; note: string; pairs: [] }
  | { status: "ready"; note?: undefined; pairs: DuoPairScore[] };

const finite = (row: SeasonRow, field: string): number | null => {
  const value = row[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const identity = (row: SeasonRow) => `${row.summoner_name}#${row.tag}`;
const teamKey = (team: string) => team.trim().toLowerCase();

/**
 * The midrank convention shared by the season-end performance and Duo Impact
 * calculations. Equal observations receive equal scores and a singleton is
 * deliberately neutral rather than being treated as an extreme.
 */
export function midrankPercentile(value: number, distribution: readonly number[]): number | null {
  if (!Number.isFinite(value) || !distribution.length || distribution.some((candidate) => !Number.isFinite(candidate))) return null;
  if (distribution.length === 1) return 50;
  const countLower = distribution.filter((candidate) => candidate < value).length;
  const countEqual = distribution.filter((candidate) => candidate === value).length;
  return 100 * (countLower + (countEqual - 1) / 2) / (distribution.length - 1);
}

function emptyScores(): Record<DuoMetricKey, number> {
  return Object.fromEntries(DUO_COMPONENTS.map(({ key }) => [key, 0])) as Record<DuoMetricKey, number>;
}

function pairKey(team: string, left: SeasonRow, right: SeasonRow, roles: readonly [DuoRole, DuoRole]): string {
  return [
    teamKey(team),
    cardPlayerKey(left.summoner_name, left.tag),
    roles[0],
    cardPlayerKey(right.summoner_name, right.tag),
    roles[1],
  ].join("|");
}

function coverageNote(definition: DuoPairDefinition, roleRows: Map<DuoRole, SeasonRow[]>): string | null {
  const incomplete = definition.roles.flatMap((role) => {
    const rows = roleRows.get(role) ?? [];
    return DUO_COMPONENTS
      .filter(({ key }) => !rows.length || rows.some((row) => finite(row, key) === null))
      .map(({ label }) => `${role} ${label}`);
  });
  if (!incomplete.length) return null;
  return `Duo Impact is unavailable because required reference coverage is incomplete for ${incomplete.join(", ")}.`;
}

/**
 * Build both the pair observations and the role-specific reference pools.
 * Every team game must have exactly one participant in each awarded role;
 * silently choosing one of two malformed participants would make the result
 * depend on ingestion order.
 */
export function scoreDuoPairs(
  rows: readonly SeasonRow[],
  teamGames: readonly SeasonRow[][],
  definition: DuoPairDefinition,
  minGames = DUO_MIN_GAMES,
): DuoPairScoreResult {
  const grouped = new Map<string, { team: string; members: DuoPairScore["members"]; games: Array<readonly [SeasonRow, SeasonRow]> }>();
  let malformed = false;

  for (const game of teamGames) {
    const [leftRole, rightRole] = definition.roles;
    const left = game.filter((row) => row.role === leftRole);
    const right = game.filter((row) => row.role === rightRole);
    if (left.length !== 1 || right.length !== 1) {
      malformed = true;
      continue;
    }

    const [leftRow] = left;
    const [rightRow] = right;
    const key = pairKey(leftRow.team_name, leftRow, rightRow, definition.roles);
    const current: { team: string; members: DuoPairScore["members"]; games: Array<readonly [SeasonRow, SeasonRow]> } = grouped.get(key) ?? {
      team: leftRow.team_name,
      members: [
        { playerKey: cardPlayerKey(leftRow.summoner_name, leftRow.tag), name: identity(leftRow), role: leftRole },
        { playerKey: cardPlayerKey(rightRow.summoner_name, rightRow.tag), name: identity(rightRow), role: rightRole },
      ] as const,
      games: [],
    };
    current.games.push([leftRow, rightRow]);
    grouped.set(key, current);
  }

  if (malformed) {
    return {
      status: "unavailable",
      note: `Duo Impact is unavailable because one or more games do not have exactly one ${definition.roles[0]} and one ${definition.roles[1]} participant on a team.`,
      pairs: [],
    };
  }

  const eligible = [...grouped.entries()].filter(([, pair]) => pair.games.length >= minGames);
  if (!eligible.length) {
    return { status: "unearned", note: `No ${definition.roles[0].toLowerCase()}–${definition.roles[1].toLowerCase()} pair has at least ${minGames} shared regular-season games.`, pairs: [] };
  }

  const roleRows = new Map<DuoRole, SeasonRow[]>(definition.roles.map((role) => [role, rows.filter((row) => row.role === role)]));
  const coverage = coverageNote(definition, roleRows);
  if (coverage) return { status: "unavailable", note: coverage, pairs: [] };

  const references = new Map<DuoRole, Record<DuoMetricKey, number[]>>();
  for (const role of definition.roles) {
    references.set(role, Object.fromEntries(DUO_COMPONENTS.map(({ key }) => [
      key,
      (roleRows.get(role) ?? []).map((row) => finite(row, key)!),
    ])) as Record<DuoMetricKey, number[]>);
  }

  const pairs = eligible.map(([key, pair]): DuoPairScore => {
    const memberComponentSums = [emptyScores(), emptyScores()] as [Record<DuoMetricKey, number>, Record<DuoMetricKey, number>];
    const componentSums = emptyScores();
    const rawSums = [emptyScores(), emptyScores()] as [Record<DuoMetricKey, number>, Record<DuoMetricKey, number>];
    let pairScore = 0;

    for (const [leftRow, rightRow] of pair.games) {
      for (const [memberIndex, row] of [leftRow, rightRow].entries()) {
        const roleReference = references.get(definition.roles[memberIndex])!;
        for (const { key: metric, weight } of DUO_COMPONENTS) {
          const raw = finite(row, metric)!;
          const percentile = midrankPercentile(raw, roleReference[metric])!;
          memberComponentSums[memberIndex][metric] += percentile;
          rawSums[memberIndex][metric] += raw;
          componentSums[metric] += percentile / 2;
          pairScore += percentile * weight / 2;
        }
      }
    }

    const games = pair.games.length;
    const memberComponentScores = memberComponentSums.map((scores) => Object.fromEntries(
      DUO_COMPONENTS.map(({ key: metric }) => [metric, scores[metric] / games]),
    )) as [Record<DuoMetricKey, number>, Record<DuoMetricKey, number>];
    const componentScores = Object.fromEntries(
      DUO_COMPONENTS.map(({ key: metric }) => [metric, componentSums[metric] / games]),
    ) as Record<DuoMetricKey, number>;
    const rawAverages = rawSums.map((sums) => Object.fromEntries(
      DUO_COMPONENTS.map(({ key: metric }) => [metric, sums[metric] / games]),
    )) as [Record<DuoMetricKey, number>, Record<DuoMetricKey, number>];
    const wins = pair.games.filter(([leftRow]) => leftRow.win).length;

    return {
      key,
      team: pair.team,
      members: pair.members,
      games,
      wins,
      losses: games - wins,
      winRate: 100 * wins / games,
      value: pairScore / games,
      componentScores,
      memberComponentScores,
      rawAverages,
      sharedGames: pair.games,
    };
  });

  return { status: "ready", pairs };
}
