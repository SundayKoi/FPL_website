import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LeagueTeam } from "@/lib/matches/types";
import type { FixtureRow } from "@/lib/schedule/types";
import ReportBox from "./ReportBox";

const { submitReport, purgeMatchStats, tableRows } = vi.hoisted(() => ({
  submitReport: vi.fn(),
  purgeMatchStats: vi.fn(),
  /** What the two pre-submit duplicate checks find, per table. */
  tableRows: {} as Record<string, { match_id: string }[]>,
}));

vi.mock("@/lib/captain/queries", () => ({ submitReport, purgeMatchStats }));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    // Both pre-submit duplicate checks come back empty unless a test says
    // otherwise, so by default the only thing that can block submission is
    // form validation.
    from: (table: string) => ({
      select: () => ({ in: () => Promise.resolve({ data: tableRows[table] ?? [] }) }),
    }),
  }),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const teams = [
  { id: "team-a", name: "Alcatraz", abbreviation: "ALC", active: true },
  { id: "team-b", name: "Wildcats", abbreviation: "WLD", active: true },
] as unknown as LeagueTeam[];

function renderBox(props: { isAdmin?: boolean; fixtures?: FixtureRow[]; fixtureId?: string | null } = {}) {
  return render(
    <ReportBox
      teams={teams}
      defaultSeason="S5"
      defaultPhase="Regular"
      fixtureId={null}
      prefillTeamAId="team-a"
      prefillTeamBId="team-b"
      myReports={[]}
      {...props}
    />,
  );
}

/** Fill a report that is valid apart from whatever the test leaves out. */
function fillValidReport() {
  fireEvent.click(screen.getByRole("button", { name: /add game/i }));
  fireEvent.change(screen.getByPlaceholderText("NA1_1234567890"), {
    target: { value: "NA1_5623487837" },
  });
  fireEvent.change(screen.getByLabelText(/score a/i), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText(/score b/i), { target: { value: "1" } });
}

afterEach(() => {
  cleanup();
  submitReport.mockReset();
  purgeMatchStats.mockReset();
  for (const table of Object.keys(tableRows)) delete tableRows[table];
});

describe("ReportBox blue-side requirement", () => {
  // Regression: blue side used to be optional. A report submitted without it
  // looked fine, then parked on needs_side hours later inside the nightly
  // ingest where nobody was watching. Six of eight reports stalled this way.
  it("refuses to submit a game with no blue side chosen", async () => {
    renderBox();
    fillValidReport();
    fireEvent.click(screen.getByRole("button", { name: /submit report/i }));

    expect(await screen.findByText(/pick which team was on blue side/i)).toBeTruthy();
    expect(submitReport).not.toHaveBeenCalled();
  });

  it("submits once a blue side is chosen, and passes it through", async () => {
    renderBox();
    fillValidReport();
    fireEvent.change(screen.getByDisplayValue("Blue side?"), { target: { value: "team-b" } });
    fireEvent.click(screen.getByRole("button", { name: /submit report/i }));

    await waitFor(() => expect(submitReport).toHaveBeenCalledTimes(1));
    const input = submitReport.mock.calls[0][1] as { games: { blueTeamId: string | null }[] };
    expect(input.games[0].blueTeamId).toBe("team-b");
  });
});

