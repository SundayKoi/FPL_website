import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LeagueHub from "./LeagueHub";

describe("LeagueHub", () => {
  it("links visitors to Twitch and keeps future destinations honest", () => {
    render(
      <LeagueHub>
        <section id="draft-central">Current drafts</section>
      </LeagueHub>,
    );

    const twitchLinks = screen.getAllByRole("link", { name: /twitch/i });
    expect(twitchLinks).toHaveLength(2);

    for (const twitchLink of twitchLinks) {
      expect(twitchLink.getAttribute("href")).toBe(
        "https://www.twitch.tv/franchisepremierleague",
      );
      expect(twitchLink.getAttribute("target")).toBe("_blank");
      expect(twitchLink.getAttribute("rel")).toBe("noreferrer");
    }

    expect(screen.getByRole("link", { name: /explore drafts/i }).getAttribute("href")).toBe(
      "#draft-central",
    );
    expect(screen.getAllByText("Coming soon")).toHaveLength(3);
    expect(screen.getByText("Current drafts")).toBeTruthy();
  });
});
