import { describe, expect, it } from "vitest";
import { friendly } from "./Toast";

describe("friendly", () => {
  it("returns a useful generic fallback for unknown RPC errors", () => {
    expect(friendly("UNKNOWN")).toBe("Something went wrong. Please try again.");
  });
});
