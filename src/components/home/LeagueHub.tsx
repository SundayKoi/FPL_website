import Link from "next/link";
import TwitchShowcase from "./TwitchShowcase";
import WeeklyStandouts from "./WeeklyStandouts";
import { getTwitchChannelClips, getTwitchChannelStatus } from "@/lib/twitch/status";
import { fetchLatestWeeklyStandouts } from "@/lib/stats/weekly";

const TWITCH_URL = "https://www.twitch.tv/franchisepremierleague";
const TWITCH_CHANNEL_LOGIN = "franchisepremierleague";

export default async function LeagueHub() {
  const twitchStatus = await getTwitchChannelStatus({
    channelLogin: TWITCH_CHANNEL_LOGIN,
  });
  const twitchClips =
    twitchStatus.state === "live"
      ? []
      : await getTwitchChannelClips({
          channelLogin: TWITCH_CHANNEL_LOGIN,
        });
  const weeklyStandouts = await fetchLatestWeeklyStandouts(5);

  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
        <section
          aria-labelledby="league-title"
          className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] xl:gap-12"
        >
          <div className="flex flex-col justify-center py-5 sm:py-10">
            <span className="label-dash">FRANCHISE PREMIER LEAGUE</span>
            <h1
              id="league-title"
              className="type-display mt-3 max-w-3xl text-5xl leading-[0.9] sm:text-7xl"
            >
              The league never stops.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-steel sm:text-lg">
              Follow every draft, rivalry, and roster move in League of Legends&apos;
              competitive fantasy league.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href={TWITCH_URL}
                target="_blank"
                rel="noreferrer"
                className="btn-pill focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
              >
                Watch on Twitch ↗
              </a>
              <Link
                href="/draft"
                className="rounded-full border border-steel px-5 py-2 text-sm font-semibold text-white hover:border-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
              >
                Explore draft central
              </Link>
            </div>
          </div>
          <WeeklyStandouts standouts={weeklyStandouts} />
          <div className="lg:col-span-2">
            <TwitchShowcase
              channelLogin={TWITCH_CHANNEL_LOGIN}
              clips={twitchClips}
              streamState={twitchStatus.state}
              twitchUrl={TWITCH_URL}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
