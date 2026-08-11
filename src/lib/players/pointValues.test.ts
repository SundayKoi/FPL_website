import { describe, expect, it } from "vitest";
import { currentPlayerPointValue } from "./pointValues";

describe("currentPlayerPointValue", () => {
  it("matches known players with rank tags stripped", () => {
    expect(currentPlayerPointValue("Canny")).toBe(30);
  });

  it("matches non-ASCII player names without creating empty-key fallbacks", () => {
    expect(currentPlayerPointValue("ΣΠΑΡΤΙΑΤΗΣ")).toBe(10);
    expect(currentPlayerPointValue("###")).toBeNull();
  });
});
