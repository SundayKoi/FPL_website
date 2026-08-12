import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { from, fetchCaptainContext, fetchCodes, fetchMyReports, fetchMyResults, fetchMyRoster, fetchAnnouncements } =
  vi.hoisted(() => ({
    from: vi.fn(),
    fetchCaptainContext: vi.fn(),
    fetchCodes: vi.fn(),
    fetchMyReports: vi.fn(),
    fetchMyResults: vi.fn(),
    fetchMyRoster: vi.fn(),
    fetchAnnouncements: vi.fn(),
  }));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(async () => ({ from })),
}));

vi.mock("@/lib/captain/queries", () => ({
  fetchAnnouncements,
  fetchCaptainContext,
  fetchCodes,
  fetchMyReports,
  fetchMyResults,
  fetchMyRoster,
  MatchCode: {},
}));

vi.mock("@/components/captain/NextMatchCard", () => ({ default: () => <section>Next Match</section> }));
vi.mock("@/components/captain/TourneyCodes", () => ({ default: () => <section>Tourney Codes</section> }));
vi.mock("@/components/captain/ReportBox", () => ({ default: () => <section>Report a Result</section> }));
vi.mock("@/components/captain/MyRoster", () => ({ default: () => <section>My roster</section> }));
vi.mock("@/components/captain/MyResults", () => ({ default: () => <section>My results &amp; stats</section> }));
vi.mock("@/components/captain/Announcements", () => ({ default: () => <section>Announcements</section> }));
vi.mock("@/components/captain/CaptainGate", () => ({ default: () => <main>Captains only</main> }));
vi.mock("@/components/captain/AdminCodeEditor", () => ({ default: () => null }));
vi.mock("@/components/captain/AdminReportsQueue", () => ({ default: () => null }));
vi.mock("@/components/matches/LeagueTeamsEditor", () => ({ default: () => null }));
vi.mock("@/components/matches/RosterEditor", () => ({ default: () => null }));

import CaptainPage from "./page";

function query(result: unknown) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
  };
  return builder;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CaptainPage layout", () => {
  it("uses a wide responsive action layout and keeps lower sections below it", async () => {
    const team = { id: "team-1", name: "Team One" };
    fetchCaptainContext.mockResolvedValue({
      profileId: "profile-1",
      isAdmin: false,
      teams: [team],
      activeTeams: [team],
      myTeamId: team.id,
      season: "S5",
    });
    fetchCodes.mockResolvedValue([]);
    fetchMyReports.mockResolvedValue([]);
    fetchMyRoster.mockResolvedValue({ draftPlayers: [], riotAccounts: [] });
    fetchMyResults.mockResolvedValue({ games: [], players: [] });
    fetchAnnouncements.mockResolvedValue([]);
    from.mockImplementation((table: string) =>
      table === "fixtures" ? query({ data: [] }) : query({ data: { current_phase: "Regular" } }),
    );

    render(await CaptainPage({ searchParams: Promise.resolve({}) }));

    expect(document.querySelector(".max-w-7xl")).not.toBeNull();
    expect(document.querySelector(".lg\\:grid-cols-2")).not.toBeNull();
    const labels = [
      "Next Match",
      "Tourney Codes",
      "Report a Result",
      "My roster",
      "My results & stats",
      "Announcements",
    ];
    expect(labels.slice(0, -1).every((label, index) =>
      screen.getByText(label).compareDocumentPosition(screen.getByText(labels[index + 1])) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    )).toBe(true);
  });
});
