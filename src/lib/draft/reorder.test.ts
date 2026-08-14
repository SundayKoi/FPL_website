import { describe, expect, it } from "vitest";
import { applyOrder, moveItem } from "./reorder";

describe("moveItem", () => {
  it("moves an item down and shifts the rest up", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an item up", () => {
    expect(moveItem(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("swaps neighbours", () => {
    expect(moveItem(["a", "b"], 0, 1)).toEqual(["b", "a"]);
  });

  it("returns the same list for a no-op move", () => {
    const items = ["a", "b"];
    expect(moveItem(items, 1, 1)).toBe(items);
  });

  it("returns the same list rather than dropping an item on a bad index", () => {
    const items = ["a", "b"];
    expect(moveItem(items, 5, 0)).toBe(items);
    expect(moveItem(items, 0, -1)).toBe(items);
    expect(moveItem(items, 0, 9)).toBe(items);
  });
});

describe("applyOrder", () => {
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("re-sorts items into the given id order", () => {
    expect(applyOrder(items, ["c", "a", "b"]).map((i) => i.id)).toEqual(["c", "a", "b"]);
  });

  it("passes the items through when there is no pending order", () => {
    expect(applyOrder(items, null)).toBe(items);
  });

  it("ignores an order left stale by an added or removed team", () => {
    expect(applyOrder(items, ["a", "b"])).toBe(items);
    expect(applyOrder(items, ["a", "b", "c", "d"])).toBe(items);
  });

  it("ignores an order naming an id the list no longer holds", () => {
    expect(applyOrder(items, ["a", "b", "gone"])).toBe(items);
  });

  it("never duplicates an item when the order repeats an id", () => {
    expect(applyOrder(items, ["a", "a", "b"])).toBe(items);
  });
});
