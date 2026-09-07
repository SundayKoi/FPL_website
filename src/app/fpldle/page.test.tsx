import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import FpldlePage from "./page";
import { FpldleError } from "@/lib/fpldle/server";

vi.mock("server-only", () => ({}));

const { getFpldleGame, redirect } = vi.hoisted(() => ({
  getFpldleGame: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/fpldle/server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/fpldle/server")>("@/lib/fpldle/server");
  return { ...actual, getFpldleGame };
});
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/components/fpldle/FpldleBoard", () => ({ default: () => <div data-testid="fpldle-board" /> }));
vi.mock("@/components/fpldle/FpldleUnavailable", () => ({ default: () => <div data-testid="fpldle-unavailable" /> }));
vi.mock("@/lib/fpldle/actions", () => ({
  resetFpldlePuzzleAction: vi.fn(),
  submitFpldleGuessAction: vi.fn(),
  revealFpldleAnswerAction: vi.fn(),
}));

afterEach(() => cleanup());

describe("FpldlePage", () => {
  it("walls non-premium callers instead of bouncing them to Premium HQ", async () => {
    getFpldleGame.mockRejectedValue(new FpldleError("FORBIDDEN", "FPL'dle is available to Premium members."));

    render(await FpldlePage());

    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByTestId("access-wall").getAttribute("data-reason")).toBe("no-role");
    expect(screen.getByRole("link", { name: /discord/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /what fpl premium is/i }).getAttribute("href")).toBe("/membership");
  });

  it("keeps unavailable-state handling for non-authorization failures", async () => {
    getFpldleGame.mockRejectedValue(new FpldleError("NO_EDITION", "No edition."));

    const page = await FpldlePage();
    render(page);

    expect(screen.getByTestId("fpldle-unavailable")).toBeTruthy();
  });
});