describe("ReportBox draft prefill", () => {
  const draftPrefill = {
    draftUrl: "/match-draft/fixture-1",
    games: [
      { gameNumber: 1, blueTeamId: "team-a" },
      { gameNumber: 2, blueTeamId: "team-b" },
    ],
    scoreA: 2,
    scoreB: 0,
  };

  function renderPrefilled() {
    return render(
      <ReportBox
        teams={teams}
        defaultSeason="S5"
        defaultPhase="Regular"
        fixtureId="fixture-1"
        prefillTeamAId="team-a"
        prefillTeamBId="team-b"
        draftPrefill={draftPrefill}
        myReports={[]}
      />,
    );
  }

  it("pre-builds game rows with drafted blue sides, the draft URL, and the recorded score", () => {
    renderPrefilled();

    // Two rows, blue sides already set (no "Blue side?" placeholder left).
    expect(screen.getAllByPlaceholderText("NA1_1234567890")).toHaveLength(2);
    expect(screen.queryByDisplayValue("Blue side?")).toBeNull();
    expect((screen.getByLabelText(/draft url/i) as HTMLInputElement).value).toBe("/match-draft/fixture-1");
    expect((screen.getByLabelText(/score a/i) as HTMLInputElement).value).toBe("2");
    expect((screen.getByLabelText(/score b/i) as HTMLInputElement).value).toBe("0");
  });

  it("keeps drafted blue sides on parsed games", async () => {
    renderPrefilled();
    fireEvent.change(screen.getByPlaceholderText(/MIC 3-0 BBC/), {
      target: { value: "ALC 2-0 WLD\nhttps://drafter.lol/draft/abc?game=1 5568297187\nhttps://drafter.lol/draft/abc?game=2 5568352310" },
    });
    fireEvent.click(screen.getByRole("button", { name: /parse paste/i }));
    fireEvent.click(screen.getByRole("button", { name: /submit report/i }));

    await waitFor(() => expect(submitReport).toHaveBeenCalledTimes(1));
    const input = submitReport.mock.calls[0][1] as { games: { gameNumber: number; blueTeamId: string | null }[] };
    expect(input.games.map((g) => g.blueTeamId)).toEqual(["team-a", "team-b"]);
  });
});

describe("ReportBox forfeits", () => {
  // The case this exists for: a Bo3 where one team concedes after game one.
  // The series is 2-0, only one game has a Riot match id, and that game's
  // stats must still land — they are real games real players played, and the
  // cards are built off them.
  const selectForfeit = (teamId: string) =>
    fireEvent.change(screen.getByLabelText(/forfeit/i), { target: { value: teamId } });

  it("submits a short series when a forfeit explains the missing games", async () => {
    renderBox();
    fillValidReport();
    fireEvent.change(screen.getByDisplayValue("Blue side?"), { target: { value: "team-b" } });
    fireEvent.change(screen.getByLabelText(/score b/i), { target: { value: "0" } });
    selectForfeit("team-b");
    fireEvent.click(screen.getByRole("button", { name: /submit report/i }));

    await waitFor(() => expect(submitReport).toHaveBeenCalledTimes(1));
    const input = submitReport.mock.calls[0][1] as {
      forfeitTeamId: string | null;
      scoreA: number;
      games: unknown[];
    };
    expect(input.forfeitTeamId).toBe("team-b");
    // 2-0 reported, one game submitted. The gap IS the forfeit; the form must
    // not pad the games list out to match the score.
    expect(input.scoreA).toBe(2);
    expect(input.games).toHaveLength(1);
  });

  it("takes a no-show with no games at all, but only when a forfeit is named", async () => {
    renderBox();
    fireEvent.change(screen.getByLabelText(/score a/i), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText(/score b/i), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /submit report/i }));
    expect(await screen.findByText(/add at least one game, or record which team forfeited/i)).toBeTruthy();
    expect(submitReport).not.toHaveBeenCalled();

    selectForfeit("team-b");
    fireEvent.click(screen.getByRole("button", { name: /submit report/i }));
    await waitFor(() => expect(submitReport).toHaveBeenCalledTimes(1));
    const input = submitReport.mock.calls[0][1] as { games: unknown[]; forfeitTeamId: string | null };
    expect(input.games).toHaveLength(0);
    expect(input.forfeitTeamId).toBe("team-b");
  });

  it("refuses a forfeit scored as a win for the team that forfeited", async () => {
    // Caught here rather than on the public schedule, which is where the
    // ingest would otherwise put it once sync_fixture_score ran.
    renderBox();
    fireEvent.change(screen.getByLabelText(/score a/i), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText(/score b/i), { target: { value: "2" } });
    selectForfeit("team-b");
    fireEvent.click(screen.getByRole("button", { name: /submit report/i }));

    expect(await screen.findByText(/cannot be the higher score/i)).toBeTruthy();
    expect(submitReport).not.toHaveBeenCalled();
  });

  it("carries the reason through, and drops it if the forfeit is taken back", async () => {
    renderBox();
    fireEvent.change(screen.getByLabelText(/score a/i), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText(/score b/i), { target: { value: "0" } });
    selectForfeit("team-b");
    fireEvent.change(screen.getByPlaceholderText(/no show/i), { target: { value: "roster ineligible" } });
    fireEvent.click(screen.getByRole("button", { name: /submit report/i }));

    await waitFor(() => expect(submitReport).toHaveBeenCalledTimes(1));
    expect((submitReport.mock.calls[0][1] as { forfeitNote: string | null }).forfeitNote).toBe(
      "roster ineligible",
    );
  });
});

