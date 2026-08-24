import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchHomepageTwitch,
  twitchChannelLoginFromUrl,
} from "./twitch";

const { getTwitchChannelStatus, getTwitchChannelClips } = vi.hoisted(() => ({
  getTwitchChannelStatus: vi.fn(),
  getTwitchChannelClips: vi.fn(),
}));

vi.mock("@/lib/twitch/status", () => ({
  getTwitchChannelStatus,
  getTwitchChannelClips,
}));

afterEach(() => {
  getTwitchChannelStatus.mockReset();
  getTwitchChannelClips.mockReset();
});

describe("homepage Twitch settings", () => {
  it("uses the selected channel for status and clips", async () => {
    getTwitchChannelStatus.mockResolvedValue({ state: "offline" });
    getTwitchChannelClips.mockResolvedValue([]);

    await fetchHomepageTwitch("jakeok1");

    expect(getTwitchChannelStatus).toHaveBeenCalledWith({ channelLogin: "jakeok1" });
    expect(getTwitchChannelClips).toHaveBeenCalledWith({ channelLogin: "jakeok1" });
  });

  it.each([
    ["https://www.twitch.tv/franchisepremierleague", "franchisepremierleague"],
    ["https://www.twitch.tv/jakeok1/", "jakeok1"],
    [null, "franchisepremierleague"],
    ["https://example.com/stream", "franchisepremierleague"],
  ])("derives a safe channel login from %s", (url, expected) => {
    expect(twitchChannelLoginFromUrl(url)).toBe(expected);
  });
});
