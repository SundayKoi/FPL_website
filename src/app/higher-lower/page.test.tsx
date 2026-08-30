import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HigherLowerPage from "./page";
import { HigherLowerError } from "@/lib/higher-lower/server";

vi.mock("server-only", () => ({}));

const { getHigherLowerGame, redirect } = vi.hoisted(() => ({
  getHigherLowerGame: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/higher-lower/server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/higher-lower/server")>("@/lib/higher-lower/server");
  return { ...actual, getHigherLowerGame };
});
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/components/higher-lower/HigherLowerBoard", () => ({ default: () => <div data-testid="higher-lower-board" /> }));
vi.mock("@/components/higher-lower/HigherLowerUnavailable", () => ({ default: () => <div data-testid="higher-lower-unavailable" /> }));
vi.mock("@/lib/higher-lower/actions", () => ({
  advanceHigherLowerRoundAction: vi.fn(),
  startHigherLowerRunAction: vi.fn(),
  submitHigherLowerChoiceAction: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HigherLowerPage", () => {
  it("redirects non-premium callers to Premium HQ", async () => {
    getHigherLowerGame.mockRejectedValue(new HigherLowerError("FORBIDDEN", "Premium members only."));

    await HigherLowerPage();

    expect(redirect).toHaveBeenCalledWith("/premium");
  });

  it("keeps card-edition unavailability inside the game page", async () => {
    getHigherLowerGame.mockRejectedValue(new HigherLowerError("NO_EDITION", "No edition."));

    const page = await HigherLowerPage();
    render(page);

    expect(screen.getByTestId("higher-lower-unavailable")).toBeTruthy();
  });
});
