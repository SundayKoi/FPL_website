// The autopsy: what the match says about the match.
//
// Teamfight Manager's design question after a loss is "was it roster,
// draft, tactics or execution?" — the result screen exists to answer the
// NEXT decision, not to announce the last one. This module answers it
// from the contest ledger alone: no new rolls, no hidden state, and no
// invented drama. Everything it claims is a number the match recorded.
//
// Four findings, always in the same slots so a player learns where to
// look: the verdict, the closest call (with what would have flipped it),
// the biggest swing, and the weak link.

import type { Contest } from "./contest";
import type { MatchResult } from "./sim";

export interface AutopsyFinding {
  label: string;
  clock: number;
  headline: string;
  detail: string;
  /** What would have changed it — the actionable half. */
  counter: string | null;
}

export interface Autopsy {
  /** The one-line read: what kind of game this was. */
  verdict: string;
  detail: string;
  closest: AutopsyFinding | null;
  swing: AutopsyFinding | null;
  weakLink: AutopsyFinding | null;
  stats: {
    fightsWon: number;
    fightsTotal: number;
    contestsWon: number;
    contestsTotal: number;
    lanesWon: number;
    peakGold: number;
    lowGold: number;
    avgMargin: number;
  };
}

/** Which relic would have supplied the points a lost check needed. Only
 *  named when the relic actually covers the gap — a suggestion that
 *  wouldn't have worked is worse than none. */
function relicCounter(contest: Contest, need: number): string | null {
  const options: { keys: Contest["kind"][]; title: string; gives: number }[] = [
    { keys: ["baron", "objective"], title: "SMITE TAX (+10 objectives)", gives: 10 },
    { keys: ["baron", "objective"], title: "PIT BOSS (+6 objectives)", gives: 6 },
    { keys: ["fight"], title: "GLASS CANNON (+8 fights)", gives: 8 },
    { keys: ["fight"], title: "OVERTIME (+6 fights)", gives: 6 },
    { keys: ["hold"], title: "DEEP WARDS (+8 hold)", gives: 8 },
    { keys: ["crossroads"], title: "THE SHOT CALLER (+8 crossroads)", gives: 8 },
  ];
  const fits = options
    .filter((option) => option.keys.includes(contest.kind) && option.gives >= need)
    .sort((a, b) => a.gives - b.gives)[0];
  return fits ? fits.title : null;
}

function describeContest(contest: Contest): string {
  const need = Math.ceil(Math.abs(contest.margin));
  const relic = relicCounter(contest, need);
  const stat = contest.yourKeys.join(" + ");
  return relic
    ? `${relic} flips this. So does ${need} more ${stat}.`
    : `${need} more ${stat} flips this — that's a different card, not a different call.`;
}

/**
 * Reads a finished match and writes its four findings. Pure: same result
 * in, same autopsy out, so it can be recomputed from a stored tape.
 */
