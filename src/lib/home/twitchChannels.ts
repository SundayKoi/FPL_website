export const TWITCH_URL = "https://www.twitch.tv/franchisepremierleague";
export const TWITCH_CHANNEL_LOGIN = "franchisepremierleague";

export const KNOWN_TWITCH_CHANNELS = [
  { label: "Franchise Premier League", url: TWITCH_URL },
  { label: "Jakeok1", url: "https://www.twitch.tv/jakeok1" },
] as const;

/** Returns the channel login for a Twitch channel URL, or the league default
 * when the saved value is missing or not a single HTTPS Twitch channel URL. */
export function twitchChannelLoginFromUrl(value: string | null | undefined): string {
  if (!value) return TWITCH_CHANNEL_LOGIN;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["twitch.tv", "www.twitch.tv"].includes(url.hostname)) {
      return TWITCH_CHANNEL_LOGIN;
    }
    const segments = url.pathname.split("/").filter(Boolean);
    return segments.length === 1 ? segments[0] : TWITCH_CHANNEL_LOGIN;
  } catch {
    return TWITCH_CHANNEL_LOGIN;
  }
}

export function twitchUrlFromUrl(value: string | null | undefined): string {
  return `https://www.twitch.tv/${twitchChannelLoginFromUrl(value)}`;
}
