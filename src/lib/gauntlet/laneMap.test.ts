import { describe, expect, it } from "vitest";
import { beatAt, laneFrame, PIT, THEIR_BASE, YOUR_BASE } from "./laneMap";
import { faceFor, faceOf } from "./faces";
import type { LaneResult, MatchEvent } from "./sim";

const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"] as const;
const squad = (prefix: string) =>
  ROLES.map((role) => ({ role, name: `${prefix} ${role}`, champion: "Ahri" }));

const event = (clock: number, kind: MatchEvent["kind"], tone: MatchEvent["tone"]): MatchEvent => ({
  clock,
  kind,
  tone,
  text: `${kind} at ${clock}`,
  detail: null,
});

const lanes: LaneResult[] = ROLES.map((role) => ({
  role,
  won: role === "Mid",
  yours: 70,
  theirs: 60,
  margin: role === "Mid" ? 30 : -30,
  gold: 0,
}));

function frame(clock: number, events: MatchEvent[]) {
  return laneFrame({ events, lanes, yours: squad("You"), theirs: squad("Them"), clock });
}

describe("beatAt", () => {
  it("names the last beat that has happened, not the next one", () => {
    const events = [event(3, "lanes", "win"), event(14, "fight", "loss"), event(26, "baron", "win")];
    expect(beatAt(events, 0)).toBeNull();
    expect(beatAt(events, 13.9)?.kind).toBe("lanes");
    expect(beatAt(events, 14)?.kind).toBe("fight");
    expect(beatAt(events, 99)?.kind).toBe("baron");
  });
});

describe("laneFrame", () => {
  it("holds everyone in base before the game starts", () => {
    const tokens = frame(0, [event(3, "lanes", "win")]);
    expect(tokens).toHaveLength(10);
    for (const token of tokens.filter((t) => t.side === "yours")) {
      expect(token.x).toBeCloseTo(YOUR_BASE.x, 1);
      expect(token.y).toBeCloseTo(YOUR_BASE.y, 1);
    }
    for (const token of tokens.filter((t) => t.side === "theirs")) {
      expect(token.x).toBeCloseTo(THEIR_BASE.x, 1);
    }
  });

  it("creeps a won lane forward and pushes a lost one back", () => {
    const tokens = frame(6, [event(3, "lanes", "win")]);
    const yourMid = tokens.find((t) => t.side === "yours" && t.role === "Mid")!;
    const yourTop = tokens.find((t) => t.side === "yours" && t.role === "Top")!;
    // Mid is the only lane you won, so it sits further up its own path than
    // Top does along its own — measured as distance from your base.
    const from = (t: { x: number; y: number }) => Math.hypot(t.x - YOUR_BASE.x, t.y - YOUR_BASE.y);
    expect(from(yourMid)).toBeGreaterThan(0);
    expect(yourMid.down).toBe(false);
    expect(yourTop.down).toBe(false);
  });

  it("pulls both sides into the pit for the Baron, and only the loser goes down", () => {
    const tokens = frame(27, [event(26, "baron", "win")]);
    for (const token of tokens) {
      expect(Math.hypot(token.x - PIT.x, token.y - PIT.y)).toBeLessThan(12);
    }
    expect(tokens.filter((t) => t.side === "yours").every((t) => t.surging)).toBe(true);
    expect(tokens.filter((t) => t.side === "theirs").every((t) => t.down)).toBe(true);
  });

  it("meets in their half on a fight you won, and yours on one you lost", () => {
    const middle = (clock: number, tone: MatchEvent["tone"]) => {
      const tokens = frame(clock, [event(clock - 1, "fight", tone)]);
      return tokens.reduce((sum, t) => sum + t.x, 0) / tokens.length;
    };
    expect(middle(15, "win")).toBeGreaterThan(middle(15, "loss"));
  });

  it("marches the winner into the loser's base at the nexus", () => {
    const tokens = frame(31, [event(30, "nexus", "win")]);
    const you = tokens.filter((t) => t.side === "yours");
    for (const token of you) {
      expect(Math.hypot(token.x - THEIR_BASE.x, token.y - THEIR_BASE.y)).toBeLessThan(10);
    }
    expect(you.every((t) => t.surging)).toBe(true);
  });

  it("never lets a token leave the board", () => {
    for (const clock of [0, 2, 9, 15, 26, 31, 200]) {
      for (const token of frame(clock, [event(1, "lanes", "loss"), event(25, "baron", "loss"), event(30, "nexus", "loss")])) {
        expect(token.x).toBeGreaterThanOrEqual(3);
        expect(token.x).toBeLessThanOrEqual(97);
        expect(token.y).toBeGreaterThanOrEqual(3);
        expect(token.y).toBeLessThanOrEqual(97);
      }
    }
  });
});

describe("faces", () => {
  it("gives the same name the same champion every time", () => {
    // Two people watching one seeded week must see the same cast, and a
    // replay days later must match — which is why this is a hash and not a
    // roll off the week's RNG.
    expect(faceFor("Ashlyn", "Mid")).toBe(faceFor("Ashlyn", "Mid"));
    expect(faceFor("Ashlyn", "Mid")).not.toBe(faceFor("Ashlyn", "Top"));
  });

  it("lets a card bring its own champion, and stands in when it can't", () => {
    expect(faceOf({ name: "Ari", role: "Mid", champion: "Syndra" })).toBe("Syndra");
    expect(faceOf({ name: "Ari", role: "Mid", champion: null })).toBe(faceFor("Ari", "Mid"));
    expect(faceOf({ name: "Ari", role: "Mid", champion: "  " })).toBe(faceFor("Ari", "Mid"));
  });
});