describe("ReportBox re-reporting an ingested game", () => {
  // The state this exists for: a series was reported wrong, ingested, and the
  // report deleted — which left its raw_stats rows behind. The form then
  // refused the match ids forever, with nothing an admin could do about it.
  const matchId = "NA1_5623487837";
  const fillAndSubmit = () => {
    fillValidReport();
    fireEvent.change(screen.getByDisplayValue("Blue side?"), { target: { value: "team-b" } });
    fireEvent.click(screen.getByRole("button", { name: /submit report/i }));
  };

  it("refuses a game another report still lists, with no purge on offer", async () => {
    tableRows.match_report_games = [{ match_id: matchId }];
    tableRows.raw_stats = [{ match_id: matchId }];
    renderBox({ isAdmin: true });
    fillAndSubmit();

    expect(await screen.findByText(/already reported: NA1_5623487837\. the existing report has to be deleted/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /clear ingested stats/i })).toBeNull();
    expect(submitReport).not.toHaveBeenCalled();
    expect(purgeMatchStats).not.toHaveBeenCalled();
  });

  it("tells a captain to ask an admin when only the stats are left", async () => {
    tableRows.raw_stats = [{ match_id: matchId }];
    renderBox();
    fillAndSubmit();

    expect(await screen.findByText(/stats for NA1_5623487837 were already ingested.*ask an admin/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /clear ingested stats/i })).toBeNull();
    expect(submitReport).not.toHaveBeenCalled();
  });

  it("lets an admin clear the leftover stats and file the report in one go", async () => {
    tableRows.raw_stats = [{ match_id: matchId }];
    purgeMatchStats.mockResolvedValue({ statsDeleted: 10, gamesReset: 0, reportsReset: 0 });
    renderBox({ isAdmin: true });
    fillAndSubmit();

    expect(await screen.findByText(/stats for NA1_5623487837 were already ingested.*clear them/i)).toBeTruthy();
    expect(submitReport).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /clear ingested stats and submit/i }));

    await waitFor(() => expect(submitReport).toHaveBeenCalledTimes(1));
    expect(purgeMatchStats).toHaveBeenCalledTimes(1);
    expect(purgeMatchStats.mock.calls[0][1]).toEqual([matchId]);
    expect(await screen.findByText(/report submitted\. the earlier stats for these games were cleared/i)).toBeTruthy();
  });

  it("shows a refused purge and does not file the report", async () => {
    tableRows.raw_stats = [{ match_id: matchId }];
    purgeMatchStats.mockRejectedValue(new Error("NOT_ADMIN: admin access required"));
    renderBox({ isAdmin: true });
    fillAndSubmit();
    fireEvent.click(await screen.findByRole("button", { name: /clear ingested stats and submit/i }));

    expect(await screen.findByText(/NOT_ADMIN: admin access required/)).toBeTruthy();
    expect(submitReport).not.toHaveBeenCalled();
  });
});

