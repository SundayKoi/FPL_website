import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AcademyBoxScorePage from "./page";
import { BoxScoreError } from "@/lib/box-score/server";

vi.mock("server-only", () => ({}));

const { getBoxScoreGame, redirect } = vi.hoisted(() => ({
  getBoxScoreGame: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/box-score/server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/box-score/server")>("@/lib/box-score/server");
  return { ...actual, getBoxScoreGame };
});
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/components/box-score/BoxScoreBoard", () => ({ default: () => <div data-testid="box-score-board" /> }));
vi.mock("@/components/box-score/BoxScoreUnavailable", () => ({ default: () => <div data-testid="box-score-unavailable" /> }));
vi.mock("@/lib/box-score/actions", () => ({
  resetBoxScorePuzzleAction: vi.fn(),
  submitBoxScoreGuessAction: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AcademyBoxScorePage", () => {
  it("keeps the Academy route behind the admin test gate", async () => {
    getBoxScoreGame.mockRejectedValue(new BoxScoreError("FORBIDDEN", "Admin testing only."));

    await AcademyBoxScorePage();

    expect(redirect).toHaveBeenCalledWith("/premium?league=academy");
  });
});
