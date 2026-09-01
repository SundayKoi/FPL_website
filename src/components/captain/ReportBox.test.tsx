import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LeagueTeam } from "@/lib/matches/types";
import ReportBox from "./ReportBox";

const { submitReport } = vi.hoisted(() => ({ submitReport: vi.fn() }));

vi.mock("@/lib/captain/queries", () => ({ submitReport }));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    // Both pre-submit duplicate checks come back empty, so the only thing
    // that can block submission in these tests is form validation.
    from: () => ({ select: () => ({ in: () => Promise.resolve({ data: [] }) }) }),
  }),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const teams = [
  { id: "team-a", name: "Alcatraz", abbreviation: "ALC", active: true },
  { id: "team-b", name: "Wildcats", abbreviation: "WLD", active: true },
] as unknown as LeagueTeam[];

function renderBox() {
  return render(
    <ReportBox
      teams={teams}
      defaultSeason="S5"
      defaultPhase="Regular"
      fixtureId={null}
      prefillTeamAId="team-a"
      prefillTeamBId="team-b"
      myReports={[]}
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
