import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TwitchShowcase from "./TwitchShowcase";

const clips = [
  {
    slug: "first-fpl-clip",
    title: "First FPL clip",
    durationSeconds: 10,
    thumbnailUrl: "https://clips-media.twitch.tv/first-preview-480x272.jpg",
    creatorName: "Caster",
    viewCount: 1200,
  },
  {
    slug: "second-fpl-clip",
    title: "Second FPL clip",
    durationSeconds: 12,
    thumbnailUrl: "https://clips-media.twitch.tv/second-preview-480x272.jpg",
    creatorName: null,
    viewCount: 8,
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
    expect(screen.getByText(/clip reel/i)).not.toBeNull();
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

describe("TwitchShowcase up-next rail", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("lists every clip in the rail with the active card marked", () => {
    render(
      <TwitchShowcase
        channelLogin="franchisepremierleague"
        clips={clips}
        twitchUrl="https://www.twitch.tv/franchisepremierleague"
        streamState="offline"
      />,
    );

    const rail = screen.getByRole("complementary", { name: /up next/i });
    expect(rail).not.toBeNull();
    const cards = screen.getAllByRole("button");
    expect(cards.length).toBe(2);
    expect(cards[0].getAttribute("aria-current")).toBe("true");
    expect(cards[1].getAttribute("aria-current")).toBeNull();
  });

  it("jumps the stage when a rail card is clicked", () => {
    render(
      <TwitchShowcase
        channelLogin="franchisepremierleague"
        clips={clips}
        twitchUrl="https://www.twitch.tv/franchisepremierleague"
        streamState="offline"
      />,
    );

    act(() => {
      screen.getAllByRole("button")[1].click();
    });

    expect(screen.getByTitle("Second FPL clip").getAttribute("src")).toContain(
      "clip=second-fpl-clip",
    );
  });

  it("hides the rail and shows the now-playing credit correctly when live", () => {
    render(
      <TwitchShowcase
        channelLogin="franchisepremierleague"
        clips={clips}
        twitchUrl="https://www.twitch.tv/franchisepremierleague"
        streamState="live"
      />,
    );

    expect(screen.queryByRole("complementary", { name: /up next/i })).toBeNull();
    expect(screen.getByText(/streaming live from twitch/i)).not.toBeNull();
  });

  it("credits the clipper and shows views in the now-playing strip", () => {
    render(
      <TwitchShowcase
        channelLogin="franchisepremierleague"
        clips={clips}
        twitchUrl="https://www.twitch.tv/franchisepremierleague"
        streamState="offline"
      />,
    );

    expect(screen.getByText(/clipped by Caster/i)).not.toBeNull();
    expect(screen.getAllByText(/1\.2k views/i).length).toBeGreaterThanOrEqual(1);
  });
});
