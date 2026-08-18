import {
  getTwitchChannelClips,
  getTwitchChannelStatus,
  type TwitchChannelStatus,
  type TwitchClip,
} from "@/lib/twitch/status";

// Academy plays on the league's channel, same broadcast as Premier.
export const TWITCH_URL = "https://www.twitch.tv/franchisepremierleague";
export const TWITCH_CHANNEL_LOGIN = "franchisepremierleague";

export type HomepageTwitchData = {
  status: TwitchChannelStatus;
  clips: TwitchClip[];
};

/** Channel status plus clips — clips only show while offline, so a live stream skips the fetch. */
export async function fetchHomepageTwitch(): Promise<HomepageTwitchData> {
  const status = await getTwitchChannelStatus({ channelLogin: TWITCH_CHANNEL_LOGIN });
  const clips =
    status.state === "live" ? [] : await getTwitchChannelClips({ channelLogin: TWITCH_CHANNEL_LOGIN });
  return { status, clips };
}
