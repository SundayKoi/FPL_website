import { describe, expect, it } from "vitest";
import type { SeasonEndCollectible } from "./collectibles";
import { groupSeasonEndDesigns } from "./overview";

const design = (designId: string, kind: SeasonEndCollectible["kind"], subtitle: string) =>
  ({ designId, kind, display: { subtitle } }) as SeasonEndCollectible;

describe("groupSeasonEndDesigns", () => {
  it("shows each published design once in the admin overview order", () => {
    const designs = [
      design("season", "season", "Cumulative Season Card"),
      design("record", "accolade", "Record breakers"),
      design("best", "best_of", "Best of Champions"),
      design("team", "accolade", "Teamwork"),
      design("future", "accolade", "Future awards"),
    ];
    const groups = groupSeasonEndDesigns(designs);

    expect(groups.map((group) => group.title)).toEqual([
      "Teamwork", "Best of Champions", "Record breakers", "Other awards", "Cards of the Season",
    ]);
    expect(groups.flatMap((group) => group.designs.map((item) => item.designId))).toEqual([
      "team", "best", "record", "future", "season",
    ]);
  });
});