describe("ReportBox fixture link", () => {
  // The schedule, the match page and playoff advancement all find a report
  // through match_reports.fixture_id. The form used to set it from the
  // team's next unplayed fixture and nothing else, so a corrected series —
  // whose fixture already carried the wrong report's score — was filed
  // against nothing: right score on the schedule, no games, no winner
  // advanced, and no message anywhere saying why.
  const semifinal = {
    id: "semi-1",
    season: "S5",
    stage: "semifinals",
    division: null,
    team_a: "Alcatraz",
    team_b: "Wildcats",
    scheduled_at: "2026-09-28T20:00:00-04:00",
    best_of: 5,
    score_a: 3,
    score_b: 2,
    sort_order: 1,
    created_at: "2026-08-01T00:00:00Z",
  } as FixtureRow;
  const finals = { ...semifinal, id: "final-1", stage: "finals", team_a: "Wildcats", team_b: "Alcatraz", scheduled_at: "2026-10-05T20:00:00-04:00", score_a: null, score_b: null } as FixtureRow;
  const submitValid = () => {
    fillValidReport();
    fireEvent.change(screen.getByDisplayValue("Blue side?"), { target: { value: "team-b" } });
    fireEvent.click(screen.getByRole("button", { name: /submit report/i }));
  };
  const submittedFixtureId = () => (submitReport.mock.calls[0][1] as { fixtureId: string | null }).fixtureId;

  it("links a corrected series to its fixture even though that fixture already has a score", async () => {
    renderBox({ fixtures: [semifinal], fixtureId: null });

    const picker = screen.getByLabelText(/^fixture/i) as HTMLSelectElement;
    expect(picker.value).toBe("semi-1");
    expect(screen.getByText(/this fixture already has a score/i)).toBeTruthy();

    submitValid();
    await waitFor(() => expect(submitReport).toHaveBeenCalledTimes(1));
    expect(submittedFixtureId()).toBe("semi-1");
  });

  it("keeps the page's own fixture when the pair has several, and lets the reporter switch", async () => {
    renderBox({ fixtures: [semifinal, finals], fixtureId: "final-1" });
    const picker = screen.getByLabelText(/^fixture/i) as HTMLSelectElement;
    expect(picker.value).toBe("final-1");
    expect(picker.options).toHaveLength(3);

    fireEvent.change(picker, { target: { value: "semi-1" } });
    submitValid();
    await waitFor(() => expect(submitReport).toHaveBeenCalledTimes(1));
    expect(submittedFixtureId()).toBe("semi-1");
  });

  it("drops the link when the pair changes to teams with no fixture, rather than keep a wrong one", async () => {
    const withBears = [...teams, { id: "team-c", name: "Bears", abbreviation: "BRS", active: true }] as unknown as LeagueTeam[];
    render(
      <ReportBox
        teams={withBears}
        defaultSeason="S5"
        defaultPhase="Regular"
        fixtureId="semi-1"
        prefillTeamAId="team-a"
        prefillTeamBId="team-b"
        myReports={[]}
        fixtures={[semifinal]}
      />,
    );
    expect((screen.getByLabelText(/^fixture/i) as HTMLSelectElement).value).toBe("semi-1");

    fireEvent.change(screen.getByLabelText(/team b/i), { target: { value: "team-c" } });
    expect(screen.queryByLabelText(/^fixture/i)).toBeNull();

    fillValidReport();
    fireEvent.change(screen.getByDisplayValue("Blue side?"), { target: { value: "team-c" } });
    fireEvent.click(screen.getByRole("button", { name: /submit report/i }));
    await waitFor(() => expect(submitReport).toHaveBeenCalledTimes(1));
    expect(submittedFixtureId()).toBeNull();
  });

  it("still files against the page's fixture when no fixture list is given", async () => {
    renderBox({ fixtureId: "semi-1" });
    expect(screen.queryByLabelText(/^fixture/i)).toBeNull();
    submitValid();
    await waitFor(() => expect(submitReport).toHaveBeenCalledTimes(1));
    expect(submittedFixtureId()).toBe("semi-1");
  });
});
