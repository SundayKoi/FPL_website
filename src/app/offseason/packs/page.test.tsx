import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PackShop } from "@/lib/offseason/packShop";

const { loadOffseasonPage, loadPackShop } = vi.hoisted(() => ({ loadOffseasonPage: vi.fn(), loadPackShop: vi.fn() }));
vi.mock("@/lib/offseason/page", () => ({ loadOffseasonPage }));
vi.mock("@/lib/offseason/packShop", () => ({ loadPackShop, SHELF_LIMIT: 60 }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({})) }));
vi.mock("@/lib/offseason/actions", () => ({ openOffseasonPackAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/cards/PlayerCard3D", () => ({
  default: ({ card }: { card: { name: string } }) => <div data-testid="card">{card.name}</div>,
}));

import OffseasonPacksPage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const view = { event: { id: "event", name: "FPL Offseason Tournament", status: "running" } };
const shop = (overrides: Partial<PackShop> = {}): PackShop => ({
  set: { weekNumber: 1, size: 40, publishedAt: "2026-10-20T03:00:00Z" },
  remaining: 1500,
  copies: [],
  owned: 0,
  ...overrides,
});

describe("offseason packs page", () => {
  it("waits for the first set", async () => {
    loadOffseasonPage.mockResolvedValue({ view, userId: "me", isStaff: false, ownEntry: null });
    loadPackShop.mockResolvedValue(shop({ set: null }));
    render(await OffseasonPacksPage());
    expect(screen.getByText(/first set drops once week 1's games are in/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /open a pack/i })).toBeNull();
    expect(screen.getByRole("link", { name: "Packs" }).getAttribute("aria-current")).toBe("page");
  });

  it("asks visitors to sign in before opening", async () => {
    loadOffseasonPage.mockResolvedValue({ view, userId: null, isStaff: false, ownEntry: null });
    loadPackShop.mockResolvedValue(shop());
    render(await OffseasonPacksPage());
    expect(screen.getByText("Week 1 set · 40 cards")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login?redirect=/offseason/packs");
    expect(screen.queryByText("Your offseason cards")).toBeNull();
  });

  it("lets a member open packs and shows the cards they own", async () => {
    loadOffseasonPage.mockResolvedValue({ view, userId: "me", isStaff: false, ownEntry: null });
    loadPackShop.mockResolvedValue(
      shop({
        owned: 2,
        copies: [
          { id: 2, weekNumber: 1, foil: true, shiny: false, signed: false, card: { name: "Faker" } as PackShop["copies"][number]["card"] },
          { id: 1, weekNumber: 1, foil: false, shiny: false, signed: false, card: { name: "Chovy" } as PackShop["copies"][number]["card"] },
        ],
      }),
    );
    render(await OffseasonPacksPage());
    expect(screen.getByText("$1,500")).toBeTruthy();
    expect(screen.getByRole("button", { name: /open a pack · \$100/i })).toBeTruthy();
    expect(screen.getByText("2 owned")).toBeTruthy();
    expect(screen.getAllByTestId("card").map((card) => card.textContent)).toEqual(["Faker", "Chovy"]);
  });
});
