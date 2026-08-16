import { describe, expect, it } from "vitest";
import { parseAcademyPlayers } from "./playerSheet";

describe("Academy player sheet", () => {
  it("maps player and OP.GG columns without constructing links", () => {
    const rows = parseAcademyPlayers(
      'Player Name,Role,OP.GG\n"Winter",Top,https://op.gg/lol/summoners/na/Winter\nAura,Support,',
    );

    expect(rows).toEqual([
      { name: "Winter", role: "Top", opggUrl: "https://op.gg/lol/summoners/na/Winter" },
      { name: "Aura", role: "Support", opggUrl: null },
    ]);
  });

  it("rejects malformed OP.GG values rather than guessing", () => {
    expect(parseAcademyPlayers("name,role,opgg\nWinter,Top,Winter")[0]?.opggUrl).toBeNull();
  });
});
