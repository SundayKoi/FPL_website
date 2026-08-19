import type { TickerItem } from "@/components/home/LiveTicker";
import type { HomepageAwardsData } from "./awards";
import type { HomeStandingTeam } from "./standings";
import type { FixtureRow } from "@/lib/schedule/types";
import { formatKickoff } from "@/lib/schedule/format";

const MAX_RESULTS = 4;
const MAX_UPCOMING = 4;

/**
 * The homepage ticker's items, in broadcast order: live status, finals from
 * the active week, what's up next, the standings leader, and the week's
 * award headliners. Pure so both league homepages (and tests) can build it
 * from data they already fetched.
 */
export function buildTickerItems(input: {
  live: boolean;
  fixtures: FixtureRow[];
  standings: HomeStandingTeam[];
  awards: HomepageAwardsData;
}): TickerItem[] {
  const items: TickerItem[] = [];

  if (input.live) {
    items.push({ key: "live", label: "● Live", text: "FPL broadcast on air now — watch the featured matchup", tone: "pink" });
  }

  const finals = input.fixtures
    .filter((fixture) => fixture.score_a !== null && fixture.score_b !== null && fixture.team_a && fixture.team_b)
    .slice(0, MAX_RESULTS);
  for (const fixture of finals) {
    items.push({
      key: `final-${fixture.id}`,
      label: "Final",
      text: `${fixture.team_a} ${fixture.score_a}–${fixture.score_b} ${fixture.team_b}`,
      tone: "mint",
    });
  }

  const upcoming = input.fixtures
    .filter((fixture) => fixture.score_a === null && fixture.score_b === null && fixture.team_a && fixture.team_b)
    .slice(0, MAX_UPCOMING);
  for (const fixture of upcoming) {
    items.push({
      key: `next-${fixture.id}`,
      label: "Up next",
      text: `${fixture.team_a} vs ${fixture.team_b}${fixture.scheduled_at ? ` · ${formatKickoff(fixture.scheduled_at)}` : ""}`,
      tone: "coral",
    });
  }

  const leader = input.standings[0];
  if (leader && leader.wins + leader.losses > 0) {
    items.push({
      key: "leader",
      label: "Leader",
      text: `${leader.name} ${leader.wins}–${leader.losses}`,
      tone: "gold",
    });
  }

  const potw = input.awards?.playerOfWeek;
  if (potw?.name && potw.value !== "—") {
    items.push({ key: "potw", label: "Player of the week", text: `${potw.name} · ${potw.value} power`, tone: "cyan" });
  }

  const riser = (input.awards?.individualAwards ?? []).find((award) => award.title === "Biggest Riser");
  if (riser?.name && riser.value !== "—") {
    items.push({ key: "riser", label: "Riser", text: `${riser.name} ${riser.value} power this week`, tone: "mint" });
  }

  return items;
}
