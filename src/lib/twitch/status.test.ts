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

    expect(status).toEqual({ state: "live" });
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
  it("returns recent clips for the Twitch channel", async () => {
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

      return okJson({
        data: [
          { id: "first-fpl-clip", title: "First FPL clip", duration: 8.5 },
          { id: "second-fpl-clip", title: "", duration: 0 },
        ],
      });
    };

    const clips = await getTwitchChannelClips({
      channelLogin: "franchisepremierleague",
      clientId: "client-id",
      clientSecret: "client-secret",
      fetcher,
    });

    expect(clips).toEqual([
      { slug: "first-fpl-clip", title: "First FPL clip", durationSeconds: 9 },
      { slug: "second-fpl-clip", title: "FPL Twitch clip", durationSeconds: 30 },
    ]);
    expect(requests).toEqual([
      "https://id.twitch.tv/oauth2/token?client_id=client-id&client_secret=client-secret&grant_type=client_credentials",
      "https://api.twitch.tv/helix/users?login=franchisepremierleague",
      "https://api.twitch.tv/helix/clips?broadcaster_id=broadcaster-1&first=6",
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
