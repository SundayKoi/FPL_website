// What each game on the Play tab has to say about the viewer this week.
//
// The Play index used to be a list of five names with a line of blurb each,
// which told you what Fantasy IS but not whether your lineup was in. Each
// game now reports its own state in one line: lineup in or not and when it
// locks, a run in progress or this week's best, a squad out and when it is
// back, tickets held. Pure, from reads the page gathers, so the wording is
// a test and not a guess.

import { currentFantasyWeek, lockTimeOf } from "@/lib/fantasy/week";
import type { ExpeditionRun } from "@/lib/expeditions/queries";
import { openFork } from "@/lib/expeditions/routes";
import { editionLabel } from "@/lib/packs/week";

export type PlayTone = "open" | "waiting" | "done" | "quiet";

export interface PlayStatus {
  text: string;
  tone: PlayTone;
}

export interface PlayStatusInput {
  now: Date;
  /** Whether the viewer has a lineup in for the editable fantasy week. Null
   *  when nobody is looking. */
  fantasyLineupIn: boolean | null;
  /** The Gauntlet, premier only: null when there is no such game here. */
  gauntlet: { active: boolean; bestScore: number; attempts: number } | null;
  /** Showdown, premier only: null where there is no such game. `seated`
   *  is whether the viewer has a seat right now; `openTables` how many
   *  tables are dealing. Both zero until the tables land. */
  showdown: { seated: boolean; openTables: number } | null;
  expeditions: ExpeditionRun[];
  /** Copies held — every one is a draw ticket. */
  copies: number;
}

/** "Mon 6:00 PM ET" — the league's clock. */
function eastern(date: Date): string {
  return date.toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

export type PlayGame = "fantasy" | "gauntlet" | "showdown" | "expeditions" | "draw" | "stats";

export function playStatuses({ now, fantasyLineupIn, gauntlet, showdown, expeditions, copies }: PlayStatusInput): Partial<Record<PlayGame, PlayStatus>> {
  const statuses: Partial<Record<PlayGame, PlayStatus>> = {};

  const week = currentFantasyWeek(now);
  const lock = lockTimeOf(week);
  if (fantasyLineupIn === null) {
    statuses.fantasy = { text: `${editionLabel(week)} lineups lock ${eastern(lock)}`, tone: "quiet" };
  } else if (fantasyLineupIn) {
    statuses.fantasy = { text: `Your ${editionLabel(week)} lineup is in · locks ${eastern(lock)}`, tone: "done" };
  } else {
    statuses.fantasy = { text: `No ${editionLabel(week)} lineup yet · locks ${eastern(lock)}`, tone: "open" };
  }

  if (gauntlet) {
    if (gauntlet.active) {
      statuses.gauntlet = { text: "A run is in progress — pick it back up", tone: "open" };
    } else if (gauntlet.attempts > 0) {
      statuses.gauntlet = {
        text: `Best this week ${gauntlet.bestScore.toLocaleString()} · ${gauntlet.attempts} run${gauntlet.attempts === 1 ? "" : "s"}`,
        tone: "done",
      };
    } else {
      statuses.gauntlet = { text: "No runs this week yet", tone: "quiet" };
    }
  }

  if (showdown) {
    if (showdown.seated) {
      statuses.showdown = { text: "You have a seat — back to the table", tone: "open" };
    } else if (showdown.openTables > 0) {
      statuses.showdown = {
        text: `${showdown.openTables} table${showdown.openTables === 1 ? "" : "s"} dealing now`,
        tone: "waiting",
      };
    } else {
      statuses.showdown = { text: "Tables open soon — read the rules", tone: "quiet" };
    }
  }

  // Holds ('lost') are not squads in the field; they read as missing cards.
  const runs = expeditions.filter((run) => run.tier !== "lost");
  const lost = expeditions.filter((run) => run.tier === "lost" && !run.claimedAt);
  const out = runs.filter((run) => !run.outcome && new Date(run.resolvesAt).getTime() > now.getTime());
  const backUnclaimed = runs.filter((run) => (run.outcome || new Date(run.resolvesAt).getTime() <= now.getTime()) && !run.claimedAt);
  const atFork = out
    .map((run) => ({ run, fork: run.claimedAt === null && run.forks > 0 ? openFork(run, now) : null }))
    .filter((entry) => entry.fork !== null);
  if (atFork.length > 0) {
    const soonest = atFork.reduce((a, b) => (a.fork!.closesAt < b.fork!.closesAt ? a : b));
    statuses.expeditions = {
      text: `${atFork.length === 1 ? "A squad is" : `${atFork.length} squads are`} waiting at a fork — decide by ${eastern(soonest.fork!.closesAt)}`,
      tone: "open",
    };
  } else if (lost.length > 0 && backUnclaimed.length === 0) {
    const soonest = lost.reduce((a, b) => (a.resolvesAt < b.resolvesAt ? a : b));
    statuses.expeditions = {
      text: `${lost.length === 1 ? "A card is" : `${lost.length} cards are`} missing — rescue or ransom by ${eastern(new Date(soonest.resolvesAt))}`,
      tone: "open",
    };
  } else if (backUnclaimed.length > 0) {
    statuses.expeditions = {
      text: `${backUnclaimed.length === 1 ? "A squad is" : `${backUnclaimed.length} squads are`} back — collect what they brought`,
      tone: "waiting",
    };
  } else if (out.length > 0) {
    const soonest = out.reduce((a, b) => (a.resolvesAt < b.resolvesAt ? a : b));
    statuses.expeditions = {
      text: `${out.length === 1 ? "A squad is" : `${out.length} squads are`} out · back ${eastern(new Date(soonest.resolvesAt))}`,
      tone: "done",
    };
  } else {
    statuses.expeditions = { text: "Nothing out — send three cards", tone: "quiet" };
  }

  statuses.draw =
    copies > 0
      ? { text: `${copies.toLocaleString()} ticket${copies === 1 ? "" : "s"} in Tuesday's draw`, tone: "done" }
      : { text: "No tickets yet — every card you open is one", tone: "quiet" };

  return statuses;
}
