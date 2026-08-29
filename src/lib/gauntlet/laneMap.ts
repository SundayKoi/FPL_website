// Where everybody is standing, at a given minute.
//
// A pure function of the tape and the clock: hand it the same clock
// MatchTheatre is already running and it answers with ten positions. No
// physics, no per-frame state — the component transitions between whatever
// two frames it is handed, which is what makes the movement free and this
// file testable.
//
// WHAT IT KNOWS, AND WHAT IT DOES NOT. The sim resolves lanes, fights,
// objectives, the pit and the nexus, each with a clock and a side. It does
// NOT resolve who died at 14:22. So the map stages what it actually knows
// — a lost fight pushes your five back and greys them for a beat, a won
// lane creeps that lane forward — and never invents a per-kill story it
// would be making up. Deaths on the scoreboard are totals; the bodies here
// are a dramatisation of beats, not a claim about any one of them.

import type { GauntletRole, LaneResult, MatchEvent } from "./sim";

/** The map is a 100x100 box. Your base is bottom-left, theirs top-right —
 *  blue side, which is the orientation every League player already reads. */
export interface Spot {
  x: number;
  y: number;
}

export interface Token {
  role: GauntletRole;
  side: "yours" | "theirs";
  champion: string;
  name: string;
  x: number;
  y: number;
  /** Knocked down by the beat playing right now — greyed, not gone. */
  down: boolean;
  /** This side just won the beat: the token leans in. */
  surging: boolean;
}

export const YOUR_BASE: Spot = { x: 8, y: 92 };
export const THEIR_BASE: Spot = { x: 92, y: 8 };
export const PIT: Spot = { x: 63, y: 37 };

/** Lane paths, base to base. A role sits somewhere along its own lane, and
 *  `push` slides it: 0 is your tower, 1 is theirs. */
const LANES: Record<GauntletRole, [Spot, Spot]> = {
  Top: [{ x: 10, y: 62 }, { x: 38, y: 10 }],
  Jungle: [{ x: 30, y: 68 }, { x: 62, y: 40 }],
  Mid: [{ x: 32, y: 68 }, { x: 68, y: 32 }],
  Bot: [{ x: 62, y: 90 }, { x: 90, y: 38 }],
  Support: [{ x: 58, y: 92 }, { x: 86, y: 42 }],
};

function along([from, to]: [Spot, Spot], push: number): Spot {
  const t = Math.max(0, Math.min(1, push));
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

/** Mirror a spot through the middle — the enemy's version of a lane slot. */
function mirror(spot: Spot): Spot {
  return { x: 100 - spot.x, y: 100 - spot.y };
}

/** A small stable wobble so five tokens converging don't stack exactly. */
function spread(index: number): Spot {
  const angle = (index / 5) * Math.PI * 2;
  return { x: Math.cos(angle) * 7, y: Math.sin(angle) * 7 };
}

export interface FrameInput {
  events: MatchEvent[];
  lanes: LaneResult[];
  yours: { role: GauntletRole; name: string; champion: string }[];
  theirs: { role: GauntletRole; name: string; champion: string }[];
  clock: number;
  /** True once the match is decided, so the winner can march. */
  won?: boolean | null;
}

/** The beat currently on screen — the last event at or before the clock. */
export function beatAt(events: MatchEvent[], clock: number): MatchEvent | null {
  let current: MatchEvent | null = null;
  for (const event of events) {
    if (event.clock !== null && event.clock <= clock) current = event;
  }
  return current;
}

/**
 * Ten tokens, positioned for `clock`.
 *
 * The stages, in the order they override each other: everyone starts in
 * base, walks to lane, and creeps along it as the lane results land. A
 * fight or an objective pulls both sides to where it happened. The pit
 * pulls everyone to the pit. The nexus sends the winner into the loser's
 * base and leaves the loser standing in it.
 */
export function laneFrame(input: FrameInput): Token[] {
  const { events, lanes, yours, theirs, clock } = input;
  const beat = beatAt(events, clock);
  const laneByRole = new Map(lanes.map((lane) => [lane.role, lane]));

  // Pre-game: everyone is still on the fountain.
  const inBase = clock < 1.5;

  function place(
    side: "yours" | "theirs",
    card: { role: GauntletRole; name: string; champion: string },
    index: number,
  ): Token {
    const home = side === "yours" ? YOUR_BASE : THEIR_BASE;
    const lane = laneByRole.get(card.role);
    // A won lane creeps forward; a lost one is pushed back under tower.
    // Capped well short of the enemy base — this is lane state, not a win.
    const won = lane ? (side === "yours" ? lane.won : !lane.won) : false;
    const pressure = lane ? Math.min(0.3, Math.abs(lane.margin) / 60) : 0;
    const push = 0.42 + (won ? pressure : -pressure);
    const lanePath = LANES[card.role];
    const laneSpot = side === "yours" ? along(lanePath, push) : mirror(along(lanePath, push));

    let spot: Spot = inBase ? home : laneSpot;
    let down = false;
    let surging = false;

    if (beat && !inBase) {
      const yoursWon = beat.tone === "win";
      const mine = side === "yours";
      const nudge = spread(index);
      if (beat.kind === "baron") {
        spot = { x: PIT.x + nudge.x, y: PIT.y + nudge.y };
        surging = mine === yoursWon;
        down = mine !== yoursWon && beat.tone !== "neutral";
      } else if (beat.kind === "fight" || beat.kind === "objective") {
        // Both sides meet where it happened. A won fight for you happens
        // closer to their half, which is the honest read of pressure.
        const centre = yoursWon ? { x: 58, y: 42 } : { x: 42, y: 58 };
        spot = { x: centre.x + nudge.x, y: centre.y + nudge.y };
        surging = mine === yoursWon;
        down = mine !== yoursWon;
      } else if (beat.kind === "nexus") {
        const marching = yoursWon ? "yours" : "theirs";
        const target = yoursWon ? THEIR_BASE : YOUR_BASE;
        spot = mine === (marching === "yours")
          ? { x: target.x + nudge.x * 0.6, y: target.y + nudge.y * 0.6 }
          : { x: (mine ? YOUR_BASE : THEIR_BASE).x, y: (mine ? YOUR_BASE : THEIR_BASE).y };
        surging = mine === yoursWon;
        down = mine !== yoursWon;
      }
    }

    return {
      role: card.role,
      side,
      champion: card.champion,
      name: card.name,
      x: Math.max(3, Math.min(97, spot.x)),
      y: Math.max(3, Math.min(97, spot.y)),
      down,
      surging,
    };
  }

  return [
    ...yours.map((card, index) => place("yours", card, index)),
    ...theirs.map((card, index) => place("theirs", card, index)),
  ];
}
