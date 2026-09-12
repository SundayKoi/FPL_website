import { describe, expect, it } from "vitest";
import { linkedAccountNames, playerAccountNames, riotIdKey, riotIdKeys } from "./accountNames";

describe("linkedAccountNames", () => {
  it("decodes single accounts without splitting hyphens in the game name", () => {
    expect(linkedAccountNames("https://op.gg/lol/summoners/na/My%20Player-Name-NA1"))
      .toEqual(["My Player-Name#NA1"]);
  });

  it("decodes multisearch accounts and ignores empty entries", () => {
    expect(linkedAccountNames("https://op.gg/lol/multisearch/na?summoners=One%23NA1%2C+Two%23EUW%2C%2C"))
      .toEqual(["One#NA1", "Two#EUW"]);
  });

  it.each(["invalid", "https://op.gg/", "https://op.gg/lol/summoners/na/%ZZ-NA1"])(
    "ignores an unusable link: %s", (url) => expect(linkedAccountNames(url)).toEqual([]),
  );
});

describe("playerAccountNames", () => {
  it("includes the roster label, sheet accounts, and roster-specific account", () => {
    expect(playerAccountNames({
      displayName: "Pr1mus",
      opggUrl: "https://op.gg/lol/summoners/na/Extra-EUW",
    })).toEqual(["Pr1mus", "Pr1mus#NA1", "IWillCrankYou#hookd", "Extra#EUW"]);
  });
});

describe("riotIdKeys", () => {
  it("normalizes spacing and case while keeping each name paired with its tag", () => {
    expect(riotIdKeys(["Captain: Ｍy Player# NA1", "myplayer#na1", "Other#EUW", "bare", "#NA1", "Missing#"]))
      .toEqual(new Set(["myplayer#na1", "other#euw"]));
    expect(riotIdKey("My Player", "EUW")).toBe("myplayer#euw");
  });

  it("does not apply bare-name aliases to an exact account identity", () => {
    expect(riotIdKey("ImperialArcher", "ezpz")).toBe("imperialarcher#ezpz");
  });
});
