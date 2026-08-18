import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import FeaturedMatchup from "./FeaturedMatchup";
import type { FixtureRow } from "@/lib/schedule/types";

const fixture: FixtureRow = {
  id: "fixture-1",
  season: "S5",
  stage: "week_1",
  division: "Solari",
  team_a: "MetaShift",
  team_b: "Wildcats",
  scheduled_at: "2026-08-17T01:00:00Z",
  best_of: 3,
  score_a: null,
  score_b: null,
  sort_order: 0,
  created_at: "2026-08-11T00:00:00Z",
};

const clips = [
  {
    slug: "fpl-preview",
    title: "FPL preview",
    durationSeconds: 30,
    thumbnailUrl: null,
    creatorName: "Caster",
    viewCount: 10,
  },
];

afterEach(() => cleanup());

describe("FeaturedMatchup", () => {
  it("keeps the Twitch preview collapsed until the viewer opens it", () => {
    render(
      <FeaturedMatchup
        fixture={fixture}
        clips={clips}
        streamState="offline"
        channelLogin="franchisepremierleague"
        twitchUrl="https://www.twitch.tv/franchisepremierleague"
      />,
    );

    expect(screen.getByText("MetaShift")).toBeTruthy();
    expect(screen.getByText("Wildcats")).toBeTruthy();
    expect(screen.queryByTitle("FPL preview")).toBeNull();
  });

  it("loads the Twitch clip when the preview is opened", () => {
    render(
      <FeaturedMatchup
        fixture={fixture}
        clips={clips}
        streamState="offline"
        channelLogin="franchisepremierleague"
        twitchUrl="https://www.twitch.tv/franchisepremierleague"
      />,
    );

    act(() => {
      screen.getByRole("button", { name: /show preview/i }).click();
    });

    expect(screen.getByTitle("FPL preview").getAttribute("src")).toContain(
      "clip=fpl-preview",
    );
  });

  it("renders a custom title and supporting description", () => {
    render(
      <FeaturedMatchup
        fixture={fixture}
        clips={clips}
        streamState="offline"
        channelLogin="franchisepremierleague"
        twitchUrl="https://www.twitch.tv/franchisepremierleague"
        title="The academy spotlight is here."
        description="Watch the next generation compete under the lights."
      />,
    );

    expect(screen.getByRole("heading", { name: "The academy spotlight is here." })).toBeTruthy();
    expect(screen.getByText("Watch the next generation compete under the lights.")).toBeTruthy();
  });

  it("renders the default title and supporting description when omitted", () => {
    render(
      <FeaturedMatchup
        fixture={fixture}
        clips={clips}
        streamState="offline"
        channelLogin="franchisepremierleague"
        twitchUrl="https://www.twitch.tv/franchisepremierleague"
      />,
    );

    expect(screen.getByRole("heading", { name: "The title race gets serious." })).toBeTruthy();
    expect(
      screen.getByText(
        "Two teams meet under the lights. Follow the broadcast, watch the standings shift, and see who owns the next chapter.",
      ),
    ).toBeTruthy();
  });
});
