import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import LeagueHub from "./LeagueHub";

expect.extend({
  toHaveClass(received: Element | null | undefined, ...classNames: string[]) {
    const missing = classNames.filter((className) => !received?.classList.contains(className));

    return {
      pass: missing.length === 0,
      message: () =>
        `expected element class="${received?.getAttribute("class") ?? ""}" to include ${classNames.join(", ")}`,
    };
  },
});

afterEach(() => {
  cleanup();
});

describe("LeagueHub", () => {
  it("uses the wide directory spacing on desktop", async () => {
    render(await LeagueHub());

    const main = screen.getByRole("main");
    expect(main.firstElementChild).toHaveClass(
      "max-w-[1800px]",
      "px-4",
      "sm:px-6",
      "py-12",
      "sm:py-16",
    );
    expect(screen.getByRole("region", { name: /the league never stops/i })).toHaveClass(
      "gap-8",
      "xl:gap-12",
    );
  });

  it("keeps the homepage focused on league broadcasts", async () => {
    render(await LeagueHub());

    const twitchLinks = screen.getAllByRole("link", { name: /twitch/i });
    expect(twitchLinks.length).toBeGreaterThanOrEqual(2);

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

  it("adds the Twitch broadcast showcase to the landing page", async () => {
    render(await LeagueHub());

    expect(
      screen.getByRole("article", { name: /franchise premier league broadcast/i }),
    ).not.toBeNull();
  });

  it("adds the weekly standouts panel to the landing page", async () => {
    render(await LeagueHub());

    expect(screen.getByRole("article", { name: /latest week's standouts/i })).not.toBeNull();
  });
});
