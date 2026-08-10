import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LeagueHub from "./LeagueHub";

describe("LeagueHub", () => {
  it("keeps the homepage focused on league broadcasts", () => {
    render(<LeagueHub />);

    const twitchLinks = screen.getAllByRole("link", { name: /twitch/i });
    expect(twitchLinks).toHaveLength(2);

    for (const twitchLink of twitchLinks) {
      expect(twitchLink.getAttribute("href")).toBe(
        "https://www.twitch.tv/franchisepremierleague",
      );
      expect(twitchLink.getAttribute("target")).toBe("_blank");
      expect(twitchLink.getAttribute("rel")).toBe("noreferrer");
    }

    expect(screen.queryByRole("heading", { name: /explore the league/i })).toBeNull();
    expect(screen.queryByRole("heading", { name: /draft central/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /explore drafts/i })).toBeNull();
  });
});
