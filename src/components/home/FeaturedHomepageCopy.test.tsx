import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RegularSeasonHomePage from "./RegularSeasonHomePage";
import AcademyHomePage from "./AcademyHomePage";

const fixture = {
  id: "fixture-1",
  season: "S5",
  stage: "week_1" as const,
  division: "Solari",
  team_a: "Alpha",
  team_b: "Beta",
  scheduled_at: "2026-08-17T19:00:00Z",
  best_of: 3,
  score_a: null,
  score_b: null,
  sort_order: 1,
  created_at: "2026-08-01T00:00:00Z",
};

const { fetchHomepageFeaturedSettings } = vi.hoisted(() => ({
  fetchHomepageFeaturedSettings: vi.fn(),
}));

vi.mock("@/lib/twitch/status", () => ({
  getTwitchChannelStatus: vi.fn(async () => ({ state: "offline" })),
  getTwitchChannelClips: vi.fn(async () => []),
}));
vi.mock("@/lib/home/standings", () => ({ fetchHomepageStandings: vi.fn(async () => []) }));
vi.mock("@/lib/home/schedule", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/home/schedule")>()),
  fetchHomepageSchedule: vi.fn(async () => ({
    season: "S5",
    isNewestSeason: true,
    activeStage: "week_1",
    fixtures: [fixture],
  })),
}));
vi.mock("@/lib/home/awards", () => ({ fetchHomepageAwards: vi.fn(async () => ({})) }));
vi.mock("@/lib/home/homepageSettings", () => ({ fetchHomepageFeaturedSettings }));
vi.mock("@/lib/home/fetchBrief", () => ({ fetchActiveBrief: vi.fn(async () => null) }));
vi.mock("@/lib/teams/identity", () => ({ fetchTeamIdentities: vi.fn(async () => ({})) }));
vi.mock("@/lib/stats/weekly", () => ({ fetchLatestWeeklyStandouts: vi.fn(async () => []) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({})) }));
vi.mock("@/lib/academy/draft", () => ({
  fetchAcademyDraftData: vi.fn(async () => ({ teams: [{ name: "Alpha" }, { name: "Beta" }] })),
}));
vi.mock("@/lib/league/season", () => ({ fetchLeagueSeasons: vi.fn(async () => ({ premier: "S5", academy: "A1" })) }));
vi.mock("./HomeStandings", () => ({ default: () => <div /> }));
vi.mock("./AwardsDesk", () => ({ default: () => <div /> }));
vi.mock("./UpcomingSchedule", () => ({ default: () => <div /> }));
vi.mock("./HomeBrief", () => ({ default: () => <div /> }));
vi.mock("./WeeklyStandouts", () => ({ default: () => <div /> }));
vi.mock("@/components/LeaguePageToggle", () => ({ default: () => <div /> }));

beforeEach(() => {
  fetchHomepageFeaturedSettings.mockImplementation(async (homepage: string) =>
    homepage === "premier"
      ? { fixtureId: "fixture-1", title: "Premier spotlight", description: "Premier supporting copy" }
      : { fixtureId: "fixture-1", title: "Academy spotlight", description: "Academy supporting copy" },
  );
});

afterEach(() => cleanup());

describe("featured homepage copy", () => {
  it("renders Premier settings in the regular-season featured matchup", async () => {
    render(await RegularSeasonHomePage());

    expect(screen.getByRole("heading", { name: "Premier spotlight" })).not.toBeNull();
    expect(screen.getByText("Premier supporting copy")).not.toBeNull();
  });

  it("renders Academy settings in the Academy featured matchup", async () => {
    render(await AcademyHomePage());

    expect(screen.getByRole("heading", { name: "Academy spotlight" })).not.toBeNull();
    expect(screen.getByText("Academy supporting copy")).not.toBeNull();
  });
});
