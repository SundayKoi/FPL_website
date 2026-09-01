import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getBettingUser } = vi.hoisted(() => ({ getBettingUser: vi.fn() }));
vi.mock("@/lib/betting/wallet", () => ({ getBettingUser }));

const { createBettingServiceClient } = vi.hoisted(() => ({ createBettingServiceClient: vi.fn(() => ({})) }));
vi.mock("@/lib/betting/service-client", () => ({ createBettingServiceClient }));

const { fetchCardSeason } = vi.hoisted(() => ({ fetchCardSeason: vi.fn() }));
vi.mock("@/lib/cards/queries", () => ({ fetchCardSeason }));

vi.mock("@/lib/expeditions/queries", () => ({ fetchDeployedCopyIds: vi.fn(async () => new Set()) }));
vi.mock("@/lib/packs/queries", () => ({ fetchInventory: vi.fn(async () => []) }));
vi.mock("@/lib/trades/queries", () => ({ isAltArt: () => false }));
vi.mock("@/lib/market/queries", () => ({
  fetchOpenListings: vi.fn(async () => []),
  fetchListingsBySeller: vi.fn(async () => []),
  fetchOpenWants: vi.fn(async () => []),
  fetchWantablePlayers: vi.fn(async () => []),
}));

// The client components this page renders import "use server" modules; those
// reach server-only and cannot be loaded into jsdom.
vi.mock("@/lib/market/actions", () => ({
  createListing: vi.fn(),
  cancelListing: vi.fn(),
  buyListing: vi.fn(),
  createWant: vi.fn(),
  cancelWant: vi.fn(),
  fillWant: vi.fn(),
}));
vi.mock("@/lib/trades/actions", () => ({ fetchInventoryCardAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { MarketPageView } from "./page";

beforeEach(() => {
  getBettingUser.mockReset();
  fetchCardSeason.mockReset().mockResolvedValue("S5");
});

afterEach(cleanup);

describe("MarketPageView", () => {
  it("asks a signed-out visitor to sign in, and links back to the league they were on", async () => {
    getBettingUser.mockResolvedValue(null);

    render(await MarketPageView({ league: "academy" }));

    expect(screen.getByRole("heading", { name: /sign in to buy and sell/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /sign in with discord/i }).getAttribute("href")).toBe(
      "/login?redirect=/academy/cards/market",
    );
    // Nothing is read for a visitor who cannot see the board.
    expect(createBettingServiceClient).not.toHaveBeenCalled();
  });

  it("turns away a signed-in member without betting access", async () => {
    getBettingUser.mockResolvedValue({ discordId: "42", allowed: false });

    render(await MarketPageView({ league: "premier" }));

    expect(screen.getByRole("heading", { name: /members only/i })).toBeTruthy();
    expect(createBettingServiceClient).not.toHaveBeenCalled();
  });

  it("renders both boards for a member, and no league toggle of its own", async () => {
    getBettingUser.mockResolvedValue({ discordId: "42", allowed: true });

    render(await MarketPageView({ league: "premier" }));

    expect(screen.getByTestId("market-board")).toBeTruthy();
    expect(screen.getByTestId("list-card-form")).toBeTruthy();
    expect(screen.getByTestId("my-listings")).toBeTruthy();
    expect(screen.getByTestId("wants-board")).toBeTruthy();
    // The league switcher lives in the cards tab bar now (CardsTabs, from
    // the layout) — the page must not draw a second one.
    expect(screen.queryByRole("link", { name: "Academy" })).toBeNull();
  });
});
