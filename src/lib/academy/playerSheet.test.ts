import { describe, expect, it } from "vitest";
import { mergeAcademyPlayers, parseAcademyPlayers } from "./playerSheet";

describe("Academy player sheet", () => {
  it("maps player and OP.GG columns without constructing links", () => {
    const rows = parseAcademyPlayers(
      'Player Name,Role,Rank,OP.GG\n"Winter",Top,D2,https://op.gg/lol/summoners/na/Winter\nAura,Support,E4,',
    );

    expect(rows).toEqual([
      { name: "Winter", role: "Top", rank: "D2", opggUrl: "https://op.gg/lol/summoners/na/Winter" },
      { name: "Aura", role: "Support", rank: "E4", opggUrl: null },
    ]);
  });

  it("rejects malformed OP.GG values rather than guessing", () => {
    expect(parseAcademyPlayers("name,role,opgg\nWinter,Top,Winter")[0]?.opggUrl).toBeNull();
  });

  it("keeps the Academy draft pool populated when sheet names differ", () => {
    const players = mergeAcademyPlayers(
      [{ display_name: "Winter", role: "top" }],
      [{ name: "Winter#NA1", role: "Top", rank: "D2", opggUrl: "https://op.gg/from-sheet" }],
    );
    expect(players).toEqual([{ name: "Winter", role: "Top", rank: "D2", opggUrl: "https://op.gg/from-sheet" }]);
  });
});
