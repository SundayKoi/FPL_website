import { describe, expect, it } from "vitest";
import { COIN_R, GUTTER, LIP, PUSH_MIN, seedShelf, step, W, type Disc } from "./sim";

const coin = (id: number, x: number, y: number): Disc => ({ id, kind: "coin", x, y, vx: 0, vy: 0, r: COIN_R });

describe("the pusher's pretend physics", () => {
  it("seeds a packed shelf with the prizes on it", () => {
    let n = 0;
    const discs = seedShelf(() => ((n += 1) * 0.37) % 1);
    expect(discs.length).toBeGreaterThan(40);
    expect(discs.filter((disc) => disc.kind !== "coin")).toHaveLength(7);
    expect(discs.every((disc) => disc.y < LIP)).toBe(true);
  });

  it("shoves a coin in front of the bar forward, and pays a coin whose whole body clears the lip", () => {
    const discs = [coin(1, W / 2, PUSH_MIN + 2), coin(2, W / 2, LIP + COIN_R + 1)];
    const { paid, lost } = step(discs, PUSH_MIN + 20, 20);
    expect(discs.find((disc) => disc.id === 1)!.y).toBeGreaterThan(PUSH_MIN + 20);
    expect(paid.map((disc) => disc.id)).toEqual([2]);
    expect(lost).toEqual([]);
  });

  it("loses a coin that goes over the lip in a gutter", () => {
    const discs = [coin(1, GUTTER / 2, LIP + 20)];
    const { paid, lost } = step(discs, PUSH_MIN, 0);
    expect(paid).toEqual([]);
    expect(lost.map((disc) => disc.id)).toEqual([1]);
    expect(discs).toHaveLength(0);
  });

  it("keeps overlapping coins apart", () => {
    const discs = [coin(1, 150, 300), coin(2, 152, 300)];
    step(discs, PUSH_MIN, 0);
    const [a, b] = discs;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(COIN_R * 2 - 0.01);
  });
});
