import { describe, expect, it } from "vitest";
import { formatMatchWinPayouts } from "./match-wins";

describe("formatMatchWinPayouts", () => {
  it("groups mixed normal and patron payouts by actual amount", () => {
    expect(formatMatchWinPayouts([
      { username: "Patron", amount: 300 },
      { username: "Normal", amount: 200 },
      { username: "Patron Two", amount: 300 },
    ])).toBe("+$200 each: Normal · +$300 each: Patron, Patron Two");
  });

  it("returns an empty announcement fragment when nothing was paid", () => {
    expect(formatMatchWinPayouts([])).toBe("");
  });
});
