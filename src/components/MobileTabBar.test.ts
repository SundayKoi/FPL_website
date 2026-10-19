import { describe, expect, it } from "vitest";
import { mobileTabs } from "./MobileTabBar";

describe("mobileTabs", () => {
  it("leads to the league in an ordinary season", () => {
    expect(mobileTabs("/").map((tab) => tab.label)).toEqual(["Home", "League", "Cards", "Games", "My Team"]);
  });

  it("leads to the offseason alone while an event runs", () => {
    const tabs = mobileTabs("/offseason/packs", true);
    expect(tabs.map((tab) => [tab.label, tab.href])).toEqual([
      ["Home", "/"],
      ["Offseason", "/offseason"],
      ["Schedule", "/offseason/schedule"],
      ["Packs", "/offseason/packs"],
      ["Your card", "/offseason/card"],
    ]);
    expect(tabs.filter((tab) => tab.active).map((tab) => tab.label)).toEqual(["Packs"]);
    expect(mobileTabs("/offseason/players/abc", true).find((tab) => tab.active)?.label).toBe("Offseason");
  });
});
