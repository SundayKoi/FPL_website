export type BoxScoreStatus = "playing" | "won" | "lost";
export type BoxScoreRevealStage = "role" | "champion" | "combat" | "damage" | "economy" | "final";

export interface BoxScoreCandidate {
  slug: string;
  name: string;
  tag: string;
  role: string;
}

/** Internal snapshot. Keep this type on the server when constructing it. */
export interface BoxScoreTarget {
  slug: string;
  name: string;
  tag: string;
  role: string;
  champion: string;
  championArtUrl: string | null;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  killParticipationPct: number;
  totalDamage: number;
  damagePerMin: number;
  damageSharePct: number;
  cs: number;
  csPerMin: number;
  gold: number;
  goldPerMin: number;
  csAt10: number;
  goldAt10: number;
  team: string;
  date: string;
  result: "win" | "loss";
  side: string;
  durationMin: number;
  visionScore: number;
  objectives: number;
  damageTaken: number;
  damageMitigated: number;
  healing: number;
  multikills: {
    doubles: number;
    triples: number;
    quadras: number;
    pentas: number;
  };
  soloKills: number;
  turretDamage: number;
  objectiveDamage: number;
}

export interface BoxScoreSnapshot {
  date: string;
  expiresAt: string;
  candidates: BoxScoreCandidate[];
  target: BoxScoreTarget;
}

export interface BoxScoreReveal {
  stage: BoxScoreRevealStage;
  role: string;
  champion: { name: string; artUrl: string | null } | null;
  combat: {
    kills: number;
    deaths: number;
    assists: number;
    kda: number;
    killParticipationPct: number;
  } | null;
  damage: { total: number; perMin: number; sharePct: number } | null;
  economy: {
    cs: number;
    csPerMin: number;
    gold: number;
    goldPerMin: number;
    csAt10: number;
    goldAt10: number;
  } | null;
  final: {
    slug: string;
    name: string;
    tag: string;
    team: string;
    date: string;
    result: "win" | "loss";
    side: string;
    durationMin: number;
  } | null;
  cardBack: {
    visionScore: number;
    objectives: number;
    damageTaken: number;
    damageMitigated: number;
    healing: number;
    multikills: BoxScoreTarget["multikills"];
    soloKills: number;
    turretDamage: number;
    objectiveDamage: number;
  } | null;
  canFlip: boolean;
}

/**
 * Convert private target data into the exact clue stage the player has earned.
 * This is the only reveal seam: locked fields stay null until their miss, and
 * identity/card-back fields stay private until the game is complete.
 */
export function revealBoxScore(
  snapshot: BoxScoreSnapshot,
  wrongGuesses: readonly string[],
  status: BoxScoreStatus,
): BoxScoreReveal {
  const gameOver = status !== "playing" || wrongGuesses.length >= 5;
  const stage: BoxScoreRevealStage = gameOver
    ? "final"
    : wrongGuesses.length >= 4
      ? "economy"
      : wrongGuesses.length >= 3
        ? "damage"
        : wrongGuesses.length >= 2
          ? "combat"
          : wrongGuesses.length >= 1
            ? "champion"
            : "role";
  const showsChampion = stage !== "role";
  const showsCombat = stage === "combat" || stage === "damage" || stage === "economy" || stage === "final";
  const showsDamage = stage === "damage" || stage === "economy" || stage === "final";
  const showsEconomy = stage === "economy" || stage === "final";
  const complete = status === "won";

  return {
    stage,
    role: snapshot.target.role,
    champion: showsChampion
      ? { name: snapshot.target.champion, artUrl: snapshot.target.championArtUrl }
      : null,
    combat: showsCombat
      ? {
          kills: snapshot.target.kills,
          deaths: snapshot.target.deaths,
          assists: snapshot.target.assists,
          kda: snapshot.target.kda,
          killParticipationPct: snapshot.target.killParticipationPct,
        }
      : null,
    damage: showsDamage
      ? {
          total: snapshot.target.totalDamage,
          perMin: snapshot.target.damagePerMin,
          sharePct: snapshot.target.damageSharePct,
        }
      : null,
    economy: showsEconomy
      ? {
          cs: snapshot.target.cs,
          csPerMin: snapshot.target.csPerMin,
          gold: snapshot.target.gold,
          goldPerMin: snapshot.target.goldPerMin,
          csAt10: snapshot.target.csAt10,
          goldAt10: snapshot.target.goldAt10,
        }
      : null,
    final: gameOver
      ? {
          slug: snapshot.target.slug,
          name: snapshot.target.name,
          tag: snapshot.target.tag,
          team: snapshot.target.team,
          date: snapshot.target.date,
          result: snapshot.target.result,
          side: snapshot.target.side,
          durationMin: snapshot.target.durationMin,
        }
      : null,
    cardBack: complete
      ? {
          visionScore: snapshot.target.visionScore,
          objectives: snapshot.target.objectives,
          damageTaken: snapshot.target.damageTaken,
          damageMitigated: snapshot.target.damageMitigated,
          healing: snapshot.target.healing,
          multikills: snapshot.target.multikills,
          soloKills: snapshot.target.soloKills,
          turretDamage: snapshot.target.turretDamage,
          objectiveDamage: snapshot.target.objectiveDamage,
        }
      : null,
    canFlip: complete,
  };
}
