import { describe, expect, it } from "vitest";
import { getTwitchChannelClips, getTwitchChannelStatus } from "./status";

const okJson = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });

describe("getTwitchChannelStatus", () => {
  it("reports live when Twitch returns an active stream", async () => {
    const requests: string[] = [];
    const fetcher = async (input: RequestInfo | URL) => {
      const url = input.toString();
      requests.push(url);

      if (url.startsWith("https://id.twitch.tv/oauth2/token")) {
        return okJson({ access_token: "test-token" });
      }

      return okJson({ data: [{ id: "stream-1" }] });
    };

    const status = await getTwitchChannelStatus({
      channelLogin: "franchisepremierleague",
      clientId: "client-id",
      clientSecret: "client-secret",
      fetcher,
    });

    expect(status).toEqual({ state: "live", viewerCount: null });
    expect(requests).toEqual([
      "https://id.twitch.tv/oauth2/token?client_id=client-id&client_secret=client-secret&grant_type=client_credentials",
      "https://api.twitch.tv/helix/streams?user_login=franchisepremierleague",
    ]);
  });

  it("reports offline when Twitch returns no active streams", async () => {
    const fetcher = async (input: RequestInfo | URL) => {
      if (input.toString().startsWith("https://id.twitch.tv/oauth2/token")) {
        return okJson({ access_token: "test-token" });
      }

      return okJson({ data: [] });
    };

    const status = await getTwitchChannelStatus({
      channelLogin: "franchisepremierleague",
      clientId: "client-id",
      clientSecret: "client-secret",
      fetcher,
    });

    expect(status).toEqual({ state: "offline" });
  });

  it("reports unknown without trying Twitch when credentials are missing", async () => {
    let fetchCalls = 0;

    const status = await getTwitchChannelStatus({
      channelLogin: "franchisepremierleague",
      clientId: "",
      clientSecret: "",
      fetcher: async () => {
        fetchCalls += 1;
        return okJson({});
      },
    });

    expect(status).toEqual({ state: "unknown", reason: "missing-credentials" });
    expect(fetchCalls).toBe(0);
  });
});

describe("getTwitchChannelClips", () => {
  const clipBody = {
    data: [
      {
        id: "first-fpl-clip",
        title: "First FPL clip",
        duration: 8.5,
        thumbnail_url: "https://clips-media.twitch.tv/first-preview-480x272.jpg",
        creator_name: "Caster",
        view_count: 42,
      },
      { id: "second-fpl-clip", title: "", duration: 0 },
      { id: "third-fpl-clip", title: "Third", duration: 20 },
    ],
  };

  it("returns this month's clips (30-day window) with thumbnails and credits", async () => {
    const requests: string[] = [];
    const fetcher = async (input: RequestInfo | URL) => {
      const url = input.toString();
      requests.push(url);

      if (url.startsWith("https://id.twitch.tv/oauth2/token")) {
        return okJson({ access_token: "test-token" });
      }

      if (url.startsWith("https://api.twitch.tv/helix/users")) {
        return okJson({ data: [{ id: "broadcaster-1" }] });
      }

      return okJson(clipBody);
    };

    const clips = await getTwitchChannelClips({
      channelLogin: "franchisepremierleague",
      clientId: "client-id",
      clientSecret: "client-secret",
      fetcher,
    });

    expect(clips).toEqual([
      {
        slug: "first-fpl-clip",
        title: "First FPL clip",
        durationSeconds: 9,
        thumbnailUrl: "https://clips-media.twitch.tv/first-preview-480x272.jpg",
        creatorName: "Caster",
        viewCount: 42,
      },
      {
        slug: "second-fpl-clip",
        title: "FPL Twitch clip",
        durationSeconds: 30,
        thumbnailUrl: null,
        creatorName: null,
        viewCount: 0,
      },
      {
        slug: "third-fpl-clip",
        title: "Third",
        durationSeconds: 20,
        thumbnailUrl: null,
        creatorName: null,
        viewCount: 0,
      },
    ]);
    expect(requests[0]).toBe(
      "https://id.twitch.tv/oauth2/token?client_id=client-id&client_secret=client-secret&grant_type=client_credentials",
    );
    expect(requests[1]).toBe("https://api.twitch.tv/helix/users?login=franchisepremierleague");
    expect(requests[2]).toContain("https://api.twitch.tv/helix/clips?broadcaster_id=broadcaster-1&first=10");
    expect(requests[2]).toContain("started_at=");
    expect(requests.length).toBe(3); // >=3 recent clips: no all-time fallback call
  });

  it("falls back to all-time clips when the recent window is thin", async () => {
    const clipRequests: string[] = [];
    const fetcher = async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url.startsWith("https://id.twitch.tv/oauth2/token")) {
        return okJson({ access_token: "test-token" });
      }
      if (url.startsWith("https://api.twitch.tv/helix/users")) {
        return okJson({ data: [{ id: "broadcaster-1" }] });
      }

      clipRequests.push(url);
      if (url.includes("started_at=")) {
        return okJson({ data: [{ id: "only-recent", title: "Lone clip", duration: 10 }] });
      }
      return okJson(clipBody);
    };

    const clips = await getTwitchChannelClips({
      channelLogin: "franchisepremierleague",
      clientId: "client-id",
      clientSecret: "client-secret",
      fetcher,
    });

    expect(clipRequests.length).toBe(2);
    expect(clipRequests[0]).toContain("started_at=");
    expect(clipRequests[1]).not.toContain("started_at=");
    expect(clips.map((clip) => clip.slug)).toEqual([
      "first-fpl-clip",
      "second-fpl-clip",
      "third-fpl-clip",
    ]);
  });

  it("returns no clips when credentials are missing", async () => {
    let fetchCalls = 0;

    const clips = await getTwitchChannelClips({
      channelLogin: "franchisepremierleague",
      clientId: "",
      clientSecret: "",
      fetcher: async () => {
        fetchCalls += 1;
        return okJson({});
      },
    });

    expect(clips).toEqual([]);
    expect(fetchCalls).toBe(0);
  });
});
