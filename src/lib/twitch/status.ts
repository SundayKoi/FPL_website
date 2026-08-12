export type TwitchStreamState = "live" | "offline" | "unknown";

export type TwitchClip = {
  slug: string;
  title: string;
  durationSeconds: number;
};

export type TwitchChannelStatus =
  | { state: "live" }
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
  }>;
};

type TwitchStreamsResponse = {
  data?: unknown[];
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
    return streamsBody.data?.length ? { state: "live" } : { state: "offline" };
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

    const clipsParams = new URLSearchParams({
      broadcaster_id: broadcasterId,
      first: "6",
    });
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
        })) ?? []
    );
  } catch {
    return [];
  }
}
