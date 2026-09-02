import { describe, expect, it } from "vitest";
import { parseInventoryId } from "./params";

describe("parseInventoryId", () => {
  it("reads a plain positive integer and nothing else", () => {
    expect(parseInventoryId("42")).toBe(42);
    expect(parseInventoryId(["7", "8"])).toBe(7);
    expect(parseInventoryId("0")).toBeNull();
    expect(parseInventoryId("-3")).toBeNull();
    expect(parseInventoryId("4e2")).toBeNull();
    expect(parseInventoryId("abc")).toBeNull();
    expect(parseInventoryId(undefined)).toBeNull();
  });
});