export function buildAutopsy(result: Omit<MatchResult, "score">, lanesWon: number): Autopsy {
  const contests = result.contests;
  const decisive = contests.filter((contest) => contest.kind !== "lane");
  const fights = contests.filter((contest) => contest.kind === "fight");
  const fightsWon = fights.filter((contest) => contest.won).length;
  const contestsWon = contests.filter((contest) => contest.won).length;
  const avgMargin =
    contests.length > 0 ? contests.reduce((sum, contest) => sum + contest.margin, 0) / contests.length : 0;
  const peakGold = result.goldSeries.reduce((peak, sample) => Math.max(peak, sample.diff), 0);
  const lowGold = result.goldSeries.reduce((low, sample) => Math.min(low, sample.diff), 0);

  // ── Closest call: the loss that came nearest to being a win.
  const losses = decisive.filter((contest) => !contest.won);
  const closestContest = [...losses].sort((a, b) => Math.abs(a.margin) - Math.abs(b.margin))[0] ?? null;
  const closest: AutopsyFinding | null = closestContest
    ? {
        label: closestContest.label,
        clock: closestContest.clock,
        headline:
          closestContest.kind === "baron" && result.baron.stolen
            ? `Baron at ${result.baron.hpAtResolve}% — ${result.baron.shortBy} damage short`
            : `${closestContest.label} — lost by ${Math.abs(closestContest.margin).toFixed(1)}`,
        detail:
          `Your ${closestContest.yourKeys.join(" + ")} read ${closestContest.yourVal} against their ` +
          `${closestContest.theirVal}, and the roll gave you ${closestContest.roll >= 0 ? "+" : ""}${closestContest.roll}.`,
        counter: describeContest(closestContest),
      }
    : null;

  // ── The swing: the beat that moved the most gold against you (or for
  //   you, in a win) — the moment the game turned.
  const swingContest = [...contests].sort((a, b) => Math.abs(b.goldSwing) - Math.abs(a.goldSwing))[0] ?? null;
  const swing: AutopsyFinding | null = swingContest
    ? {
        label: swingContest.label,
        clock: swingContest.clock,
        headline: `${swingContest.label} — ${swingContest.goldSwing >= 0 ? "+" : "−"}${Math.abs(swingContest.goldSwing).toLocaleString()} gold`,
        detail: swingContest.won
          ? "The biggest swing of the match, and it went your way."
          : "The biggest swing of the match, and it went theirs. Everything after it was uphill.",
        counter: null,
      }
    : null;

  // ── The weak link: worst role by contests lost, deaths and share.
  const ranked = [...result.players].sort((a, b) => {
    const scoreA = a.contestsLost * 2 + a.deaths - a.contestsWon * 2 - a.kills;
    const scoreB = b.contestsLost * 2 + b.deaths - b.contestsWon * 2 - b.kills;
    return scoreB - scoreA;
  });
  const worst = ranked[0] ?? null;
  const weakLink: AutopsyFinding | null =
    worst && (worst.contestsLost > 0 || worst.deaths > 1)
      ? {
          label: `${worst.role} — ${worst.name}`,
          clock: 0,
          headline: `${worst.role} lane, ${worst.damageShare}% of your damage`,
          detail:
            `${worst.name} went ${worst.kills}/${worst.deaths}/${worst.assists} and lost ` +
            `${worst.contestsLost} of the ${worst.contestsWon + worst.contestsLost} checks they were on.`,
          counter:
            worst.damageShare < 18
              ? "A bigger damage bar in this slot changes every fight you took."
              : "The bars were there — this slot lost its checks, not its stats.",
        }
      : null;

  // ── The verdict: name the KIND of game, from the ledger.
  let verdict: string;
  let detail: string;
  const fightRate = fights.length > 0 ? fightsWon / fights.length : 0.5;
  const tight = Math.abs(avgMargin) < 4.5;

  if (result.won) {
    if (peakGold < 400 && result.gold > 0) {
      verdict = "You won it from behind.";
      detail = `Never more than ${peakGold.toLocaleString()}g ahead until the end. This one was taken, not received.`;
    } else if (fightRate >= 0.75) {
      verdict = "You won the fights and cashed them.";
      detail = `${fightsWon} of ${fights.length} teamfights, ${result.gold >= 0 ? "+" : ""}${result.gold.toLocaleString()}g at the whistle.`;
    } else {
      verdict = "You won the map.";
      detail = `${contestsWon} of ${contests.length} checks and ${lanesWon} lanes — the fights were incidental.`;
    }
  } else if (fightRate >= 0.6 && result.baron.stolen) {
    verdict = "You won the fights and lost the pit.";
    detail = `${fightsWon} of ${fights.length} teamfights and a Baron ${result.baron.shortBy} damage from yours. This wasn't a draft problem.`;
  } else if (fightRate >= 0.6) {
    verdict = "You won the fights and lost the map.";
    detail = `${fightsWon} of ${fights.length} teamfights won, and still ${Math.abs(result.gold).toLocaleString()}g behind. Objectives, not combat.`;
  } else if (lanesWon <= 1) {
    verdict = "Your lanes lost it before the map opened.";
    detail = `${lanesWon} of 5 lanes, ${lowGold.toLocaleString()}g at the worst of it. The mid-game never had a chance to matter.`;
  } else if (peakGold >= 1800) {
    verdict = `You were ${peakGold.toLocaleString()}g ahead and gave it back.`;
    detail = "The lead was real. The close-out wasn't.";
  } else if (tight) {
    verdict = "Coin-flip game. Variance took this one.";
    detail = `Average margin ${avgMargin.toFixed(1)} across ${contests.length} checks — nothing here was decided by much.`;
  } else {
    verdict = "Out-statted, plainly.";
    detail = `${contestsWon} of ${contests.length} checks won at an average margin of ${avgMargin.toFixed(1)}. This bracket wants a stronger five.`;
  }

  return {
    verdict,
    detail,
    closest,
    swing,
    weakLink,
    stats: {
      fightsWon,
      fightsTotal: fights.length,
      contestsWon,
      contestsTotal: contests.length,
      lanesWon,
      peakGold,
      lowGold,
      avgMargin: Math.round(avgMargin * 10) / 10,
    },
  };
}
