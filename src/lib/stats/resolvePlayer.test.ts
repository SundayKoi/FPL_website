import { describe, expect, it } from "vitest";
import { resolvePlayerParam } from "./resolvePlayer";

const ROWS = [
  { summoner_name: "Ghostwire", tag: "NA1" },
  { summoner_name: "Ghostwire", tag: "NA1" }, // second season row, same identity
  { summoner_name: "Aura", tag: "5950" },
  { summoner_name: "Aura", tag: "RGB0" },
  { summoner_name: "N0ctua", tag: "EUW" },
];

describe("resolvePlayerParam", () => {
  it("matches Name#TAG exactly, case-insensitively", () => {
    expect(resolvePlayerParam(ROWS, "ghostwire#na1")).toEqual({
      summonerName: "Ghostwire",
      tag: "NA1",
    });
    expect(resolvePlayerParam(ROWS, "Aura#RGB0")).toEqual({ summonerName: "Aura", tag: "RGB0" });
  });

  it("matches a bare name when exactly one identity has it", () => {
    expect(resolvePlayerParam(ROWS, "  n0ctua ")).toEqual({ summonerName: "N0ctua", tag: "EUW" });
    // Duplicate per-season rows of the SAME identity still count as one.
    expect(resolvePlayerParam(ROWS, "Ghostwire")).toEqual({
      summonerName: "Ghostwire",
      tag: "NA1",
    });
  });

  it("refuses a bare name shared by two different identities", () => {
    expect(resolvePlayerParam(ROWS, "Aura")).toBeNull();
  });

  it("returns null for unknown players and blank queries", () => {
    expect(resolvePlayerParam(ROWS, "Nobody")).toBeNull();
    expect(resolvePlayerParam(ROWS, "   ")).toBeNull();
  });

  it("falls back to bare-name matching when the tag half misses", () => {
    // Stale tag in the link, but the name is unambiguous.
    expect(resolvePlayerParam(ROWS, "N0ctua#OLD")).toEqual({
      summonerName: "N0ctua",
      tag: "EUW",
    });
  });
});
