import {
  getTwitchChannelClips,
  getTwitchChannelStatus,
  type TwitchChannelStatus,
  type TwitchClip,
} from "@/lib/twitch/status";
import {
  TWITCH_CHANNEL_LOGIN,
} from "./twitchChannels";

export {
  KNOWN_TWITCH_CHANNELS,
  TWITCH_CHANNEL_LOGIN,
  TWITCH_URL,
  twitchChannelLoginFromUrl,
  twitchUrlFromUrl,
} from "./twitchChannels";

export type HomepageTwitchData = {
  status: TwitchChannelStatus;
  clips: TwitchClip[];
};


/** Channel status plus clips — clips only show while offline, so a live stream skips the fetch. */
export async function fetchHomepageTwitch(channelLogin = TWITCH_CHANNEL_LOGIN): Promise<HomepageTwitchData> {
  const status = await getTwitchChannelStatus({ channelLogin });
  const clips =
    status.state === "live" ? [] : await getTwitchChannelClips({ channelLogin });
  return { status, clips };
}
