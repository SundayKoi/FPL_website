import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminGenerateGauntlet from "./AdminGenerateGauntlet";
import type { GauntletPreview } from "@/lib/schedule/gauntlet-actions";
import type { FixtureRow } from "@/lib/schedule/types";

const { previewGauntletAction, drawGauntletAction, seedRoundTwoAction, refresh } = vi.hoisted(() => ({
  previewGauntletAction: vi.fn(),
  drawGauntletAction: vi.fn(),
  seedRoundTwoAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/schedule/gauntlet-actions", () => ({
  previewGauntletAction,
  drawGauntletAction,
  seedRoundTwoAction,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const seeds = {
  Solari: ["S1", "S2", "S3", "S4", "S5", "S6"],
  Lunari: ["L1", "L2", "L3", "L4", "L5", "L6"],
};

const fixture = (overrides: Partial<FixtureRow>): FixtureRow => ({
  id: "fixture-id",
  season: "S5",
  stage: "gauntlet_r2",
  division: null,
  team_a: null,
  team_b: null,
  scheduled_at: null,
  best_of: 3,
  score_a: null,
  score_b: null,
  sort_order: 0,
  created_at: "2026-09-18T00:00:00Z",
  ...overrides,
});

const preview = (overrides: Partial<GauntletPreview> = {}): GauntletPreview => ({
  seeds,
  roundOne: [
    { stage: "gauntlet_r1", division: null, team_a: "S5", team_b: "L6", best_of: 1, sort_order: 0, scheduled_at: null },
    { stage: "gauntlet_r1", division: null, team_a: "L5", team_b: "S6", best_of: 1, sort_order: 1, scheduled_at: null },
    { stage: "gauntlet_r2", division: null, team_a: "S4", team_b: null, best_of: 3, sort_order: 0, scheduled_at: null },
    { stage: "gauntlet_r2", division: null, team_a: "L4", team_b: null, best_of: 3, sort_order: 1, scheduled_at: null },
  ],
  existing: { r1: [], r2: [] },
  roundOneResults: [],
  roundTwo: null,
  ...overrides,
});

/** A preview whose round 1 is decided, with the result read from `source`. */
const playedRoundOne = (source: "fixture" | "report"): GauntletPreview =>
  preview({
    existing: {
      r1: [
        fixture({ id: "r1a", stage: "gauntlet_r1", team_a: "S5", team_b: "L6", best_of: 1 }),
        fixture({ id: "r1b", stage: "gauntlet_r1", team_a: "L5", team_b: "S6", best_of: 1 }),
      ],
      r2: [fixture({ id: "r2", team_a: "S4" })],
    },
    roundOneResults: [
      {
        fixtureId: "r1a",
        team_a: "S5",
        team_b: "L6",
        result: { team_a: "S5", team_b: "L6", score_a: 1, score_b: 0 },
        source,
        note: null,
      },
      {
        fixtureId: "r1b",
        team_a: "L5",
        team_b: "S6",
        result: { team_a: "L5", team_b: "S6", score_a: 0, score_b: 1 },
        source,
        note: null,
      },
    ],
    roundTwo: [
      { team_a: "L4", team_b: "S5" },
      { team_a: "S4", team_b: "L5" },
    ],
  });

beforeEach(() => {
  previewGauntletAction.mockResolvedValue({ ok: true, preview: preview() });
  drawGauntletAction.mockResolvedValue({ ok: true, count: 4 });
  seedRoundTwoAction.mockResolvedValue({ ok: true, count: 2 });
});

afterEach(() => {
  vi.restoreAllMocks();
  previewGauntletAction.mockReset();
  drawGauntletAction.mockReset();
  seedRoundTwoAction.mockReset();
  refresh.mockReset();
});

const drawButton = () => screen.getByRole("button", { name: /Draw round 1/ });

describe("AdminGenerateGauntlet", () => {
  it("shows both divisions' seeds with the gauntlet trio marked, and the pairings it would draw", async () => {
    render(<AdminGenerateGauntlet season="S5" />);

    expect(await screen.findByText("1. S1")).toBeTruthy();
    expect(screen.getByText("4. S4 · gauntlet")).toBeTruthy();
    expect(screen.getByText("5. S5 · gauntlet")).toBeTruthy();
    expect(screen.getByText("6. L6 · gauntlet")).toBeTruthy();
    expect(screen.getByText("S5 vs L6")).toBeTruthy();
    expect(screen.getByText("L5 vs S6")).toBeTruthy();
    expect(screen.getByText("S4 vs TBD")).toBeTruthy();
    expect(previewGauntletAction).toHaveBeenCalledWith("S5");
  });

  it("shows a preview failure verbatim", async () => {
    previewGauntletAction.mockResolvedValue({
      ok: false,
      error: "Lunari has only 5 teams in the standings — the gauntlet needs 6 seeds per division.",
    });

    render(<AdminGenerateGauntlet season="S5" />);

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Lunari has only 5 teams in the standings — the gauntlet needs 6 seeds per division.",
    );
  });

  it("keeps the draw disabled until a kickoff is set, then sends it as an ISO instant", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminGenerateGauntlet season="S5" />);
    await screen.findByText("1. S1");

    expect(drawButton().hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText("Gauntlet kickoff"), {
      target: { value: "2026-09-21T20:00" },
    });
    expect(drawButton().hasAttribute("disabled")).toBe(false);

    fireEvent.click(drawButton());

    await waitFor(() => {
      expect(drawGauntletAction).toHaveBeenCalledWith(
        "S5",
        new Date("2026-09-21T20:00").toISOString(),
      );
      expect(refresh).toHaveBeenCalled();
    });
    expect(await screen.findByText("Drew 4 gauntlet fixtures.")).toBeTruthy();
  });

  it("writes nothing when the confirmation is declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<AdminGenerateGauntlet season="S5" />);
    await screen.findByText("1. S1");

    fireEvent.change(screen.getByLabelText("Gauntlet kickoff"), {
      target: { value: "2026-09-21T20:00" },
    });
    fireEvent.click(drawButton());

    expect(drawGauntletAction).not.toHaveBeenCalled();
  });

  it("hides round-2 seeding while the preview has no pairings", async () => {
    render(<AdminGenerateGauntlet season="S5" />);
    await screen.findByText("1. S1");

    expect(screen.queryByRole("button", { name: "Seed round 2 from results" })).toBeNull();
  });

  it("offers round-2 seeding once the preview has pairings and a TBD row to fill", async () => {
    previewGauntletAction.mockResolvedValue({ ok: true, preview: playedRoundOne("fixture") });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminGenerateGauntlet season="S5" />);

    fireEvent.click(await screen.findByRole("button", { name: "Seed round 2 from results" }));

    await waitFor(() => expect(seedRoundTwoAction).toHaveBeenCalledWith("S5"));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("L4 vs S5"));
    expect(window.confirm).not.toHaveBeenCalledWith(expect.stringContaining("not confirmed yet"));
    expect(await screen.findByText("Seeded 2 round-2 fixtures.")).toBeTruthy();
  });

  it("says where each round-1 result came from", async () => {
    previewGauntletAction.mockResolvedValue({ ok: true, preview: playedRoundOne("report") });
    render(<AdminGenerateGauntlet season="S5" />);

    expect(
      await screen.findByText(/S5 vs L6 — 1-0 · from captain's report \(not ingested yet\)/),
    ).toBeTruthy();
    expect(screen.getByText(/L5 vs S6 — 0-1 · from captain's report/)).toBeTruthy();
  });

  it("names the round-1 series that still has no result", async () => {
    const waiting = playedRoundOne("fixture");
    previewGauntletAction.mockResolvedValue({
      ok: true,
      preview: {
        ...waiting,
        roundOneResults: [
          waiting.roundOneResults[0],
          { ...waiting.roundOneResults[1], result: null, source: null, note: "waiting on the captains" },
        ],
        roundTwo: null,
      },
    });
    render(<AdminGenerateGauntlet season="S5" />);

    expect(
      await screen.findByText(/L5 vs S6 — no result yet \(waiting on the captains\)/),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Seed round 2 from results" })).toBeNull();
  });

  it("warns in the confirmation when a pairing rests on an un-ingested report", async () => {
    previewGauntletAction.mockResolvedValue({ ok: true, preview: playedRoundOne("report") });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminGenerateGauntlet season="S5" />);

    fireEvent.click(await screen.findByRole("button", { name: "Seed round 2 from results" }));

    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining("the stats ingest has not confirmed yet"),
    );
  });

  it("shows an action failure verbatim", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    drawGauntletAction.mockResolvedValue({ ok: false, error: "Admins only." });
    render(<AdminGenerateGauntlet season="S5" />);
    await screen.findByText("1. S1");

    fireEvent.change(screen.getByLabelText("Gauntlet kickoff"), {
      target: { value: "2026-09-21T20:00" },
    });
    fireEvent.click(drawButton());

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Admins only.");
  });
});
