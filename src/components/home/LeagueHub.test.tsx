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

    const twitch = screen.getAllByRole("link", { name: /twitch/i })[0];
    expect(twitch.getAttribute("href")).toBe("https://www.twitch.tv/franchisepremierleague");
    expect(twitch.getAttribute("target")).toBe("_blank");
    expect(screen.getByRole("link", { name: /explore drafts/i }).getAttribute("href")).toBe(
      "#draft-central",
    );
    expect(screen.getAllByText("Coming soon")).toHaveLength(3);
    expect(screen.getByText("Current drafts")).toBeTruthy();
  });
});
