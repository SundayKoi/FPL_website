import { describe, expect, it } from "vitest";
import { parseDrafterPage } from "./drafter";

describe("parseDrafterPage", () => {
  it("converts a completed Drafter series into ordered scouting actions", () => {
    const html = `<script>self.__next_f.push([1,"1d:[\\\"$\\\",null,{\\\"drafts\\\":[{\\\"id\\\":42,\\\"done\\\":true,\\\"drafterBlue\\\":\\\"OMH\\\",\\\"drafterRed\\\":\\\"FUR\\\",\\\"blueBan1\\\":\\\"Annie\\\",\\\"redBan1\\\":\\\"Viktor\\\",\\\"bluePick1\\\":\\\"Morgana\\\",\\\"redPick1\\\":\\\"Jhin\\\"}]}]"])</script>`;

    const drafts = parseDrafterPage(html, {
      fixtureId: "fixture-1",
      blueTeamName: "The Original Mocha House",
      redTeamName: "Freaks Under Restraint",
    });

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      id: "drafter:fixture-1:1",
      fixture_id: "fixture-1",
      game_number: 1,
      blue_team_name: "The Original Mocha House",
      red_team_name: "Freaks Under Restraint",
    });
    expect(drafts[0].actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ stepIndex: 0, kind: "ban", side: "blue", slot: 1, champion: "Annie" }),
      expect.objectContaining({ stepIndex: 1, kind: "ban", side: "red", slot: 1, champion: "Viktor" }),
      expect.objectContaining({ stepIndex: 6, kind: "pick", side: "blue", slot: 1, champion: "Morgana" }),
      expect.objectContaining({ stepIndex: 7, kind: "pick", side: "red", slot: 1, champion: "Jhin" }),
    ]));
  });
});
