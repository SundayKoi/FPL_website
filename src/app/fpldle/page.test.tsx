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
  it("redirects forbidden callers instead of rendering a public puzzle shell", async () => {
    getFpldleGame.mockRejectedValue(new FpldleError("FORBIDDEN", "Admins only."));

    await FpldlePage();

    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("keeps unavailable-state handling for non-authorization failures", async () => {
    getFpldleGame.mockRejectedValue(new FpldleError("NO_EDITION", "No edition."));

    const page = await FpldlePage();
    render(page);

    expect(screen.getByTestId("fpldle-unavailable")).toBeTruthy();
  });
});
