import { describe, expect, it } from "vitest";
import {
  opggMultiSearchUrlFromOpggUrls,
  opggMultiSearchUrlFromRosterPlayers,
  opggMultiSearchUrlFromRiotIds,
} from "./multiSearch";

describe("opggMultiSearchUrlFromOpggUrls", () => {
  it("builds one NA multi-search URL from single and multi OP.GG links", () => {
    expect(
      opggMultiSearchUrlFromOpggUrls([
        "https://op.gg/lol/summoners/na/RiftMaker-NA1?exact=1",
        "https://www.op.gg/lol/multisearch/na?summoners=Walt%230001%2CHi+Walter%23NA1",
        "https://op.gg/lol/summoners/na/Flyinq%20Squirtle-NA1",
        "https://example.com/not-opgg",
        null,
      ]),
    ).toBe(
      "https://op.gg/lol/multisearch/na?summoners=RiftMaker%23NA1%2CWalt%230001%2CHi+Walter%23NA1%2CFlyinq+Squirtle%23NA1",
    );
  });

  it("returns null when no usable OP.GG accounts are present", () => {
    expect(opggMultiSearchUrlFromOpggUrls([null, "", "https://op.gg/lol/champions"])).toBeNull();
  });
});

describe("opggMultiSearchUrlFromRiotIds", () => {
  it("builds a multi-search URL from Riot account rows", () => {
    expect(
      opggMultiSearchUrlFromRiotIds([
        { game_name: "Rift Maker", tag_line: "NA1" },
        { game_name: "Support", tag_line: "FPL" },
      ]),
    ).toBe("https://op.gg/lol/multisearch/na?summoners=Rift+Maker%23NA1%2CSupport%23FPL");
  });
});

describe("opggMultiSearchUrlFromRosterPlayers", () => {
  it("uses OP.GG URLs first and falls back to Riot ID display names", () => {
    expect(
      opggMultiSearchUrlFromRosterPlayers([
        { displayName: "No Link#NA1", opggUrl: null },
        { displayName: "Canonical Link", opggUrl: "https://op.gg/lol/summoners/na/Canonical-777" },
        { display_name: "Already Multi", opgg_url: "https://op.gg/lol/multisearch/na?summoners=Alt%23NA1%2CAlt2%23NA1" },
        { displayName: "No Tag" },
      ]),
    ).toBe(
      "https://op.gg/lol/multisearch/na?summoners=No+Link%23NA1%2CCanonical%23777%2CAlt%23NA1%2CAlt2%23NA1",
    );
  });
});
