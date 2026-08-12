import { describe, expect, it } from "vitest";

import {
  matchCanonicalPlayer,
  normalizeCanonicalName,
  type CanonicalPlayer,
} from "./canonicalMatch";

const seasonFiveCandidates: CanonicalPlayer[] = [
  {
    id: "winter-id",
    season_key: "season-5",
    normalized_name: "winter",
    display_name: "Captain: Winter",
    role: "top",
    rank: "M10",
    opgg_url: "https://op.gg/lol/summoners/na/Winter-Ashtn",
    created_at: "2026-08-12T00:00:00Z",
    updated_at: "2026-08-12T00:00:00Z",
  },
  {
    id: "flying-id",
    season_key: "season-5",
    normalized_name: "flying squirtle",
    display_name: "Captain: Flying Squirtle",
    role: "mid",
    rank: "D4",
    opgg_url: "https://op.gg/lol/summoners/na/Flyinq%20Squirtle-NA1",
    created_at: "2026-08-12T00:00:00Z",
    updated_at: "2026-08-12T00:00:00Z",
  },
  {
    id: "conguitos-id",
    season_key: "season-5",
    normalized_name: "conguitos",
    display_name: "Conguitos#01203",
    role: "jungle",
    rank: "E2",
    opgg_url: "https://op.gg/lol/summoners/na/Conguitos-01203",
    created_at: "2026-08-12T00:00:00Z",
    updated_at: "2026-08-12T00:00:00Z",
  },
  {
    id: "chime-support-id",
    season_key: "season-5",
    normalized_name: "chime",
    display_name: "08 Mitsu Eclipse#Chime",
    role: "support",
    rank: "D4",
    opgg_url: "https://op.gg/lol/summoners/na/08%20Mitsu%20Eclipse-Chime",
    created_at: "2026-08-12T00:00:00Z",
    updated_at: "2026-08-12T00:00:00Z",
  },
  {
    id: "chime-mid-id",
    season_key: "season-5",
    normalized_name: "chime",
    display_name: "Chime",
    role: "mid",
    rank: "D4",
    opgg_url: "https://example.com/chime-mid",
    created_at: "2026-08-12T00:00:00Z",
    updated_at: "2026-08-12T00:00:00Z",
  },
];

describe("normalizeCanonicalName", () => {
  it("normalizes case, spacing, captain prefixes, and riot tags", () => {
    expect(normalizeCanonicalName("  Captain: Winter  ")).toBe("winter");
    expect(normalizeCanonicalName("Captain:Wellshowthemall")).toBe("wellshowthemall");
    expect(normalizeCanonicalName(" Canny#rip ")).toBe("canny");
    expect(normalizeCanonicalName("the grip reaper #meow")).toBe("the grip reaper");
  });

  it("maps current free-agency aliases onto canonical names", () => {
    expect(normalizeCanonicalName("Flyinq Squirtle")).toBe("flying squirtle");
    expect(normalizeCanonicalName("Conguitos0")).toBe("conguitos");
    expect(normalizeCanonicalName("Begfourmercy")).toBe("beg");
    expect(normalizeCanonicalName("08 Mitsu Eclipse")).toBe("chime");
  });
});

describe("matchCanonicalPlayer", () => {
  it("returns exact when the normalized name directly matches one candidate", () => {
    expect(matchCanonicalPlayer("Captain: Winter", seasonFiveCandidates)).toEqual({
      match: seasonFiveCandidates[0],
      confidence: "exact",
    });
  });

  it("returns alias when only an alias-normalized input matches a candidate", () => {
    expect(matchCanonicalPlayer("Flyinq Squirtle", seasonFiveCandidates)).toEqual({
      match: seasonFiveCandidates[1],
      confidence: "alias",
    });
  });

  it("returns ambiguous when multiple canonical candidates share the normalized name", () => {
    expect(matchCanonicalPlayer("Chime", seasonFiveCandidates)).toEqual({
      match: null,
      confidence: "ambiguous",
    });
  });

  it("returns none when no candidate matches", () => {
    expect(matchCanonicalPlayer("Missing Player", seasonFiveCandidates)).toEqual({
      match: null,
      confidence: "none",
    });
  });
});
