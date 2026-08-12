import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TwitchShowcase from "./TwitchShowcase";

const clips = [
  {
    slug: "first-fpl-clip",
    title: "First FPL clip",
    durationSeconds: 10,
  },
  {
    slug: "second-fpl-clip",
    title: "Second FPL clip",
    durationSeconds: 12,
  },
];

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("TwitchShowcase", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("embeds the live channel when Twitch reports the channel is live", () => {
    render(
      <TwitchShowcase
        channelLogin="franchisepremierleague"
        clips={clips}
        twitchUrl="https://www.twitch.tv/franchisepremierleague"
        streamState="live"
      />,
    );

    const frame = screen.getByTitle("Franchise Premier League live stream");
    expect(frame.getAttribute("src")).toBe(
      "https://player.twitch.tv/?channel=franchisepremierleague&parent=localhost&autoplay=true&muted=true",
    );
    expect(screen.getByText(/live now/i)).not.toBeNull();
  });

  it("cycles through clips when Twitch reports the channel is offline", () => {
    render(
      <TwitchShowcase
        channelLogin="franchisepremierleague"
        clips={clips}
        twitchUrl="https://www.twitch.tv/franchisepremierleague"
        streamState="offline"
      />,
    );

    expect(screen.getByTitle("First FPL clip").getAttribute("src")).toBe(
      "https://clips.twitch.tv/embed?clip=first-fpl-clip&parent=localhost&autoplay=true&muted=true",
    );

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(screen.getByTitle("Second FPL clip").getAttribute("src")).toBe(
      "https://clips.twitch.tv/embed?clip=second-fpl-clip&parent=localhost&autoplay=true&muted=true",
    );
    expect(screen.getByText(/offline replay/i)).not.toBeNull();
  });

  it("shows a Twitch link instead of crashing when no clips are available", () => {
    render(
      <TwitchShowcase
        channelLogin="franchisepremierleague"
        clips={[]}
        twitchUrl="https://www.twitch.tv/franchisepremierleague"
        streamState="offline"
      />,
    );

    expect(screen.getByText(/clips will appear here/i)).not.toBeNull();
    expect(screen.getByRole("link", { name: /open twitch channel/i }).getAttribute("href")).toBe(
      "https://www.twitch.tv/franchisepremierleague",
    );
  });
});
