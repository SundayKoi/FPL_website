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
