import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HigherLowerPage from "./page";
import { HigherLowerError } from "@/lib/higher-lower/server";

vi.mock("server-only", () => ({}));

const { getHigherLowerGame } = vi.hoisted(() => ({
  getHigherLowerGame: vi.fn(),
}));

vi.mock("@/lib/higher-lower/server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/higher-lower/server")>("@/lib/higher-lower/server");
  return { ...actual, getHigherLowerGame };
});
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
  it("shows patron early-access guidance to denied callers", async () => {
    getHigherLowerGame.mockRejectedValue(new HigherLowerError("FORBIDDEN", "Higher or Lower is in early access for patrons, admins, and owners."));

    render(await HigherLowerPage());

    expect(screen.getByRole("heading", { name: /patron early access/i })).toBeTruthy();
    expect(screen.getByText(/patrons get early access to new features/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /patron benefits/i }).getAttribute("href")).toBe("/support-devs");
  });

  it("keeps card-edition unavailability inside the game page", async () => {
    getHigherLowerGame.mockRejectedValue(new HigherLowerError("NO_EDITION", "No edition."));

    const page = await HigherLowerPage();
    render(page);

    expect(screen.getByTestId("higher-lower-unavailable")).toBeTruthy();
  });
});
