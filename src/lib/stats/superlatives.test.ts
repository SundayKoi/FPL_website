import { describe, expect, it } from "vitest";
import { awardSuperlatives, type Superlative } from "./superlatives";

interface Row {
  name: string;
  dragons: number;
  minutes: number;
}

const row = (name: string, dragons: number, minutes = 30): Row => ({ name, dragons, minutes });

const DRAGONS: Superlative<Row> = { key: "dragon", label: "Dragon control", pick: (r) => r.dragons };
const FASTEST: Superlative<Row> = { key: "fast", label: "Fastest games", pick: (r) => r.minutes, lowIsBest: true };

describe("awardSuperlatives", () => {
  it("gives the badge to the highest value", () => {
    const badges = awardSuperlatives([row("Alpha", 3), row("Beta", 9)], (r) => r.name, [DRAGONS]);
    expect(badges.get("Beta")).toEqual(["Dragon control"]);
  });

  it("leaves everyone else out of the map entirely", () => {
    const badges = awardSuperlatives([row("Alpha", 3), row("Beta", 9)], (r) => r.name, [DRAGONS]);
    expect(badges.has("Alpha")).toBe(false);
  });

  it("gives a lowIsBest badge to the smallest value", () => {
    const badges = awardSuperlatives([row("Alpha", 1, 24), row("Beta", 1, 36)], (r) => r.name, [FASTEST]);
    expect(badges.get("Alpha")).toEqual(["Fastest games"]);
  });

  it("awards nobody when the top two are tied", () => {
    // "Best by a rounding error" is not a fact, and picking whichever row
    // sorted first would make the badge depend on input order.
    const badges = awardSuperlatives([row("Alpha", 9), row("Beta", 9)], (r) => r.name, [DRAGONS]);
    expect(badges.size).toBe(0);
  });

  it("still awards when the tie is for second place, not first", () => {
    const badges = awardSuperlatives(
      [row("Alpha", 4), row("Beta", 9), row("Cy", 4)],
      (r) => r.name,
      [DRAGONS],
    );
    expect(badges.get("Beta")).toEqual(["Dragon control"]);
  });

  it("does not let a tie earlier in the list block a later outright winner", () => {
    const badges = awardSuperlatives(
      [row("Alpha", 4), row("Beta", 4), row("Cy", 9)],
      (r) => r.name,
      [DRAGONS],
    );
    expect(badges.get("Cy")).toEqual(["Dragon control"]);
  });

  it("stacks every award one row wins, in the order they were declared", () => {
    const badges = awardSuperlatives(
      [row("Alpha", 9, 24), row("Beta", 3, 36)],
      (r) => r.name,
      [DRAGONS, FASTEST],
    );
    expect(badges.get("Alpha")).toEqual(["Dragon control", "Fastest games"]);
  });

  it("awards nothing to a lone row — nobody to be better than", () => {
    expect(awardSuperlatives([row("Alpha", 9)], (r) => r.name, [DRAGONS]).size).toBe(0);
  });

  it("handles no rows at all", () => {
    expect(awardSuperlatives([], (r: Row) => r.name, [DRAGONS]).size).toBe(0);
  });

  it("is unaffected by the order rows arrive in", () => {
    const rows = [row("Alpha", 4), row("Beta", 9), row("Cy", 1)];
    const forward = awardSuperlatives(rows, (r) => r.name, [DRAGONS]);
    const backward = awardSuperlatives([...rows].reverse(), (r) => r.name, [DRAGONS]);
    expect([...forward]).toEqual([...backward]);
  });
});
