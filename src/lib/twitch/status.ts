export type TwitchStreamState = "live" | "offline" | "unknown";

export type TwitchClip = {
  slug: string;
  title: string;
  durationSeconds: number;
  thumbnailUrl: string | null;
  creatorName: string | null;
  viewCount: number;
};

export type TwitchChannelStatus =
  | { state: "live"; viewerCount: number | null }
  | { state: "offline" }
  | { state: "unknown"; reason: "missing-credentials" | "request-failed" };

type TwitchStatusOptions = {
  channelLogin: string;
  clientId?: string;
  clientSecret?: string;
  fetcher?: typeof fetch;
};

type TwitchTokenResponse = {
  access_token?: string;
};

type TwitchUsersResponse = {
  data?: Array<{ id?: string }>;
};

type TwitchClipsResponse = {
  data?: Array<{
    duration?: number;
    id?: string;
    title?: string;
    thumbnail_url?: string;
    creator_name?: string;
    view_count?: number;
  }>;
};

type TwitchStreamsResponse = {
  data?: { viewer_count?: number }[];
};

async function getTwitchAppAccessToken({
  clientId,
  clientSecret,
  fetcher,
}: Required<Pick<TwitchStatusOptions, "clientId" | "clientSecret" | "fetcher">>) {
  const tokenParams = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
  });
  const tokenResponse = await fetcher(
    `https://id.twitch.tv/oauth2/token?${tokenParams.toString()}`,
    { method: "POST", next: { revalidate: 3600 } } as RequestInit,
  );

  if (!tokenResponse.ok) {
    return null;
  }

  const tokenBody = (await tokenResponse.json()) as TwitchTokenResponse;
  return tokenBody.access_token ?? null;
}

export async function getTwitchChannelStatus({
  channelLogin,
  clientId = process.env.TWITCH_CLIENT_ID,
  clientSecret = process.env.TWITCH_CLIENT_SECRET,
  fetcher = fetch,
}: TwitchStatusOptions): Promise<TwitchChannelStatus> {
  if (!clientId || !clientSecret) {
    return { state: "unknown", reason: "missing-credentials" };
  }

  try {
    const accessToken = await getTwitchAppAccessToken({ clientId, clientSecret, fetcher });
    if (!accessToken) {
      return { state: "unknown", reason: "request-failed" };
    }

    const streamsParams = new URLSearchParams({ user_login: channelLogin });
    const streamsResponse = await fetcher(
      `https://api.twitch.tv/helix/streams?${streamsParams.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Client-Id": clientId,
        },
        next: { revalidate: 60 },
      } as RequestInit,
    );

    if (!streamsResponse.ok) {
      return { state: "unknown", reason: "request-failed" };
    }

    const streamsBody = (await streamsResponse.json()) as TwitchStreamsResponse;
    if (!streamsBody.data?.length) return { state: "offline" };
    const viewerCount = streamsBody.data[0]?.viewer_count;
    return { state: "live", viewerCount: typeof viewerCount === "number" ? viewerCount : null };
  } catch {
    return { state: "unknown", reason: "request-failed" };
  }
}

export async function getTwitchChannelClips({
  channelLogin,
  clientId = process.env.TWITCH_CLIENT_ID,
  clientSecret = process.env.TWITCH_CLIENT_SECRET,
  fetcher = fetch,
}: TwitchStatusOptions): Promise<TwitchClip[]> {
  if (!clientId || !clientSecret) {
    return [];
  }

  try {
    const accessToken = await getTwitchAppAccessToken({ clientId, clientSecret, fetcher });
    if (!accessToken) {
      return [];
    }

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": clientId,
    };
    const usersParams = new URLSearchParams({ login: channelLogin });
    const usersResponse = await fetcher(
      `https://api.twitch.tv/helix/users?${usersParams.toString()}`,
      { headers, next: { revalidate: 3600 } } as RequestInit,
    );

    if (!usersResponse.ok) {
      return [];
    }

    const usersBody = (await usersResponse.json()) as TwitchUsersResponse;
    const broadcasterId = usersBody.data?.[0]?.id;
    if (!broadcasterId) {
      return [];
    }

    const fetchClips = async (windowDays?: number): Promise<TwitchClip[]> => {
      const clipsParams = new URLSearchParams({
        broadcaster_id: broadcasterId,
        first: "10",
      });
      if (windowDays) {
        clipsParams.set("started_at", new Date(Date.now() - windowDays * 86_400_000).toISOString());
      }
      const clipsResponse = await fetcher(
        `https://api.twitch.tv/helix/clips?${clipsParams.toString()}`,
        { headers, next: { revalidate: 300 } } as RequestInit,
      );

      if (!clipsResponse.ok) {
        return [];
      }

      const clipsBody = (await clipsResponse.json()) as TwitchClipsResponse;
      return (
        clipsBody.data
          ?.filter((clip) => clip.id)
          .map((clip) => ({
            slug: clip.id ?? "",
            title: clip.title?.trim() || "FPL Twitch clip",
            durationSeconds: clip.duration ? Math.ceil(clip.duration) : 30,
            thumbnailUrl: clip.thumbnail_url ?? null,
            creatorName: clip.creator_name?.trim() || null,
            viewCount: clip.view_count ?? 0,
          })) ?? []
      );
    };

    // prefer this month's highlights; fall back to all-time when the recent
    // window is too thin to make a reel
    const recent = await fetchClips(30);
    if (recent.length >= 3) {
      return recent;
    }
    const allTime = await fetchClips();
    return allTime.length > recent.length ? allTime : recent;
  } catch {
    return [];
  }
}
