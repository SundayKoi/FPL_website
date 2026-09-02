import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { premiumAccessMock, loadSnapshotMock, loadPaymentMock } = vi.hoisted(() => ({
  premiumAccessMock: vi.fn(),
  loadSnapshotMock: vi.fn(),
  loadPaymentMock: vi.fn(),
}));

vi.mock("@/lib/premium/access", () => ({ premiumAccess: premiumAccessMock }));
vi.mock("@/lib/premium/preview", () => ({
  loadPremiumHubSnapshot: loadSnapshotMock,
  loadPremiumPaymentHref: loadPaymentMock,
  resolvePremiumLeague: (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value[0] : value) === "academy" ? "academy" : "premier",
}));

import { PremiumPageView } from "./view";

const emptySnapshot = {
  league: "premier" as const,
  cards: { status: "empty" as const, message: "No rated cards are available yet." },
  betting: { status: "empty" as const, message: "No betting events are live right now." },
  banger: { status: "empty" as const, message: "The next take is warming up." },
};

beforeEach(() => {
  premiumAccessMock.mockReset();
  loadSnapshotMock.mockReset();
  loadPaymentMock.mockReset();
  loadPaymentMock.mockResolvedValue("https://www.paypal.com/paypalme/DraftFPL");
  loadSnapshotMock.mockResolvedValue(emptySnapshot);
});

afterEach(() => cleanup());

describe("PremiumPageView", () => {
  it("shows the official payment gate to signed-out visitors", async () => {
    premiumAccessMock.mockResolvedValue({ signedIn: false, allowed: false, inconclusive: false });

    render(await PremiumPageView({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: /premium hq is locked/i })).toBeTruthy();
    expect(screen.getByText(/fpl premium is only \$10/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /get fpl premium/i }).getAttribute("href")).toBe(
      "https://www.paypal.com/paypalme/DraftFPL",
    );
    expect(screen.getByRole("link", { name: /sign in with discord/i }).getAttribute("href")).toBe(
      "/login?redirect=/premium",
    );
    expect(loadSnapshotMock).not.toHaveBeenCalled();
  });

  it("shows Premium HQ without pricing or payment details to members", async () => {
    premiumAccessMock.mockResolvedValue({ signedIn: true, allowed: true, inconclusive: false });
    loadSnapshotMock.mockResolvedValue({ ...emptySnapshot, league: "academy" as const });

    render(await PremiumPageView({ searchParams: Promise.resolve({ league: "academy" }) }));

    expect(screen.getByRole("heading", { name: "Premium HQ" })).toBeTruthy();
    expect(screen.queryByText(/fpl premium is only \$10/i)).toBeNull();
    expect(screen.queryByRole("link", { name: /paypal/i })).toBeNull();
    expect(screen.getByText(/fpl does not condone or endorse any tweets made by stu/i)).toBeTruthy();
    const destinations = screen.getByRole("navigation", { name: "Premium destinations" });
    expect(within(destinations).getByRole("link", { name: /^Cards/ }).getAttribute("href")).toBe("/cards");
    expect(within(destinations).getByRole("link", { name: /Betting Exchange/ }).getAttribute("href")).toBe("/betting");
    expect(within(destinations).getByRole("link", { name: /The Daily Stu/ }).getAttribute("href")).toBe("/bangers");
    expect(within(destinations).getByRole("link", { name: /Match Drafter/ }).getAttribute("href")).toBe("/drafter");
    expect(screen.getByRole("link", { name: "Academy" }).getAttribute("aria-current")).toBe("page");
    expect(loadSnapshotMock).toHaveBeenCalledWith("academy");
    expect(loadPaymentMock).not.toHaveBeenCalled();
  });
});
