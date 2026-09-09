import type { ChampionCount } from "./types";

export interface ScoutingGamePerformance {
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  damageToChampions: number | null;
  durationMinutes: number | null;
  killParticipationPct: number | null;
}

export interface ChampionPerformance {
  /** Distinct accepted games contributing at least one valid metric. */
  statGames: number;
  kdaGames: number;
  damageGames: number;
  kpGames: number;
  kda: number | null;
  damagePerMinute: number | null;
  killParticipationPct: number | null;
}

export interface PlayerChampionStat extends ChampionCount {
  performance: ChampionPerformance;
}

export type NumericPerformanceInput = number | string | null | undefined;

export const EMPTY_SCOUTING_PERFORMANCE: ScoutingGamePerformance = {
  kills: null,
  deaths: null,
  assists: null,
  damageToChampions: null,
  durationMinutes: null,
  killParticipationPct: null,
};

function finiteNumber(value: NumericPerformanceInput): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeScoutingPerformance(input?: Partial<Record<keyof ScoutingGamePerformance, NumericPerformanceInput>> | null): ScoutingGamePerformance {
  return {
    kills: finiteNumber(input?.kills),
    deaths: finiteNumber(input?.deaths),
    assists: finiteNumber(input?.assists),
    damageToChampions: finiteNumber(input?.damageToChampions),
    durationMinutes: finiteNumber(input?.durationMinutes),
    killParticipationPct: finiteNumber(input?.killParticipationPct),
  };
}

/** Merge duplicate rows without making the result depend on input order. */
export function mergeScoutingPerformance(left: ScoutingGamePerformance, right: ScoutingGamePerformance): ScoutingGamePerformance {
  return mergeScoutingPerformances([left, right]);
}

/** Merge an arbitrary set of duplicate samples without order-dependent conflict recovery. */
export function mergeScoutingPerformances(samples: Iterable<ScoutingGamePerformance>): ScoutingGamePerformance {
  const values = [...samples];
  const resolve = (read: (sample: ScoutingGamePerformance) => number | null): number | null => {
    const unique = new Set(values.map(read).filter((value): value is number => value !== null));
    return unique.size === 1 ? [...unique][0] : null;
  };
  return {
    kills: resolve((sample) => sample.kills),
    deaths: resolve((sample) => sample.deaths),
    assists: resolve((sample) => sample.assists),
    damageToChampions: resolve((sample) => sample.damageToChampions),
    durationMinutes: resolve((sample) => sample.durationMinutes),
    killParticipationPct: resolve((sample) => sample.killParticipationPct),
  };
}

function validKda(performance: ScoutingGamePerformance): boolean {
  return [performance.kills, performance.deaths, performance.assists]
    .every((value) => value !== null && value >= 0);
}

function validDamage(performance: ScoutingGamePerformance): boolean {
  return performance.damageToChampions !== null && performance.damageToChampions >= 0
    && performance.durationMinutes !== null && performance.durationMinutes > 0;
}

function validKillParticipation(performance: ScoutingGamePerformance): boolean {
  return performance.killParticipationPct !== null
    && performance.killParticipationPct >= 0
    && performance.killParticipationPct <= 100;
}

export interface ChampionPerformanceSample {
  gameKey: string;
  performance: ScoutingGamePerformance;
}

export interface ScoutingPerformanceAccumulator {
  add(sample: ChampionPerformanceSample): void;
  result(): ChampionPerformance;
}

/** Pure, order-independent accumulator for one player's champion games. */
export function createScoutingPerformanceAccumulator(): ScoutingPerformanceAccumulator {
  const samples = new Map<string, ScoutingGamePerformance[]>();
  return {
    add(sample) {
      const performance = normalizeScoutingPerformance(sample.performance);
      samples.set(sample.gameKey, [...(samples.get(sample.gameKey) ?? []), performance]);
    },
    result() {
      let kdaGames = 0;
      let damageGames = 0;
      let kpGames = 0;
      let statGames = 0;
      let kdaKills = 0;
      let kdaDeaths = 0;
      let kdaAssists = 0;
      let damage = 0;
      let duration = 0;
      let kpTotal = 0;

      for (const duplicateSamples of samples.values()) {
        const performance = mergeScoutingPerformances(duplicateSamples);
        if (validKda(performance) || validDamage(performance) || validKillParticipation(performance)) statGames += 1;
        if (validKda(performance)) {
          kdaGames += 1;
          kdaKills += performance.kills!;
          kdaDeaths += performance.deaths!;
          kdaAssists += performance.assists!;
        }
        if (validDamage(performance)) {
          damageGames += 1;
          damage += performance.damageToChampions!;
          duration += performance.durationMinutes!;
        }
        if (validKillParticipation(performance)) {
          kpGames += 1;
          kpTotal += performance.killParticipationPct!;
        }
      }

      return {
        statGames,
        kdaGames,
        damageGames,
        kpGames,
        kda: kdaGames > 0 ? (kdaKills + kdaAssists) / Math.max(kdaDeaths, 1) : null,
        damagePerMinute: damageGames > 0 ? damage / duration : null,
        killParticipationPct: kpGames > 0 ? kpTotal / kpGames : null,
      };
    },
  };
}
