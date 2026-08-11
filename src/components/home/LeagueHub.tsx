import TwitchShowcase from "./TwitchShowcase";
import HomeStandings from "./HomeStandings";
import WeeklyStandouts from "./WeeklyStandouts";
import UpcomingSchedule from "./UpcomingSchedule";
import { getTwitchChannelClips, getTwitchChannelStatus } from "@/lib/twitch/status";
import { fetchLatestWeeklyStandouts } from "@/lib/stats/weekly";
import { fetchHomepageStandings } from "@/lib/home/standings";
import { fetchHomepageSchedule } from "@/lib/home/schedule";

const TWITCH_URL = "https://www.twitch.tv/franchisepremierleague";
const TWITCH_CHANNEL_LOGIN = "franchisepremierleague";

export default async function LeagueHub() {
  const [twitchStatus, weeklyStandouts, standings, schedule] = await Promise.all([
    getTwitchChannelStatus({
      channelLogin: TWITCH_CHANNEL_LOGIN,
    }),
    fetchLatestWeeklyStandouts(5),
    fetchHomepageStandings(),
    fetchHomepageSchedule(),
  ]);
  const twitchClips =
    twitchStatus.state === "live"
      ? []
      : await getTwitchChannelClips({
          channelLogin: TWITCH_CHANNEL_LOGIN,
        });

  return (
    <main className="bg-hash flex-1">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-12 sm:px-6 sm:py-16">
        <section aria-label="Homepage dashboard" className="grid gap-6 lg:grid-cols-[2fr_1fr] xl:gap-8">
          <div className="flex min-w-0 flex-col gap-6">
            <TwitchShowcase
              channelLogin={TWITCH_CHANNEL_LOGIN}
              clips={twitchClips}
              streamState={twitchStatus.state}
              twitchUrl={TWITCH_URL}
            />
            <UpcomingSchedule schedule={schedule} />
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            <HomeStandings teams={standings} />
            <WeeklyStandouts standouts={weeklyStandouts} />
          </div>
        </section>
      </div>
    </main>
  );
}
