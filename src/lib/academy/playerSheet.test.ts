import { describe, expect, it } from "vitest";
import { academyOpggUrlForPlayer, individualOpggUrl, mergeAcademyPlayers, parseAcademyPlayers } from "./playerSheet";

describe("Academy player sheet", () => {
  it("reduces a multisearch URL to the named player's individual URL", () => {
    expect(individualOpggUrl(
      "https://op.gg/lol/multisearch/na?summoners=Alpha%23NA1%2CBeta%23NA1",
      "Beta#NA1",
    )).toBe("https://op.gg/lol/summoners/na/Beta-NA1");
  });

  it("matches an Academy draft name without its Riot tag", () => {
    expect(academyOpggUrlForPlayer("SuperWeeb")).toBe(
      "https://op.gg/lol/summoners/na/SuperWeeb-Weeb",
    );
  });

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

  it("extracts a URL from a sheet HYPERLINK formula", () => {
    expect(parseAcademyPlayers('name,role,rank,op.gg\nWinter,Top,D2,"=HYPERLINK(\"https://op.gg/from-sheet\",\"OP.GG\")"')[0]?.opggUrl).toBe("https://op.gg/from-sheet");
  });

  it("keeps the Academy draft pool populated when sheet names differ", () => {
    const players = mergeAcademyPlayers(
      [{ display_name: "Winter", role: "top" }],
      [{ name: "Winter#NA1", role: "Top", rank: "D2", opggUrl: "https://op.gg/from-sheet" }],
    );
    expect(players).toEqual([{ name: "Winter", role: "Top", rank: "D2", opggUrl: "https://op.gg/from-sheet" }]);
  });

  it("matches roster-tab OP.GG multisearch links to Academy draft names", () => {
    expect(mergeAcademyPlayers(
      [{ display_name: "SuperWeeb#WEEB", role: "top" }],
      [],
    )[0]?.opggUrl).toBe("https://op.gg/lol/summoners/na/SuperWeeb-Weeb");
    expect(mergeAcademyPlayers(
      [{ display_name: "Dream Unforgiven#Na1", role: "top" }],
      [],
    )[0]?.opggUrl).toBe("https://op.gg/lol/summoners/na/Dream%20Unforgiven-NA1");
  });

  it("reduces a sheet multisearch URL to an individual Academy player link", () => {
    expect(mergeAcademyPlayers(
      [{ display_name: "Beta#NA1", role: "top" }],
      [{
        name: "Beta#NA1",
        role: "Top",
        rank: "D2",
        opggUrl: "https://op.gg/lol/multisearch/na?summoners=Alpha%23NA1%2CBeta%23NA1",
      }],
    )[0]?.opggUrl).toBe("https://op.gg/lol/summoners/na/Beta-NA1");
  });
});
