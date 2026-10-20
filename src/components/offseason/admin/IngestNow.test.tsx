import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OffseasonGame } from "@/lib/offseason/types";
import type { OffseasonAdminData } from "./shared";

const { ingestStatusAction, runIngestAction, refresh } = vi.hoisted(() => ({
  ingestStatusAction: vi.fn(),
  runIngestAction: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/offseason/actions", () => ({ ingestStatusAction, runIngestAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import IngestNow from "./IngestNow";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function game(id: string, riotMatchId: string | null, ingestedAt: string | null = null): OffseasonGame {
  return { id, match_id: "m1", game_number: 1, riot_match_id: riotMatchId, winner_team_id: null, ingested_at: ingestedAt, ingest_error: null };
}

function data(games: OffseasonGame[]): OffseasonAdminData {
  return {
    event: { id: "event", name: "Cup", status: "running", signups_open: false, yardstick_season: "S6", created_at: "" },
    entrants: [],
    weeks: [],
    entries: [],
    teams: [],
    members: [],
    matches: [],
    games,
    ratings: {},
    drafts: {},
    codes: [],
    subs: [],
    mvp: { nominees: [], lines: {} },
  };
}

const run = (id: number, status: string, conclusion: string | null = null) => ({
  id,
  status,
  conclusion,
  createdAt: "2026-10-20T03:00:00Z",
  url: `https://github.com/run/${id}`,
});
const status = (latest: ReturnType<typeof run> | null) => ({ ok: true, configured: true, run: latest, workflowUrl: "https://github.com/workflow" });
const button = () => screen.getByRole("button", { name: /Ingest/ }) as HTMLButtonElement;

describe("IngestNow", () => {
  it("starts the ingest and follows the run until the stats are in", async () => {
    ingestStatusAction
      .mockResolvedValueOnce(status(run(1, "completed", "success")))
      // GitHub hasn't listed the new run yet, then it runs, then it's done.
      .mockResolvedValueOnce(status(run(1, "completed", "success")))
      .mockResolvedValueOnce(status(run(2, "in_progress")))
      .mockResolvedValueOnce(status(run(2, "completed", "success")));
    runIngestAction.mockResolvedValue({ ok: true });
    render(<IngestNow data={data([game("g1", "NA1_1"), game("g2", "NA1_2"), game("g3", "NA1_3", "2026-10-19"), game("g4", null)])} pollMs={1} />);

    await waitFor(() => expect(screen.getByText(/^2 games waiting for stats\. Last run succeeded/)).toBeTruthy());
    fireEvent.click(button());
    await waitFor(() => expect(screen.getByText("Starting on GitHub…")).toBeTruthy());
    expect(button().textContent).toBe("Ingesting…");
    expect(button().disabled).toBe(true);
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Stats are in."));
    expect(runIngestAction).toHaveBeenCalledTimes(1);
    expect(ingestStatusAction).toHaveBeenCalledTimes(4);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "View run" }).getAttribute("href")).toBe("https://github.com/run/2");
  });

  it("says when the run fails", async () => {
    ingestStatusAction.mockResolvedValueOnce(status(run(4, "queued"))).mockResolvedValueOnce(status(run(4, "completed", "failure")));
    render(<IngestNow data={data([game("g1", "NA1_1")])} pollMs={1} />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("The ingest didn't finish cleanly. A game that failed says why on its row."));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows why it won't start", async () => {
    ingestStatusAction.mockResolvedValue(status(null));
    runIngestAction.mockResolvedValue({ ok: false, error: "An ingest is already running." });
    render(<IngestNow data={data([game("g1", "NA1_1")])} />);
    await waitFor(() => expect(button().disabled).toBe(false));
    fireEvent.click(button());
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("An ingest is already running."));
    expect(button().textContent).toBe("Ingest now");
  });

  it("waits for games with a match id", async () => {
    ingestStatusAction.mockResolvedValue(status(null));
    render(<IngestNow data={data([game("g1", null), game("g2", "NA1_2", "2026-10-19")])} />);
    await waitFor(() => expect(screen.getByText("No games waiting for stats.")).toBeTruthy());
    expect(button().disabled).toBe(true);
  });

  it("points to GitHub until the site has a token", async () => {
    ingestStatusAction.mockResolvedValue({ ok: true, configured: false, run: null, workflowUrl: "https://github.com/workflow" });
    render(<IngestNow data={data([game("g1", "NA1_1")])} />);
    await waitFor(() => expect(screen.getByRole("link", { name: "Ingest offseason games" }).getAttribute("href")).toBe("https://github.com/workflow"));
    expect(button().disabled).toBe(true);
  });
});
